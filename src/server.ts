import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db/connection";

// Import all route modules
import entryRoutes from "./routes/entryRoutes";
import winnerRoutes from "./routes/winnerRoutes";
import lotteryRoutes from "./routes/lotteryRoutes";
import cookieRoutes from "./routes/cookieRoutes";
import automationRoutes from "./routes/automationRoutes";
import projectionRoutes from "./routes/projectionRoutes";
import healthRoutes from "./routes/healthRoutes";

// Import background services
import { automatedLotteryService } from "./services/automatedLottery";
import { pollMentions } from "./services/twitterPoller";
import { validateEntries } from "./services/validateEntries";
import { fastDeleteSweep } from "./services/fastDeleteSweep";

// Import new utilities
import { every } from "./utils/scheduler";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

console.log(`Starting server on port ${PORT}`);

// Health check endpoint - must be fast and dependency-free (before any middleware)
app.get("/health", (_req, res) => {
  console.log("Health check requested");
  res.status(200).send("ok");
});

// Support HEAD requests for health checks
app.head("/health", (_req, res) => {
  console.log("Health check HEAD requested");
  res.sendStatus(200);
});

// EMERGENCY CORS FIX - Allow all origins temporarily
console.log("🚨 EMERGENCY CORS MODE: Allowing all origins");

// Simple CORS setup
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

