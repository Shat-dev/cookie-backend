"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logCorsConfig = exports.secureCorsMiddleware = void 0;
const getAllowedOrigins = () => {
    const origins = [];
    origins.push("http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001");
    const addOriginVariants = (url) => {
        const baseUrl = url.replace(/\/$/, "");
        origins.push(baseUrl);
        if (!url.endsWith("/")) {
            origins.push(url + "/");
        }
    };
    if (process.env.FRONTEND_URL) {
        addOriginVariants(process.env.FRONTEND_URL);
    }
    if (process.env.VERCEL_APP_NAME) {
        addOriginVariants(`https://${process.env.VERCEL_APP_NAME}.vercel.app`);
    }
    if (process.env.CUSTOM_DOMAIN) {
        addOriginVariants(`https://${process.env.CUSTOM_DOMAIN}`);
    }
    return origins;
};
const secureCorsMiddleware = (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = getAllowedOrigins();
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control");
    res.header("Access-Control-Expose-Headers", "RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After");
    res.header("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
        if (!origin) {
            res.header("Access-Control-Allow-Origin", "*");
            console.log("🔒 [CORS] OPTIONS request with no origin - allowing");
            return res.status(200).end();
        }
        if (allowedOrigins.includes(origin)) {
            res.header("Access-Control-Allow-Origin", origin);
            res.header("Access-Control-Allow-Credentials", "true");
            return res.status(200).end();
        }
        else {
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
    if (!origin) {
        res.header("Access-Control-Allow-Origin", "*");
        console.log("🔒 [CORS] Request with no origin - allowing");
        return next();
    }
    if (allowedOrigins.includes(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", "true");
        return next();
    }
    else {
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
exports.secureCorsMiddleware = secureCorsMiddleware;
const logCorsConfig = () => {
    const origins = getAllowedOrigins();
    console.log("🔒 [CORS] Security Configuration:");
    console.log(`🔒 [CORS] Environment: ${process.env.NODE_ENV}`);
    console.log("🔒 [CORS] Allowed origins:", origins);
    if (process.env.CUSTOM_DOMAIN) {
        console.log(`✅ [CORS] Custom domain configured: ${process.env.CUSTOM_DOMAIN}`);
        console.log(`✅ [CORS] Custom domain variants allowed:`);
        console.log(`   - https://${process.env.CUSTOM_DOMAIN}`);
        console.log(`   - https://${process.env.CUSTOM_DOMAIN}/`);
    }
    else if (process.env.NODE_ENV === "production") {
        console.warn("⚠️ [CORS] Custom domain not configured in production");
    }
    if (origins.length === 0) {
        console.error("🚨 [CORS] WARNING: No origins configured! This will block all cross-origin requests.");
    }
    return origins;
};
exports.logCorsConfig = logCorsConfig;
//# sourceMappingURL=simpleCors.js.map