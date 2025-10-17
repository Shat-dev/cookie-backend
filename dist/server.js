"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const connection_1 = __importDefault(require("./db/connection"));
const rateLimiting_1 = require("./middleware/rateLimiting");
const simpleCors_1 = require("./middleware/simpleCors");
const securityHeaders_1 = require("./middleware/securityHeaders");
const csrfProtection_1 = require("./middleware/csrfProtection");
const auditLogger_1 = require("./utils/auditLogger");
const entryRoutes_1 = __importDefault(require("./routes/entryRoutes"));
const lotteryRoutes_1 = __importDefault(require("./routes/lotteryRoutes"));
const cookieRoutes_1 = __importDefault(require("./routes/cookieRoutes"));
const projectionRoutes_1 = __importDefault(require("./routes/projectionRoutes"));
const startServices_1 = require("./services/startServices");
require("./utils/networkConfig");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, securityHeaders_1.getSecurityHeaders)());
app.use(securityHeaders_1.logSecurityHeaders);
console.log("🔒 Security headers enabled: XSS, clickjacking, MIME sniffing protection");
(0, simpleCors_1.logCorsConfig)();
app.use(simpleCors_1.secureCorsMiddleware);
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
app.use("/api/lottery", lotteryRoutes_1.default);
app.use("/api", cookieRoutes_1.default);
app.use("/api", projectionRoutes_1.default);
const manualCountdownController_1 = require("./scripts/manualCountdownController");
const adminProtection_1 = require("./middleware/adminProtection");
app.post("/api/admin/start-round", (0, adminProtection_1.standardAdminProtection)(), manualCountdownController_1.startCountdownRound);
app.post("/api/admin/reset-countdown", (0, adminProtection_1.standardAdminProtection)(), manualCountdownController_1.resetCountdown);
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
    RPC_URL: process.env.RPC_URL,
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
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || ""}`);
    console.log(`📡 Database connection configured`);
    (0, startServices_1.startServices)();
});
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