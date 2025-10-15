import "dotenv/config";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import pool from "./db/connection";
import {
  generalRateLimit,
  healthCheckRateLimit,
  enhancedRateLimitMiddleware,
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
import winnerRoutes from "./routes/winnerRoutes";
import lotteryRoutes from "./routes/lotteryRoutes";
import gachaRoutes from "./routes/cookieRoutes";
import automationRoutes from "./routes/automationRoutes";
import projectionRoutes from "./routes/projectionRoutes";

import { automatedLotteryService } from "./services/automatedLottery";
import { pollMentions } from "./services/twitterPoller";
import { validateEntries } from "./services/validateEntries";
import { fastDeleteSweep } from "./services/fastDeleteSweep";
import { spacingMs } from "./services/rateLimiter";
import { checkDatabaseHealth } from "./scripts/monitor-database-health";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 🟢 BOOT MARKER - Always visible on every deploy
console.log(
  "🟢 BOOT: app starting, commit=",
  process.env.RAILWAY_GIT_COMMIT || "unknown"
);
console.log("🟢 BOOT: NODE_ENV=", process.env.NODE_ENV || "development");
console.log("🟢 BOOT: NETWORK=", process.env.NETWORK || "not-set");

// 🔍 ENV DIAGNOSTICS: Check for potential RPC misconfigurations
console.log("\n🔍 ENV DIAGNOSTICS:");
console.log(
  "  BASE_SEPOLIA_RPC_URL:",
  process.env.BASE_SEPOLIA_RPC_URL ? "SET" : "NOT SET"
);
console.log(
  "  BASE_RPC_URL:",
  process.env.BASE_RPC_URL ? "SET (should be unused)" : "NOT SET"
);
console.log("  PRIVATE_KEY:", process.env.PRIVATE_KEY ? "SET" : "NOT SET");

// Check for potential mainnet URLs in Base Sepolia env
if (process.env.BASE_SEPOLIA_RPC_URL?.includes("mainnet")) {
  console.error(
    "🚨 WARNING: BASE_SEPOLIA_RPC_URL contains 'mainnet' - this should be a sepolia URL!"
  );
}

if (process.env.BASE_SEPOLIA_RPC_URL?.includes("8453")) {
  console.error(
    "🚨 WARNING: BASE_SEPOLIA_RPC_URL might be pointing to mainnet (chain 8453)!"
  );
}

console.log("");

// Apply security headers first
app.use(getSecurityHeaders());
app.use(logSecurityHeaders);
console.log(
  "🔒 Security headers enabled: XSS, clickjacking, MIME sniffing protection"
);

// Apply secure CORS configuration
logCorsConfig(); // Log the CORS configuration
app.use(secureCorsMiddleware);

// Cookie parser for CSRF tokens
app.use(cookieParser());

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
app.use("/api", winnerRoutes);
app.use("/api/lottery", lotteryRoutes);
app.use("/api", gachaRoutes);
app.use("/api/automation", automationRoutes);
app.use("/api", projectionRoutes);

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
  X_USER_ID: process.env.X_USER_ID,
  TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
};

// Optional but recommended environment variables for CORS
const recommendedEnvVars = {
  FRONTEND_URL: process.env.FRONTEND_URL,
  VERCEL_APP_NAME: process.env.VERCEL_APP_NAME,
  CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN,
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

// ---- Safe intervals using limiter math ----
const jitter = (ms: number, j: number) => ms + crypto.randomInt(0, j);
const MIN2 = 120_000;

const LOOKUP_TARGET = Number(process.env.LOOKUP_CALLS_PER_WINDOW || 12); // ≤ (cap-reserve)=12
const MENTIONS_TARGET = Number(process.env.MENTIONS_CALLS_PER_WINDOW || 6); // ≤ (cap-reserve)=9

const VALIDATE_DEFAULT = Math.max(
  spacingMs("lookup", Math.min(LOOKUP_TARGET, 8)),
  MIN2
); // ~≤8/15m
const DELETE_DEFAULT = Math.max(
  spacingMs("lookup", Math.min(LOOKUP_TARGET, 4)),
  300_000
); // ~≤4/15m
const MENTIONS_DEFAULT = Math.max(
  spacingMs("mentions", Math.min(MENTIONS_TARGET, 6)),
  MIN2
);

const TWITTER_POLL_INTERVAL =
  Number(process.env.TWITTER_POLL_INTERVAL) || MENTIONS_DEFAULT; // default ~2m+
const VALIDATE_ENTRIES_INTERVAL =
  Number(process.env.VALIDATE_ENTRIES_INTERVAL) || VALIDATE_DEFAULT; // default ~2m+
const FAST_DELETE_SWEEP_INTERVAL =
  Number(process.env.FAST_DELETE_SWEEP_INTERVAL) || DELETE_DEFAULT; // default ~5m+

// 🚀 START SERVER FIRST - Before any potentially blocking operations
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`✅ Health endpoint available at /health`);
  console.log(`📡 Database connection configured`);

  // Log configuration but don't test DB yet
  console.log(`  - FAST_DELETE_LIMIT: ${process.env.FAST_DELETE_LIMIT || 100}`);
  console.log(
    `  - VALIDATE_MAX_BATCHES_PER_RUN: ${
      process.env.VALIDATE_MAX_BATCHES_PER_RUN || 1
    }`
  );
  console.log(`🔒 CORS Configuration:`);
  console.log(
    `  - FRONTEND_URL: ${
      process.env.FRONTEND_URL ? "✅ Set" : "⚠️ Not set (using defaults)"
    }`
  );
  console.log(
    `  - VERCEL_APP_NAME: ${
      process.env.VERCEL_APP_NAME ? "✅ Set" : "⚠️ Not set (using default)"
    }`
  );
  console.log(
    `  - CUSTOM_DOMAIN: ${process.env.CUSTOM_DOMAIN ? "✅ Set" : "⚠️ Not set"}`
  );

  // 🔄 Start background services AFTER server is listening
  console.log(`\n🔄 Initializing background services...`);
  startBackgroundServices();
});

