"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const crypto_1 = __importDefault(require("crypto"));
const connection_1 = __importDefault(require("./db/connection"));
const rateLimiting_1 = require("./middleware/rateLimiting");
const simpleCors_1 = require("./middleware/simpleCors");
const securityHeaders_1 = require("./middleware/securityHeaders");
const csrfProtection_1 = require("./middleware/csrfProtection");
const auditLogger_1 = require("./utils/auditLogger");
const entryRoutes_1 = __importDefault(require("./routes/entryRoutes"));
const winnerRoutes_1 = __importDefault(require("./routes/winnerRoutes"));
const lotteryRoutes_1 = __importDefault(require("./routes/lotteryRoutes"));
const cookieRoutes_1 = __importDefault(require("./routes/cookieRoutes"));
const projectionRoutes_1 = __importDefault(require("./routes/projectionRoutes"));
const twitterPoller_1 = require("./services/twitterPoller");
const validateEntries_1 = require("./services/validateEntries");
const fastDeleteSweep_1 = require("./services/fastDeleteSweep");
const rateLimiter_1 = require("./services/rateLimiter");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, securityHeaders_1.getSecurityHeaders)());
app.use(securityHeaders_1.logSecurityHeaders);
console.log("🔒 Security headers enabled: XSS, clickjacking, MIME sniffing protection");
(0, simpleCors_1.logCorsConfig)();
app.use(simpleCors_1.secureCorsMiddleware);
app.use((0, cookie_parser_1.default)());
app.use(rateLimiting_1.enhancedRateLimitMiddleware);
console.log("🔍 Enhanced rate limit fingerprinting enabled: Client identification and bypass prevention");
app.use(rateLimiting_1.generalRateLimit);
console.log("🛡️ Enhanced rate limiting enabled: Composite key (IP + fingerprint) with suspicious activity detection");
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
app.get("/health", rateLimiting_1.healthCheckRateLimit, (_req, res) => {
    const healthResponse = {
        status: "OK",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        message: "Server is running and ready to accept requests",
        uptime: process.uptime(),
        version: process.version,
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
app.get("/health/db", rateLimiting_1.healthCheckRateLimit, async (_req, res) => {
    try {
        const r = await connection_1.default.query("select now() as now, current_user as user");
        res.json({ ok: true, now: r.rows[0].now, user: r.rows[0].user });
    }
    catch (e) {
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(e, "Database health check failed");
        console.error("Database health check error:", logDetails);
        res.status(500).json({ ok: false, error: "Database health check failed" });
    }
});
app.get("/api/csrf-token", csrfProtection_1.getCsrfToken);
if (process.env.NODE_ENV !== "production") {
    app.get("/api/csrf-secret", csrfProtection_1.getCsrfSecret);
}
app.use(csrfProtection_1.provideCsrfToken);
console.log("🛡️ CSRF protection enabled for all state-changing operations");
app.use("/api", entryRoutes_1.default);
app.use("/api", winnerRoutes_1.default);
app.use("/api/lottery", lotteryRoutes_1.default);
app.use("/api", cookieRoutes_1.default);
app.use("/api", projectionRoutes_1.default);
app.use((_req, res) => res.status(404).json({ success: false, error: "Route not found" }));
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
});
const requiredEnvVars = {
    X_USER_ID: process.env.X_USER_ID,
    TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_API_KEY: process.env.ADMIN_API_KEY,
};
const recommendedEnvVars = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    VERCEL_APP_NAME: process.env.VERCEL_APP_NAME,
    CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN,
};
const missingVars = Object.entries(requiredEnvVars)
    .filter(([, v]) => !v)
    .map(([k]) => k);
