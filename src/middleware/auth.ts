import { Request, Response, NextFunction } from "express";
import { auditSecurity, AuditActionType } from "../utils/auditLogger";
import crypto from "crypto";

interface AuthenticatedRequest extends Request {
  isAdmin?: boolean;
}

/**
 * Middleware to require admin authentication via API key
 * Usage: Apply to admin-only POST endpoints
 * Header format: Authorization: Bearer <ADMIN_API_KEY>
 */
export const requireAdminAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const adminApiKey = process.env.ADMIN_API_KEY;

  // Check if admin API key is configured
  if (!adminApiKey) {
    console.error("🚨 [AUTH] ADMIN_API_KEY not configured in environment");
    return res.status(500).json({
      success: false,
      error:
        "Server configuration error - authentication not properly configured",
    });
  }

  // Check if authorization header exists
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn(
      `🚨 [AUTH] Unauthorized admin access attempt from IP: ${
        req.ip || req.connection.remoteAddress
      } - Missing/invalid authorization header`
    );
    return res.status(401).json({
      success: false,
      error:
        "Authorization required. Include header: Authorization: Bearer <api-key>",
    });
  }

  // Extract and validate API key
  const providedKey = authHeader.substring(7); // Remove 'Bearer '

  // Use timing-safe comparison to prevent timing attacks
  const isValidKey =
    providedKey &&
    crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(adminApiKey));

  if (!providedKey || !isValidKey) {
    // Enhanced security logging using audit system
    auditSecurity(AuditActionType.AUTH_FAILURE, req, {
      reason: "invalid_api_key",
      provided_key_length: providedKey?.length || 0,
      endpoint: `${req.method} ${req.path}`,
      attempt_time: new Date().toISOString(),
    });

    return res.status(403).json({
      success: false,
      error: "Invalid API key",
    });
  }

  // Log successful admin authentication
  console.log(
    `🔐 [ADMIN AUTH] Admin authenticated for ${req.method} ${req.path}`,
    {
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      endpoint: `${req.method} ${req.path}`,
    }
  );

  // Set admin flag and continue
  req.isAdmin = true;
  return next();
};

/**
 * Optional middleware for endpoints that can be used by both admin and public
 * Sets isAdmin flag if valid admin auth is provided, but doesn't block if missing
 */
export const optionalAdminAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (
    authHeader &&
    authHeader.startsWith("Bearer ") &&
    adminApiKey &&
    crypto.timingSafeEqual(
      Buffer.from(authHeader.substring(7)),
      Buffer.from(adminApiKey)
    )
  ) {
    req.isAdmin = true;
    console.log(
      `🔐 [ADMIN AUTH] Optional admin auth successful for ${req.method} ${req.path}`
    );
  }

  return next();
};