// 🔄 Separate function to start background services with error handling
async function startBackgroundServices() {
  try {
    console.log(
      `\n🤖 =================== ORCHESTRATOR STARTUP ===================`
    );
    console.log(`🤖 Starting AutomatedLotteryService...`);

    // Start the automated lottery service asynchronously
    automatedLotteryService.start();
    console.log(`🤖 ✅ AutomatedLotteryService started successfully`);
    console.log(
      `🤖 ============================================================\n`
    );
  } catch (error) {
    console.error(
      `🤖 ❌ CRITICAL: Failed to start AutomatedLotteryService:`,
      error
    );
    console.error(`🤖 This will prevent round creation and automation!`);
    // Don't crash the server - continue with other services
  }

  // twitterPoller
  let twitterPollerRunning = false;
  const twitterPollerTick = async () => {
    if (twitterPollerRunning) return;
    twitterPollerRunning = true;
    try {
      await pollMentions();
    } catch (e) {
      console.error(`❌ [twitterPoller] tick failed:`, e);
    } finally {
      twitterPollerRunning = false;
    }
  };
  setInterval(twitterPollerTick, jitter(TWITTER_POLL_INTERVAL, 15_000));
  void twitterPollerTick();
  console.log(
    `  ✅ twitterPoller scheduled (interval: ${TWITTER_POLL_INTERVAL}ms)`
  );

  // validateEntries
  let validateEntriesRunning = false;
  const validateEntriesTick = async () => {
    if (validateEntriesRunning) return;
    validateEntriesRunning = true;
    try {
      await validateEntries(false);
    } catch (e) {
      // ensure this does ≤1 lookup call (batch ids ≤100)
      console.error(`❌ [validateEntries] tick failed:`, e);
    } finally {
      validateEntriesRunning = false;
    }
  };
  setInterval(validateEntriesTick, jitter(VALIDATE_ENTRIES_INTERVAL, 15_000));
  setTimeout(() => void validateEntriesTick(), 10_000);
  console.log(
    `  ✅ validateEntries scheduled (interval: ${VALIDATE_ENTRIES_INTERVAL}ms)`
  );

  // fastDeleteSweep
  let fastDeleteSweepRunning = false;
  const fastDeleteSweepTick = async () => {
    if (fastDeleteSweepRunning) return;
    fastDeleteSweepRunning = true;
    try {
      await fastDeleteSweep();
    } catch (e) {
      // ensure this does ≤1 lookup call (batch ids ≤100)
      console.error(`❌ [fastDeleteSweep] tick failed:`, e);
    } finally {
      fastDeleteSweepRunning = false;
    }
  };
  if (FAST_DELETE_SWEEP_INTERVAL > 0) {
    setInterval(
      fastDeleteSweepTick,
      jitter(FAST_DELETE_SWEEP_INTERVAL, 15_000)
    );
    setTimeout(() => void fastDeleteSweepTick(), 20_000);
    console.log(
      `  ✅ fastDeleteSweep scheduled (interval: ${FAST_DELETE_SWEEP_INTERVAL}ms)`
    );
  } else {
    console.log(`  ⏭ fastDeleteSweep disabled (FAST_DELETE_SWEEP_INTERVAL=0)`);
  }

  // Database health monitoring
  let dbHealthRunning = false;
  const dbHealthTick = async () => {
    if (dbHealthRunning) return;
    dbHealthRunning = true;
    try {
      await checkDatabaseHealth();
    } catch (e) {
      console.error(`❌ [dbHealth] tick failed:`, e);
    } finally {
      dbHealthRunning = false;
    }
  };
  setInterval(dbHealthTick, 5 * 60_000); // Every 5 minutes
  setTimeout(() => void dbHealthTick(), 30_000); // First check after 30s
  console.log(`  ✅ Database health monitoring enabled (every 5 minutes)`);

  console.log(`\n📋 Background tasks summary:`);
  console.log(
    `  - twitterPoller: ~${Math.round(TWITTER_POLL_INTERVAL / 1000)}s`
  );
  console.log(
    `  - validateEntries: ~${Math.round(VALIDATE_ENTRIES_INTERVAL / 1000)}s`
  );
  console.log(
    `  - fastDeleteSweep: ~${Math.round(FAST_DELETE_SWEEP_INTERVAL / 1000)}s`
  );

  console.log(`\n🎉 All background services initialized successfully!`);
}

const shutdown = () => {
  console.log("🛑 Shutting down...");
  try {
    automatedLotteryService.stop();
    console.log("✅ Background services stopped");
  } catch (error) {
    console.error("⚠️ Error stopping background services:", error);
  }
  server.close(() => {
    console.log("✅ HTTP server closed");
    process.exit(0);
  });
};

// ✅ Enhanced process event handling to prevent crashes
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle uncaught exceptions gracefully
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  // In production, we should gracefully shutdown instead of crashing
  if (process.env.NODE_ENV === "production") {
    console.log("🔄 Attempting graceful shutdown...");
    shutdown();
  } else {
    process.exit(1);
  }
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