if (missingVars.length) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(", ")}`);
    process.exit(1);
}
const jitter = (ms, j) => ms + crypto_1.default.randomInt(0, j);
const MIN2 = 120000;
const LOOKUP_TARGET = Number(process.env.LOOKUP_CALLS_PER_WINDOW || 12);
const MENTIONS_TARGET = Number(process.env.MENTIONS_CALLS_PER_WINDOW || 6);
const VALIDATE_DEFAULT = Math.max((0, rateLimiter_1.spacingMs)("lookup", Math.min(LOOKUP_TARGET, 8)), MIN2);
const DELETE_DEFAULT = Math.max((0, rateLimiter_1.spacingMs)("lookup", Math.min(LOOKUP_TARGET, 4)), 300000);
const MENTIONS_DEFAULT = Math.max((0, rateLimiter_1.spacingMs)("mentions", Math.min(MENTIONS_TARGET, 6)), MIN2);
const TWITTER_POLL_INTERVAL = Number(process.env.TWITTER_POLL_INTERVAL) || MENTIONS_DEFAULT;
const VALIDATE_ENTRIES_INTERVAL = Number(process.env.VALIDATE_ENTRIES_INTERVAL) || VALIDATE_DEFAULT;
const FAST_DELETE_SWEEP_INTERVAL = Number(process.env.FAST_DELETE_SWEEP_INTERVAL) || DELETE_DEFAULT;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || ""}`);
    console.log(`📡 Database connection configured`);
    console.log(`\n🔄 Initializing background services...`);
    startBackgroundServices();
});
async function startBackgroundServices() {
    let twitterPollerRunning = false;
    const twitterPollerTick = async () => {
        if (twitterPollerRunning)
            return;
        twitterPollerRunning = true;
        try {
            await (0, twitterPoller_1.pollMentions)();
        }
        catch (e) {
            console.error(`❌ [twitterPoller] tick failed:`, e);
        }
        finally {
            twitterPollerRunning = false;
        }
    };
    setInterval(twitterPollerTick, jitter(TWITTER_POLL_INTERVAL, 15000));
    void twitterPollerTick();
    console.log(`  ✅ twitterPoller scheduled (interval: ${TWITTER_POLL_INTERVAL}ms)`);
    let validateEntriesRunning = false;
    const validateEntriesTick = async () => {
        if (validateEntriesRunning)
            return;
        validateEntriesRunning = true;
        try {
            await (0, validateEntries_1.validateEntries)(false);
        }
        catch (e) {
            console.error(`❌ [validateEntries] tick failed:`, e);
        }
        finally {
            validateEntriesRunning = false;
        }
    };
    setInterval(validateEntriesTick, jitter(VALIDATE_ENTRIES_INTERVAL, 15000));
    setTimeout(() => void validateEntriesTick(), 10000);
    console.log(`  ✅ validateEntries scheduled (interval: ${VALIDATE_ENTRIES_INTERVAL}ms)`);
    let fastDeleteSweepRunning = false;
    const fastDeleteSweepTick = async () => {
        if (fastDeleteSweepRunning)
            return;
        fastDeleteSweepRunning = true;
        try {
            await (0, fastDeleteSweep_1.fastDeleteSweep)();
        }
        catch (e) {
            console.error(`❌ [fastDeleteSweep] tick failed:`, e);
        }
        finally {
            fastDeleteSweepRunning = false;
        }
    };
    if (FAST_DELETE_SWEEP_INTERVAL > 0) {
        setInterval(fastDeleteSweepTick, jitter(FAST_DELETE_SWEEP_INTERVAL, 15000));
        setTimeout(() => void fastDeleteSweepTick(), 20000);
        console.log(`  ✅ fastDeleteSweep scheduled (interval: ${FAST_DELETE_SWEEP_INTERVAL}ms)`);
    }
    else {
        console.log(`  ⏭ fastDeleteSweep disabled (FAST_DELETE_SWEEP_INTERVAL=0)`);
    }
    console.log(`\n📋 Background tasks summary:`);
    console.log(`  - twitterPoller: ~${Math.round(TWITTER_POLL_INTERVAL / 1000)}s`);
    console.log(`  - validateEntries: ~${Math.round(VALIDATE_ENTRIES_INTERVAL / 1000)}s`);
    console.log(`  - fastDeleteSweep: ~${Math.round(FAST_DELETE_SWEEP_INTERVAL / 1000)}s`);
    console.log(`\n🎉 All background services initialized successfully!`);
}
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    if (process.env.NODE_ENV === "production") {
        console.log("⚠️ Continuing execution despite unhandled rejection");
    }
    else {
        process.exit(1);
    }
});
if (process.stdin && process.stdin.readable) {
    process.stdin.on("error", (error) => {
        if (error.code === "EIO" || error.code === "EPIPE") {
            console.warn("⚠️ STDIN error (expected in containerized environments):", error.code);
        }
        else {
            console.error("❌ STDIN error:", error);
        }
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map