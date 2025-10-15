import helmet from "helmet";
import crypto from "crypto";

/**
 * Comprehensive security headers configuration using helmet
 * Protects against XSS, clickjacking, MIME sniffing, and other client-side attacks
 */

const getAllowedDomains = (): string[] => {
  const domains: string[] = [];

  // Always include localhost for development
  domains.push("localhost:3000", "127.0.0.1:3000");

  // Add production domains
  if (process.env.FRONTEND_URL) {
    const url = new URL(process.env.FRONTEND_URL);
    domains.push(url.host);
  }

  if (process.env.VERCEL_APP_NAME) {
    domains.push(`${process.env.VERCEL_APP_NAME}.vercel.app`);
  }

  if (process.env.CUSTOM_DOMAIN) {
    domains.push(process.env.CUSTOM_DOMAIN);
  }

  return domains;
};

/**
 * Production security headers configuration
 */
export const productionSecurityHeaders = helmet({
  // Content Security Policy - prevents XSS and code injection
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for API responses
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"], // Allow images from HTTPS and data URLs
      connectSrc: ["'self'", ...getAllowedDomains().map((d) => `https://${d}`)],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"], // Prevent embedding in frames
    },
  },

  // Prevent clickjacking attacks
  frameguard: {
    action: "deny", // Completely prevent framing
  },

  // Prevent MIME type sniffing
  noSniff: true,

  // Force HTTPS in production
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // Prevent IE from executing downloads in site's context
  ieNoOpen: true,

  // Remove X-Powered-By header
  hidePoweredBy: true,

  // Prevent opening of downloads in IE
  xssFilter: true,

  // Referrer policy - control how much referrer info is sent
  referrerPolicy: {
    policy: "strict-origin-when-cross-origin",
  },

  // Prevent DNS prefetching
  dnsPrefetchControl: {
    allow: false,
  },

  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: false, // Disable to avoid breaking API functionality

  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: {
    policy: "cross-origin", // Allow cross-origin requests (we handle this with CORS)
  },
});

/**
 * Development security headers configuration (more permissive)
 */
export const developmentSecurityHeaders = helmet({
  contentSecurityPolicy: false, // Disable CSP in development for easier debugging
  frameguard: {
    action: "sameorigin", // More permissive for development
  },
  noSniff: true,
  hsts: false, // No HTTPS enforcement in development
  ieNoOpen: true,
  hidePoweredBy: true,
  xssFilter: true,
  referrerPolicy: {
    policy: "no-referrer-when-downgrade",
  },
  dnsPrefetchControl: {
    allow: true, // Allow in development
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: {
    policy: "cross-origin",
  },
});

/**
 * Get appropriate security headers based on environment
 */
export const getSecurityHeaders = () => {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    console.log("🔒 [SECURITY] Using PRODUCTION security headers (strict)");
    console.log("🔒 [SECURITY] CSP domains:", getAllowedDomains());
    return productionSecurityHeaders;
  } else {
    console.log(
      "🔓 [SECURITY] Using DEVELOPMENT security headers (permissive)"
    );
    return developmentSecurityHeaders;
  }
};

/**
 * Custom middleware to log security header application
 */
export const logSecurityHeaders = (req: any, res: any, next: any) => {
  const originalSend = res.send;

  res.send = function (body: any) {
    // Log security headers being applied (only for first few requests to avoid spam)
    if (crypto.randomInt(1, 101) <= 1) {
      // 1% sampling to avoid log spam
      console.log(
        `🔒 [SECURITY] Headers applied to ${req.method} ${req.path}`,
        {
          timestamp: new Date().toISOString(),
          headers: {
            "X-Content-Type-Options": res.get("X-Content-Type-Options"),
            "X-Frame-Options": res.get("X-Frame-Options"),
            "X-XSS-Protection": res.get("X-XSS-Protection"),
            "Strict-Transport-Security": res.get("Strict-Transport-Security"),
            "Referrer-Policy": res.get("Referrer-Policy"),
          },
        }
      );
    }

    return originalSend.call(this, body);
  };

  next();
};
