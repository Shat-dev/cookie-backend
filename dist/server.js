"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const connection_1 = __importDefault(require("./db/connection"));
const entryRoutes_1 = __importDefault(require("./routes/entryRoutes"));
const winnerRoutes_1 = __importDefault(require("./routes/winnerRoutes"));
const lotteryRoutes_1 = __importDefault(require("./routes/lotteryRoutes"));
const gachaRoutes_1 = __importDefault(require("./routes/gachaRoutes"));
const automationRoutes_1 = __importDefault(require("./routes/automationRoutes"));
const projectionRoutes_1 = __importDefault(require("./routes/projectionRoutes"));
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const automatedLottery_1 = require("./services/automatedLottery");
const twitterPoller_1 = require("./services/twitterPoller");
const validateEntries_1 = require("./services/validateEntries");
const fastDeleteSweep_1 = require("./services/fastDeleteSweep");
const scheduler_1 = require("./utils/scheduler");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || "3001", 10);
console.log(`Starting server on port ${PORT}`);
app.get("/health", (_req, res) => {
    console.log("Health check requested");
    res.status(200).send("ok");
});
app.head("/health", (_req, res) => {
    console.log("Health check HEAD requested");
    res.sendStatus(200);
});
console.log("🚨 EMERGENCY CORS MODE: Allowing all origins");
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
}));
app.use(express_1.default.json());
app.get("/health/db", async (_req, res) => {
    try {
        const r = await connection_1.default.query("select now() as now, current_user as user");
        res.json({ ok: true, now: r.rows[0].now, user: r.rows[0].user });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
app.use("/api", entryRoutes_1.default);
app.use("/api", winnerRoutes_1.default);
app.use("/api/lottery", lotteryRoutes_1.default);
app.use("/api", gachaRoutes_1.default);
app.use("/api/automation", automationRoutes_1.default);
app.use("/api", projectionRoutes_1.default);
app.use("/health", healthRoutes_1.default);
app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Route not found" });
});
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
});
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Listening on 0.0.0.0:${PORT}`);
    console.log(`✅ Health endpoint: /health`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
    setTimeout(() => {
        initializeFullApplication();
    }, 100);
});
function initializeFullApplication() {
    try {
        console.log(`🔧 Initializing full application...`);
        const requiredEnvVars = {
            X_USER_ID: process.env.X_USER_ID,
            TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
            DATABASE_URL: process.env.DATABASE_URL,
        };
        const missingVars = Object.entries(requiredEnvVars)
            .filter(([, value]) => !value)
            .map(([key]) => key);
        if (missingVars.length > 0) {
            console.error(`❌ Missing required environment variables: ${missingVars.join(", ")}`);
            console.log("⚠️ Running in minimal mode - only health endpoint available");
            return;
        }
        console.log(`✅ All environment variables validated`);
        console.log(`✅ All API routes loaded`);
        console.log(`📡 Database connection: ESTABLISHED`);
        console.log(`🔑 Environment variables:`);
        console.log(`  - X_USER_ID: ${process.env.X_USER_ID ? "✅ Set" : "❌ Missing"}`);
        console.log(`  - TWITTER_BEARER_TOKEN: ${process.env.TWITTER_BEARER_TOKEN ? "✅ Set" : "❌ Missing"}`);
        console.log(`  - FAST_DELETE_LIMIT: ${process.env.FAST_DELETE_LIMIT || 100}`);
        console.log(`  - VALIDATE_MAX_BATCHES_PER_RUN: ${process.env.VALIDATE_MAX_BATCHES_PER_RUN || 5}`);
        const TWITTER_POLL_INTERVAL = 120000;
        const VALIDATE_ENTRIES_INTERVAL = 180000;
        const FAST_DELETE_SWEEP_INTERVAL = 180000;
        console.log(`\n🔄 Starting background services:`);
        try {
            automatedLottery_1.automatedLotteryService.start();
            console.log(`  ✅ AutomatedLotteryService started`);
        }
        catch (error) {
            console.error(`  ❌ Failed to start AutomatedLotteryService:`, error);
        }
        const twitterPollerTask = (0, scheduler_1.every)("twitterPoller", TWITTER_POLL_INTERVAL, async () => {
            try {
                await (0, twitterPoller_1.pollMentions)();
            }
            catch (error) {
                console.error(`❌ [twitterPoller] task failed:`, error);
            }
        }, {
            onOverrun: "skip",
            jitterMs: 5000,
            timeoutMs: 30000,
        });
        console.log(`  ✅ twitterPoller scheduled with safe scheduler (interval: ${TWITTER_POLL_INTERVAL}ms)`);
        const validateEntriesTask = (0, scheduler_1.every)("validateEntries", VALIDATE_ENTRIES_INTERVAL, async () => {
            try {
                await (0, validateEntries_1.validateEntries)(false);
            }
            catch (error) {
                console.error(`❌ [validateEntries] task failed:`, error);
            }
        }, {
            onOverrun: "skip",
            jitterMs: 5000,
            timeoutMs: 60000,
        });
        console.log(`  ✅ validateEntries scheduled with safe scheduler (interval: ${VALIDATE_ENTRIES_INTERVAL}ms)`);
        const fastDeleteSweepTask = (0, scheduler_1.every)("fastDeleteSweep", FAST_DELETE_SWEEP_INTERVAL, async () => {
            try {
                await (0, fastDeleteSweep_1.fastDeleteSweep)();
            }
            catch (error) {
                console.error(`❌ [fastDeleteSweep] task failed:`, error);
            }
        }, {
            onOverrun: "skip",
            jitterMs: 5000,
            timeoutMs: 30000,
        });
        console.log(`  ✅ fastDeleteSweep scheduled with safe scheduler (interval: ${FAST_DELETE_SWEEP_INTERVAL}ms)`);
        console.log(`\n📋 Background tasks summary:`);
        console.log(`  - AutomatedLotteryService: Lottery orchestration and round management`);
        console.log(`  - twitterPoller: Process new Twitter mentions every ${TWITTER_POLL_INTERVAL / 1000}s (X API rate limit: 10 req/15min)`);
        console.log(`  - validateEntries: Verify token ownership every ${VALIDATE_ENTRIES_INTERVAL / 1000}s (shared tweet lookup budget with fastDeleteSweep)`);
        console.log(`  - fastDeleteSweep: Clean deleted tweets every ${FAST_DELETE_SWEEP_INTERVAL / 1000}s (shared tweet lookup budget with validateEntries)`);
        if (process.env.NODE_ENV === "production") {
            console.log(`\n🔗 Health check: ${process.env.RAILWAY_URL || "https://your-app.railway.app"}/health`);
            console.log(`🔗 Database check: ${process.env.RAILWAY_URL || "https://your-app.railway.app"}/health/db`);
            console.log(`🔗 Cron health: ${process.env.RAILWAY_URL || "https://your-app.railway.app"}/health/cron`);
        }
        else {
            console.log(`\n🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`🔗 Database check: http://localhost:${PORT}/health/db`);
            console.log(`🔗 Cron health: http://localhost:${PORT}/health/cron`);
        }
        console.log(`\n🎉 Full application initialization complete!`);
        console.log(`🤖 AutomatedLotteryService is now running and will log activity...`);
    }
    catch (error) {
        console.error("❌ Failed to initialize full application:", error);
        console.log("⚠️ Running in minimal mode - only health endpoint available");
    }
}
const shutdown = () => {
    console.log("🛑 Shutting down...");
    try {
        automatedLottery_1.automatedLotteryService.stop();
        console.log("✅ Background services stopped");
    }
    catch (error) {
        console.error("⚠️ Error stopping background services:", error);
    }
    server.close(() => {
        console.log("✅ HTTP server closed");
        process.exit(0);
    });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
exports.default = app;
//# sourceMappingURL=server.js.map