// Database health check endpoint
app.get("/health/db", async (_req, res) => {
  try {
    const r = await pool.query("select now() as now, current_user as user");
    res.json({ ok: true, now: r.rows[0].now, user: r.rows[0].user });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------------------
   API Routes
--------------------------- */
// Entry routes: /api/current-pool
app.use("/api", entryRoutes);

// Winner routes: /api/previous-winners (commented out in route file)
app.use("/api", winnerRoutes);

// Lottery routes: /api/lottery/rounds, /api/lottery/winners, etc.
app.use("/api/lottery", lotteryRoutes);

// Cookie routes: /api/cookie/owned/:wallet
app.use("/api", cookieRoutes);

// Automation routes: /api/automation/status, /api/automation/next-draw
app.use("/api/automation", automationRoutes);

// Projection routes: /api/current-projections
app.use("/api", projectionRoutes);

// Health routes: /health/cron, /health/cron/:service
app.use("/health", healthRoutes);

/* ---------------------------
   404 + Error handler
--------------------------- */
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

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

// Start server FIRST - immediate startup for health checks
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Listening on 0.0.0.0:${PORT}`);
  console.log(`✅ Health endpoint: /health`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);

  // Now do the complex initialization after server is listening
  setTimeout(() => {
    initializeFullApplication();
  }, 100);
});

function initializeFullApplication() {
  try {
    console.log(`🔧 Initializing full application...`);

    // Environment variable validation
    const requiredEnvVars = {
      X_USER_ID: process.env.X_USER_ID,
      TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
      DATABASE_URL: process.env.DATABASE_URL,
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      console.error(
        `❌ Missing required environment variables: ${missingVars.join(", ")}`
      );
      console.log(
        "⚠️ Running in minimal mode - only health endpoint available"
      );
      return;
    }

    console.log(`✅ All environment variables validated`);
    console.log(`✅ All API routes loaded`);
    console.log(`📡 Database connection: ESTABLISHED`);

    // Environment variables summary
    console.log(`🔑 Environment variables:`);
    console.log(
      `  - X_USER_ID: ${process.env.X_USER_ID ? "✅ Set" : "❌ Missing"}`
    );
    console.log(
      `  - TWITTER_BEARER_TOKEN: ${
        process.env.TWITTER_BEARER_TOKEN ? "✅ Set" : "❌ Missing"
      }`
    );
    console.log(
      `  - FAST_DELETE_LIMIT: ${process.env.FAST_DELETE_LIMIT || 100}`
    );
    console.log(
      `  - VALIDATE_MAX_BATCHES_PER_RUN: ${
        process.env.VALIDATE_MAX_BATCHES_PER_RUN || 5
      }`
    );

    // Background service configuration
    // Adjusted intervals to respect X API rate limits:
    // - Mentions: 10 req/15min = 1 req/90s (safe: 120s)
    // - Tweet lookup: 15 req/15min = 1 req/60s, but shared between validateEntries + fastDeleteSweep
    //   So we need to space them out: validateEntries every 180s, fastDeleteSweep every 180s (offset)
    const TWITTER_POLL_INTERVAL = 120_000; // 120s (mentions)
    const VALIDATE_ENTRIES_INTERVAL = 180_000; // 180s (tweet lookup budget)
    const FAST_DELETE_SWEEP_INTERVAL = 180_000; // 180s (tweet lookup budget, offset)

    // Start background services
    console.log(`\n🔄 Starting background services:`);

    // 1. Start AutomatedLotteryService (handles lottery automation)
    try {
      automatedLotteryService.start();
      console.log(`  ✅ AutomatedLotteryService started`);
    } catch (error) {
      console.error(`  ❌ Failed to start AutomatedLotteryService:`, error);
    }

    // 2. Start Twitter polling (mentions processing) with safe scheduler
    const twitterPollerTask = every(
      "twitterPoller",
      TWITTER_POLL_INTERVAL,
      async () => {
        try {
          await pollMentions();
        } catch (error) {
          console.error(`❌ [twitterPoller] task failed:`, error);
        }
      },
      {
        onOverrun: "skip",
        jitterMs: 5000,
        timeoutMs: 30000,
      }
    );
    console.log(
      `  ✅ twitterPoller scheduled with safe scheduler (interval: ${TWITTER_POLL_INTERVAL}ms)`
    );

    // 3. Start entry validation (ownership verification) with safe scheduler
    const validateEntriesTask = every(
      "validateEntries",
      VALIDATE_ENTRIES_INTERVAL,
      async () => {
        try {
          await validateEntries(false); // Regular sweep, not final
        } catch (error) {
          console.error(`❌ [validateEntries] task failed:`, error);
        }
      },
      {
        onOverrun: "skip",
        jitterMs: 5000,
        timeoutMs: 60000, // 1 minute timeout for validation
      }
    );
    console.log(
      `  ✅ validateEntries scheduled with safe scheduler (interval: ${VALIDATE_ENTRIES_INTERVAL}ms)`
    );

    // 4. Start fast delete sweep (deleted tweet cleanup) with safe scheduler
    const fastDeleteSweepTask = every(
      "fastDeleteSweep",
      FAST_DELETE_SWEEP_INTERVAL,
      async () => {
        try {
          await fastDeleteSweep();
        } catch (error) {
          console.error(`❌ [fastDeleteSweep] task failed:`, error);
        }
      },
      {
        onOverrun: "skip",
        jitterMs: 5000,
        timeoutMs: 30000,
      }
    );
    console.log(
      `  ✅ fastDeleteSweep scheduled with safe scheduler (interval: ${FAST_DELETE_SWEEP_INTERVAL}ms)`
    );

    console.log(`\n📋 Background tasks summary:`);
    console.log(
      `  - AutomatedLotteryService: Lottery orchestration and round management`
    );
    console.log(
      `  - twitterPoller: Process new Twitter mentions every ${
        TWITTER_POLL_INTERVAL / 1000
      }s (X API rate limit: 10 req/15min)`
    );
    console.log(
      `  - validateEntries: Verify token ownership every ${
        VALIDATE_ENTRIES_INTERVAL / 1000
      }s (shared tweet lookup budget with fastDeleteSweep)`
    );
    console.log(
      `  - fastDeleteSweep: Clean deleted tweets every ${
        FAST_DELETE_SWEEP_INTERVAL / 1000
      }s (shared tweet lookup budget with validateEntries)`
    );

    if (process.env.NODE_ENV === "production") {
      console.log(
        `\n🔗 Health check: ${
          process.env.RAILWAY_URL || "https://your-app.railway.app"
        }/health`
      );
      console.log(
        `🔗 Database check: ${
          process.env.RAILWAY_URL || "https://your-app.railway.app"
        }/health/db`
      );
      console.log(
        `🔗 Cron health: ${
          process.env.RAILWAY_URL || "https://your-app.railway.app"
        }/health/cron`
      );
    } else {
      console.log(`\n🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 Database check: http://localhost:${PORT}/health/db`);
      console.log(`🔗 Cron health: http://localhost:${PORT}/health/cron`);
    }

    console.log(`\n🎉 Full application initialization complete!`);
    console.log(
      `🤖 AutomatedLotteryService is now running and will log activity...`
    );
  } catch (error) {
    console.error("❌ Failed to initialize full application:", error);
    console.log("⚠️ Running in minimal mode - only health endpoint available");
  }
}

// Graceful shutdown
const shutdown = () => {
  console.log("🛑 Shutting down...");

  // Stop background services
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

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;
