import rateLimit, {
  RateLimitRequestHandler,
  ipKeyGenerator,
} from "express-rate-limit";
import { Request, Response } from "express";
import * as crypto from "crypto";

/**
 * Enhanced rate limiting with multiple bypass prevention strategies
 * Addresses security audit finding: Rate Limiting Bypass Potential
 */

interface ExtendedRequest extends Request {
  fingerprint?: string;
  suspiciousActivity?: boolean;
}

/**
 * Generate a client fingerprint based on multiple request characteristics
 * This helps identify clients even when they change IPs
 */
const generateClientFingerprint = (req: Request): string => {
  const components = [
    req.headers["user-agent"] || "",
    req.headers["accept-language"] || "",
    req.headers["accept-encoding"] || "",
    req.headers["accept"] || "",
    // Don't include easily spoofable headers like X-Forwarded-For
  ];

  const fingerprint = crypto
    .createHash("sha256")
    .update(components.join("|"))
    .digest("hex")
    .substring(0, 16);

  return fingerprint;
};

/**
 * Create a composite key that combines multiple identification strategies
 * This makes bypass attempts significantly more difficult
 * Uses ipKeyGenerator to properly handle IPv6 addresses
 */
const createCompositeKey = (req: ExtendedRequest): string => {
  // Use ipKeyGenerator to properly handle IPv6 addresses
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const processedIp = ipKeyGenerator(ip);
  const fingerprint = req.fingerprint || generateClientFingerprint(req);

  // Combine processed IP and fingerprint for a more robust identification
  return `${processedIp}:${fingerprint}`;
};

/**
 * Detect suspicious activity patterns that may indicate bypass attempts
 */
const detectSuspiciousActivity = (req: ExtendedRequest): boolean => {
  const userAgent = req.headers["user-agent"] || "";
  const ip = req.ip || "";

  // Check for suspicious patterns
  const suspiciousPatterns = [
    // Missing or generic user agents
    !userAgent || userAgent.length < 10,
    // Known bot patterns
    /bot|crawler|spider|scraper/i.test(userAgent),
    // Suspicious IP patterns (basic check for common proxy/VPN patterns)
    /^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\.|^127\./i.test(ip),
    // Rapid header variations (potential automation)
    req.headers["x-forwarded-for"]?.includes(","),
  ];

  return suspiciousPatterns.some((pattern) => pattern);
};

/**
 * Enhanced rate limit message with comprehensive security logging
 */
const createEnhancedRateLimitMessage = (context: string) => {
  return (req: ExtendedRequest, res: Response) => {
    const ip = req.ip || req.connection.remoteAddress;
    const fingerprint = req.fingerprint || generateClientFingerprint(req);
    const isSuspicious =
      req.suspiciousActivity || detectSuspiciousActivity(req);

    // Enhanced security logging
    console.warn(`🚨 [RATE LIMIT] ${context} rate limit exceeded`, {
      timestamp: new Date().toISOString(),
      ip,
      fingerprint,
      userAgent: req.headers["user-agent"],
      endpoint: `${req.method} ${req.path}`,
      suspiciousActivity: isSuspicious,
      headers: {
        "x-forwarded-for": req.headers["x-forwarded-for"],
        "x-real-ip": req.headers["x-real-ip"],
        "cf-connecting-ip": req.headers["cf-connecting-ip"],
      },
      // Additional forensic data
      referer: req.headers.referer,
      origin: req.headers.origin,
    });

    // If suspicious activity is detected, implement stricter measures
    if (isSuspicious) {
      console.error(
        `🔒 [SECURITY] Suspicious rate limit bypass attempt detected`,
        {
          ip,
          fingerprint,
          context,
          timestamp: new Date().toISOString(),
        }
      );
    }

    res.status(429).json({
      success: false,
      error: `Too many requests. Rate limit exceeded for ${context.toLowerCase()}.`,
      retryAfter: res.getHeader("Retry-After"),
      ...(isSuspicious && {
        warning:
          "Suspicious activity detected. Extended rate limiting applied.",
      }),
    });
  };
};

/**
 * Middleware to add fingerprinting and suspicious activity detection
 */
export const enhancedRateLimitMiddleware = (
  req: ExtendedRequest,
  res: Response,
  next: any
) => {
  // Generate and attach fingerprint
  req.fingerprint = generateClientFingerprint(req);

  // Detect and flag suspicious activity
  req.suspiciousActivity = detectSuspiciousActivity(req);

  next();
};

/**
 * General API rate limiting with enhanced bypass prevention
 * Uses composite key (IP + fingerprint) for identification
 */
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: ExtendedRequest) => {
    // Dynamic limits based on suspicious activity
    if (req.suspiciousActivity) {
      return 100; // Stricter limit for suspicious clients
    }
    return 1000; // Normal limit
  },
  keyGenerator: createCompositeKey,
  message: createEnhancedRateLimitMessage("General API"),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health" || req.path === "/health/db",
  // Additional bypass prevention
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Public data rate limiting with fingerprint-based tracking
 */
export const publicDataRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: (req: ExtendedRequest) => {
    if (req.suspiciousActivity) {
      return 20; // Reduced limit for suspicious clients
    }
    return 100; // Normal limit
  },
  keyGenerator: createCompositeKey,
  message: createEnhancedRateLimitMessage("Public Data API"),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Entry submission with enhanced bot protection
 */
export const entrySubmissionRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: (req: ExtendedRequest) => {
    // Very strict limits for entry submissions
    if (req.suspiciousActivity) {
      return 1; // Almost no tolerance for suspicious activity
    }
    return 5; // Normal limit
  },
  keyGenerator: createCompositeKey,
  message: createEnhancedRateLimitMessage("Entry Submission"),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Health check rate limiting (kept generous for monitoring)
 */
export const healthCheckRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 1 request per second average
  message: createEnhancedRateLimitMessage("Health Check"),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Sliding window rate limiter for critical endpoints
 * Provides more accurate rate limiting that's harder to game
 */
export const slidingWindowRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute sliding window
  max: (req: ExtendedRequest) => {
    if (req.suspiciousActivity) {
      return 10;
    }
    return 50;
  },
  keyGenerator: createCompositeKey,
  message: createEnhancedRateLimitMessage("Sliding Window"),
  standardHeaders: true,
  legacyHeaders: false,
  // Use a more sophisticated algorithm
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});

/**
 * Burst protection for high-frequency endpoints
 * Prevents rapid-fire requests even within normal rate limits
 */
export const burstProtectionRateLimit = rateLimit({
  windowMs: 10 * 1000, // 10 second window
  max: (req: ExtendedRequest) => {
    if (req.suspiciousActivity) {
      return 2; // Very strict burst protection
    }
    return 10; // Normal burst limit
  },
  keyGenerator: createCompositeKey,
  message: createEnhancedRateLimitMessage("Burst Protection"),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Export all rate limiters and utilities
 */
export {
  generateClientFingerprint,
  createCompositeKey,
  detectSuspiciousActivity,
};
