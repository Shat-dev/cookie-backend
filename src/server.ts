import express from "express";
import cors from "cors";
import crypto from "crypto";
import env from "./utils/loadEnv";
import pool from "./db/connection";
import {
  generalRateLimit,
  healthCheckRateLimit,
  enhancedRateLimitMiddleware,
  publicDataRateLimit,
} from "./middleware/rateLimiting";
import { secureCorsMiddleware, logCorsConfig } from "./middleware/simpleCors";
import {
  getSecurityHeaders,
  logSecurityHeaders,
} from "./middleware/securityHeaders";
import {
  provideCsrfToken,
  getCsrfToken,
  getCsrfSecret,
} from "./middleware/csrfProtection";
import {
  sanitizeErrorResponse,
  createErrorResponse,
} from "./utils/auditLogger";

import entryRoutes from "./routes/entryRoutes";
import lotteryRoutes from "./routes/lotteryRoutes";
import cookieRoutes from "./routes/cookieRoutes";
import projectionRoutes from "./routes/projectionRoutes";
import { startServices } from "./services/startServices";
// Import network config to trigger startup logging
import "./utils/networkConfig";

// Import countdown controller functions
import {
  getCountdownStatus,
  startCountdownRound,
  resetCountdown,
} from "./scripts/manualCountdownController";
import { standardAdminProtection } from "./middleware/adminProtection";

const app = express();
const PORT = process.env.PORT || 3001;

// Log admin configuration for verification
const { ADMIN_API_KEY } = env;
console.log(
  `[ADMIN] Loaded ADMIN_API_KEY prefix: ${ADMIN_API_KEY.slice(0, 6)}...`
);

// Apply security headers first
app.use(getSecurityHeaders());
app.use(logSecurityHeaders);
console.log(
  "🔒 Security headers enabled: XSS, clickjacking, MIME sniffing protection"
);

app.set("trust proxy", 1);

// Apply secure CORS configuration
logCorsConfig(); // Log the CORS configuration
app.use(secureCorsMiddleware);

// Apply enhanced fingerprinting middleware before rate limiting
app.use(enhancedRateLimitMiddleware);
console.log(
  "🔍 Enhanced rate limit fingerprinting enabled: Client identification and bypass prevention"
);

// Apply general rate limiting to all routes with enhanced protection
app.use(generalRateLimit);
console.log(
  "🛡️ Enhanced rate limiting enabled: Composite key (IP + fingerprint) with suspicious activity detection"
);

// JSON body parsing with size limits to prevent DoS attacks
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Apply specific rate limiting to health endpoints
app.get("/health", healthCheckRateLimit, (_req, res) => {
  // 🚀 ALWAYS respond immediately - never wait for external dependencies
  const healthResponse = {
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    message: "Server is running and ready to accept requests",
    uptime: process.uptime(),
    version: process.version,
    // Quick internal checks that don't rely on external services
    checks: {
      memory: process.memoryUsage(),
      env_vars: {
        database_url: !!process.env.DATABASE_URL,
        twitter_token: !!process.env.TWITTER_BEARER_TOKEN,
        admin_key: !!process.env.ADMIN_API_KEY,
      },
    },
  };

  res.json(healthResponse);
});

app.get("/health/db", healthCheckRateLimit, async (_req, res) => {
  try {
    const r = await pool.query("select now() as now, current_user as user");
    res.json({ ok: true, now: r.rows[0].now, user: r.rows[0].user });
  } catch (e: any) {
    const { logDetails } = sanitizeErrorResponse(
      e,
      "Database health check failed"
    );
    console.error("Database health check error:", logDetails);
    res.status(500).json({ ok: false, error: "Database health check failed" });
  }
});

// CSRF token endpoints (must be before CSRF protection)
app.get("/api/csrf-token", getCsrfToken);

// CSRF secret endpoint - ONLY available in development for security
if (process.env.NODE_ENV !== "production") {
  app.get("/api/csrf-secret", getCsrfSecret); // Development only
}

// Apply CSRF token provider to all GET requests
app.use(provideCsrfToken);

console.log("🛡️ CSRF protection enabled for all state-changing operations");

app.use("/api", entryRoutes);
app.use("/api/lottery", lotteryRoutes);
app.use("/api", cookieRoutes);
app.use("/api", projectionRoutes);

// Countdown routes
app.get("/api/countdown", publicDataRateLimit, getCountdownStatus);

// Admin routes for countdown management
app.post(
  "/api/admin/start-round",
  standardAdminProtection(),
  startCountdownRound
);
app.post(
  "/api/admin/reset-countdown",
  standardAdminProtection(),
  resetCountdown
);

