import { Request, Response, NextFunction } from "express";

/**
 * Simple, secure CORS middleware with environment-based origin control
 * Replaces the dangerous "emergency CORS mode"
 */

const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];

  // Always allow localhost for development and local testing
  // This is safe because localhost can only be accessed locally
  origins.push(
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001"
  );

  // Helper function to add both versions of a URL (with and without trailing slash)
  const addOriginVariants = (url: string) => {
    // Remove trailing slash if present and add the base URL
    const baseUrl = url.replace(/\/$/, "");
    origins.push(baseUrl);

    // Also add version with trailing slash if it doesn't already have one
    if (!url.endsWith("/")) {
      origins.push(url + "/");
    }
  };

  // Production frontend URL
  if (process.env.FRONTEND_URL) {
    addOriginVariants(process.env.FRONTEND_URL);
  }

  // Vercel app URL
  if (process.env.VERCEL_APP_NAME) {
    addOriginVariants(`https://${process.env.VERCEL_APP_NAME}.vercel.app`);
  }

  // Custom domain
  if (process.env.CUSTOM_DOMAIN) {
    addOriginVariants(`https://${process.env.CUSTOM_DOMAIN}`);
  }

  return origins;
};

export const secureCorsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();

  // Set basic CORS headers
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control"
  );
  res.header(
    "Access-Control-Expose-Headers",
    "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After"
  );
  res.header("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight OPTIONS requests
  if (req.method === "OPTIONS") {
    if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
      console.log("🔒 [CORS] OPTIONS request with no origin - allowing");
      return res.status(200).end();
    }

    if (allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
      console.log(`✅ [CORS] OPTIONS allowed for origin: ${origin}`);
      return res.status(200).end();
    } else {
      console.warn(`🚨 [CORS] OPTIONS blocked for origin: ${origin}`, {
        timestamp: new Date().toISOString(),
        blockedOrigin: origin,
        allowedOrigins,
      });
      return res.status(403).json({
        success: false,
        error: "Origin not allowed by CORS policy",
      });
    }
  }

  // Handle actual requests
  if (!origin) {
    // Allow requests with no origin (server-to-server, tools like Postman)
    res.header("Access-Control-Allow-Origin", "*");
    console.log("🔒 [CORS] Request with no origin - allowing");
    return next();
  }

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    console.log(`✅ [CORS] Origin allowed: ${origin}`);
    return next();
  } else {
    console.warn(`🚨 [CORS] Origin blocked: ${origin}`, {
      timestamp: new Date().toISOString(),
      blockedOrigin: origin,
      allowedOrigins,
      userAgent: req.headers["user-agent"],
      ip: req.ip || req.connection.remoteAddress,
    });

    return res.status(403).json({
      success: false,
      error: "Origin not allowed by CORS policy",
    });
  }
};

/**
 * Log current CORS configuration
 */
export const logCorsConfig = () => {
  const origins = getAllowedOrigins();
  console.log("🔒 [CORS] Security Configuration:");
  console.log(`🔒 [CORS] Environment: ${process.env.NODE_ENV}`);
  console.log("🔒 [CORS] Allowed origins:", origins);

  // Log custom domain status
  if (process.env.CUSTOM_DOMAIN) {
    console.log(
      `✅ [CORS] Custom domain configured: ${process.env.CUSTOM_DOMAIN}`
    );
    console.log(`✅ [CORS] Custom domain variants allowed:`);
    console.log(`   - https://${process.env.CUSTOM_DOMAIN}`);
    console.log(`   - https://${process.env.CUSTOM_DOMAIN}/`);
  } else if (process.env.NODE_ENV === "production") {
    console.warn("⚠️ [CORS] Custom domain not configured in production");
  }

  if (origins.length === 0) {
    console.error(
      "🚨 [CORS] WARNING: No origins configured! This will block all cross-origin requests."
    );
  }

  return origins;
};
