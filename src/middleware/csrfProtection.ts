import { Request, Response, NextFunction } from "express";
import Tokens from "csrf";
import {
  auditSecurity,
  auditWarning,
  AuditActionType,
} from "../utils/auditLogger";

// ===== CSRF TOKEN MANAGER =====
class CSRFTokenManager {
  private tokens: Tokens;
  private secret: string;

  constructor() {
    this.tokens = new Tokens();
    // Generate a secret for this server instance
    this.secret = this.tokens.secretSync();
  }

  /**
   * Generate a new CSRF token
   */
  generateToken(): string {
    return this.tokens.create(this.secret);
  }

  /**
   * Verify a CSRF token
   */
  verifyToken(token: string): boolean {
    return this.tokens.verify(this.secret, token);
  }

  /**
   * Get the secret (for debugging/testing only)
   */
  getSecret(): string {
    return this.secret;
  }
}

// Singleton instance
const csrfManager = new CSRFTokenManager();

// ===== CSRF MIDDLEWARE =====

/**
 * Middleware to provide CSRF token to clients
 * Adds token to response headers and cookies
 */
export const provideCsrfToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Generate a new token for this request
    const token = csrfManager.generateToken();

    // Set token in multiple ways for flexibility
    res.header("X-CSRF-Token", token);
    res.cookie("csrf-token", token, {
      httpOnly: false, // Allow JavaScript access for single-page apps
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    // Also add to response locals for template rendering
    res.locals.csrfToken = token;

    next();
  } catch (error) {
    console.error("Error generating CSRF token:", error);
    next();
  }
};

/**
 * Middleware to validate CSRF tokens on state-changing requests
 * Should be applied to all POST, PUT, DELETE, PATCH requests
 */
export const validateCsrfToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Skip CSRF validation for trusted admin or automation routes
    if (req.path.startsWith("/api/admin")) {
      console.log(
        `⚙️ [CSRF] Skipping CSRF validation for admin route: ${req.path}`
      );
      return next();
    }

    // Skip CSRF validation for GET, HEAD, OPTIONS requests
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    // Extract token from multiple possible locations
    const token = extractCsrfToken(req);

    if (!token) {
      // Log security event for missing CSRF token
      auditSecurity(AuditActionType.AUTH_FAILURE, req, {
        reason: "missing_csrf_token",
        method: req.method,
        headers_checked: ["x-csrf-token", "csrf-token"],
        body_checked: ["_csrf", "csrf_token"],
        cookies_checked: ["csrf-token"],
      });

      return res.status(403).json({
        success: false,
        error: "CSRF token missing",
        code: "CSRF_TOKEN_MISSING",
        details: "Cross-site request forgery protection requires a valid token",
      });
    }

    // Verify the token
    const isValid = csrfManager.verifyToken(token);

    if (!isValid) {
      // Log security event for invalid CSRF token
      auditSecurity(AuditActionType.AUTH_FAILURE, req, {
        reason: "invalid_csrf_token",
        method: req.method,
        token_length: token.length,
        token_prefix: token.substring(0, 8),
        endpoint: `${req.method} ${req.path}`,
      });

      return res.status(403).json({
        success: false,
        error: "Invalid CSRF token",
        code: "CSRF_TOKEN_INVALID",
        details: "The provided CSRF token is not valid or has expired",
      });
    }

    // Token is valid - log successful validation for monitoring
    console.log(`🛡️ [CSRF] Valid token for ${req.method} ${req.path}`, {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    });

    next();
  } catch (error) {
    console.error("Error validating CSRF token:", error);

    auditSecurity(AuditActionType.AUTH_FAILURE, req, {
      reason: "csrf_validation_error",
      error: error instanceof Error ? error.message : "Unknown error",
      method: req.method,
    });

    return res.status(500).json({
      success: false,
      error: "Internal server error",
      code: "CSRF_VALIDATION_ERROR",
    });
  }
};

/**
 * Extract CSRF token from request headers, body, or cookies
 */
function extractCsrfToken(req: Request): string | null {
  // Check headers (most common for API requests)
  const headerToken = req.headers["x-csrf-token"] || req.headers["csrf-token"];
  if (headerToken && typeof headerToken === "string") {
    return headerToken;
  }

  // Check request body (for form submissions)
  if (req.body) {
    const bodyToken =
      req.body._csrf || req.body.csrf_token || req.body["csrf-token"];
    if (bodyToken && typeof bodyToken === "string") {
      return bodyToken;
    }
  }

  // Check cookies as fallback
  if (req.cookies && req.cookies["csrf-token"]) {
    return req.cookies["csrf-token"];
  }

  return null;
}

/**
 * Enhanced CSRF protection specifically for admin operations
 * Includes additional security checks and logging
 */
export const adminCsrfProtection = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // First run standard CSRF validation
    validateCsrfToken(req, res, (err) => {
      if (err || res.headersSent) {
        return; // CSRF validation failed, response already sent
      }

      // Additional admin-specific checks
      const origin = req.headers.origin;
      const referer = req.headers.referer;

      // Warn about missing origin/referer headers (potential attack)
      if (!origin && !referer) {
        // ✅ Skip warning for trusted admin or CLI calls authenticated via ADMIN_API_KEY
        const adminKey = req.headers["x-admin-key"] || req.headers["x-api-key"];
        if (adminKey === process.env.ADMIN_API_KEY) {
          return next(); // authenticated admin call → skip warning
        }

        auditWarning(
          AuditActionType.AUTH_FAILURE,
          req,
          "Admin request missing origin and referer headers - potential CSRF attack",
          {
            method: req.method,
            endpoint: req.path,
            user_agent: req.headers["user-agent"],
          }
        );
      }

      // Enhanced logging for admin CSRF protection
      console.log(`🔒 [ADMIN CSRF] Protected admin operation`, {
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection.remoteAddress,
        origin,
        referer,
        timestamp: new Date().toISOString(),
      });

      return next();
    });
  } catch (error) {
    console.error("Error in admin CSRF protection:", error);

    auditSecurity(AuditActionType.AUTH_FAILURE, req, {
      reason: "admin_csrf_protection_error",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    res.status(500).json({
      success: false,
      error: "Internal server error",
      code: "ADMIN_CSRF_ERROR",
    });
  }
};

/**
 * GET endpoint to retrieve CSRF token
 * Safe to call from any origin since it only provides a token
 */
export const getCsrfToken = (req: Request, res: Response) => {
  try {
    const token = csrfManager.generateToken();

    // Set token in response headers and cookies
    res.header("X-CSRF-Token", token);
    res.cookie("csrf-token", token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.json({
      success: true,
      csrf_token: token,
      expires_in: 15 * 60, // 15 minutes in seconds
      usage: {
        header: "Include as X-CSRF-Token header",
        cookie: "Automatically included in requests",
        body: "Include as _csrf or csrf_token field",
      },
    });
  } catch (error) {
    console.error("Error providing CSRF token:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

/**
 * Development/testing utility to get CSRF secret
 * ONLY enable in development mode
 */
export const getCsrfSecret = (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({
      success: false,
      error: "Endpoint not available in production",
    });
  }

  return res.json({
    success: true,
    secret: csrfManager.getSecret(),
    warning: "This endpoint is only available in development mode",
  });
};

// Export the manager for testing purposes
export { csrfManager };