// Admin route for manual VRF draw execution
app.post(
  "/api/admin/manual-vrf-draw",
  standardAdminProtection({
    auditAction: "DRAW_WINNER" as any,
    securityLevel: "critical",
  }),
  async (req, res) => {
    try {
      console.log("🎲 [ADMIN VRF_CALL] Manual VRF draw requested by admin");

      const { executeVrfDraw } = await import("./services/vrfDrawService");

      const result = await executeVrfDraw(
        req.ip || req.connection.remoteAddress,
        req.headers["user-agent"]
      );

      if (result.success) {
        console.log(`✅ [ADMIN VRF_CALL] VRF draw completed: ${result.txHash}`);
        res.json({
          success: true,
          txHash: result.txHash,
          winnerAddress: result.winnerAddress,
          winningTokenId: result.winningTokenId,
          roundId: result.roundId,
          roundNumber: result.roundNumber,
          message: result.message,
        });
      } else {
        console.error(`❌ [ADMIN VRF_CALL] VRF draw failed: ${result.error}`);
        res.status(500).json({
          success: false,
          error: result.error || "VRF draw execution failed",
          message: result.message,
        });
      }
    } catch (error: any) {
      console.error(
        "❌ [ADMIN VRF_CALL] Critical error in VRF endpoint:",
        error
      );
      res.status(500).json({
        success: false,
        error: "Internal server error during VRF execution",
        code: "VRF_EXECUTION_ERROR",
      });
    }
  }
);

// Admin route for X API calls execution
app.post(
  "/api/admin/run-x-api-calls",
  standardAdminProtection({
    auditAction: "RUN_X_API_CALLS" as any,
    securityLevel: "high",
  }),
  async (req, res) => {
    try {
      console.log("📡 [ADMIN X_API] X API calls requested by admin");

      const { executeXApiCalls } = await import("./services/xApiService");

      const result = await executeXApiCalls(
        req.ip || req.connection.remoteAddress,
        req.headers["user-agent"]
      );

      if (result.success) {
        console.log(
          `✅ [ADMIN X_API] X API calls completed: ${result.message}`
        );
        res.json({
          success: true,
          totalDuration: result.totalDuration,
          functionsExecuted: result.functionsExecuted,
          successCount: result.successCount,
          failureCount: result.failureCount,
          results: result.results,
          message: result.message,
        });
      } else {
        console.error(`❌ [ADMIN X_API] X API calls failed: ${result.error}`);
        res.status(500).json({
          success: false,
          error: result.error || "X API calls execution failed",
          message: result.message,
          results: result.results,
        });
      }
    } catch (error: any) {
      console.error(
        "❌ [ADMIN X_API] Critical error in X API endpoint:",
        error
      );
      res.status(500).json({
        success: false,
        error: "Internal server error during X API execution",
        code: "X_API_EXECUTION_ERROR",
      });
    }
  }
);

app.use((_req, res) =>
  res.status(404).json({ success: false, error: "Route not found" })
);
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
);

const requiredEnvVars = {
  X_USER_ID: env.X_USER_ID,
  TWITTER_BEARER_TOKEN: env.TWITTER_BEARER_TOKEN,
  DATABASE_URL: env.DATABASE_URL,
  ADMIN_API_KEY: env.ADMIN_API_KEY,
  // Network configuration (network name, chain ID, lottery address, and cookie address come from JSON files)
  RPC_URL: env.RPC_URL,
};

// Optional but recommended environment variables for CORS
const recommendedEnvVars = {
  FRONTEND_URL: env.FRONTEND_URL,
  VERCEL_APP_NAME: env.VERCEL_APP_NAME,
  CUSTOM_DOMAIN: env.CUSTOM_DOMAIN,
};
const missingVars = Object.entries(requiredEnvVars)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missingVars.length) {
  console.error(
    `❌ Missing required environment variables: ${missingVars.join(", ")}`
  );
  process.exit(1);
}

// 🚀 START SERVER FIRST - Before any potentially blocking operations
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || ""}`);
  console.log(`📡 Database connection configured`);

  // 🔄 Start background services AFTER server is listening
  startServices();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  // In production, log the error but don't crash
  if (process.env.NODE_ENV === "production") {
    console.log("⚠️ Continuing execution despite unhandled rejection");
  } else {
    process.exit(1);
  }
});

// Handle STDIN errors (like EIO) gracefully
if (process.stdin && process.stdin.readable) {
  process.stdin.on("error", (error: any) => {
    if (error.code === "EIO" || error.code === "EPIPE") {
      console.warn(
        "⚠️ STDIN error (expected in containerized environments):",
        error.code
      );
      // Don't crash for these expected errors in production containers
    } else {
      console.error("❌ STDIN error:", error);
    }
  });
}

export default app;
