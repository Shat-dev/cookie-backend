"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectSuspiciousActivity = exports.createCompositeKey = exports.generateClientFingerprint = exports.burstProtectionRateLimit = exports.slidingWindowRateLimit = exports.healthCheckRateLimit = exports.entrySubmissionRateLimit = exports.publicDataRateLimit = exports.generalRateLimit = exports.enhancedRateLimitMiddleware = void 0;
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const crypto = __importStar(require("crypto"));
const generateClientFingerprint = (req) => {
    const components = [
        req.headers["user-agent"] || "",
        req.headers["accept-language"] || "",
        req.headers["accept-encoding"] || "",
        req.headers["accept"] || "",
    ];
    const fingerprint = crypto
        .createHash("sha256")
        .update(components.join("|"))
        .digest("hex")
        .substring(0, 16);
    return fingerprint;
};
exports.generateClientFingerprint = generateClientFingerprint;
const createCompositeKey = (req) => {
    const ip = req.ip || req.connection.remoteAddress || "unknown";
    const processedIp = (0, express_rate_limit_1.ipKeyGenerator)(ip);
    const fingerprint = req.fingerprint || generateClientFingerprint(req);
    return `${processedIp}:${fingerprint}`;
};
exports.createCompositeKey = createCompositeKey;
const detectSuspiciousActivity = (req) => {
    const userAgent = req.headers["user-agent"] || "";
    const ip = req.ip || "";
    const suspiciousPatterns = [
        !userAgent || userAgent.length < 10,
        /bot|crawler|spider|scraper/i.test(userAgent),
        /^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\.|^127\./i.test(ip),
        req.headers["x-forwarded-for"]?.includes(","),
    ];
    return suspiciousPatterns.some((pattern) => pattern);
};
exports.detectSuspiciousActivity = detectSuspiciousActivity;
const createEnhancedRateLimitMessage = (context) => {
    return (req, res) => {
        const ip = req.ip || req.connection.remoteAddress;
        const fingerprint = req.fingerprint || generateClientFingerprint(req);
        const isSuspicious = req.suspiciousActivity || detectSuspiciousActivity(req);
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
            referer: req.headers.referer,
            origin: req.headers.origin,
        });
        if (isSuspicious) {
            console.error(`🔒 [SECURITY] Suspicious rate limit bypass attempt detected`, {
                ip,
                fingerprint,
                context,
                timestamp: new Date().toISOString(),
            });
        }
        res.status(429).json({
            success: false,
            error: `Too many requests. Rate limit exceeded for ${context.toLowerCase()}.`,
            retryAfter: res.getHeader("Retry-After"),
            ...(isSuspicious && {
                warning: "Suspicious activity detected. Extended rate limiting applied.",
            }),
        });
    };
};
const enhancedRateLimitMiddleware = (req, res, next) => {
    req.fingerprint = generateClientFingerprint(req);
    req.suspiciousActivity = detectSuspiciousActivity(req);
    next();
};
exports.enhancedRateLimitMiddleware = enhancedRateLimitMiddleware;
exports.generalRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: (req) => {
        if (req.suspiciousActivity) {
            return 100;
        }
        return 1000;
    },
    keyGenerator: createCompositeKey,
    message: createEnhancedRateLimitMessage("General API"),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health" || req.path === "/health/db",
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
});
exports.publicDataRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: (req) => {
        if (req.suspiciousActivity) {
            return 20;
        }
        return 100;
    },
    keyGenerator: createCompositeKey,
    message: createEnhancedRateLimitMessage("Public Data API"),
    standardHeaders: true,
    legacyHeaders: false,
});
exports.entrySubmissionRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 10 * 60 * 1000,
    max: (req) => {
        if (req.suspiciousActivity) {
            return 1;
        }
        return 5;
    },
    keyGenerator: createCompositeKey,
    message: createEnhancedRateLimitMessage("Entry Submission"),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
});
exports.healthCheckRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: createEnhancedRateLimitMessage("Health Check"),
    standardHeaders: true,
    legacyHeaders: false,
});
exports.slidingWindowRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: (req) => {
        if (req.suspiciousActivity) {
            return 10;
        }
        return 50;
    },
    keyGenerator: createCompositeKey,
    message: createEnhancedRateLimitMessage("Sliding Window"),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
});
exports.burstProtectionRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 10 * 1000,
    max: (req) => {
        if (req.suspiciousActivity) {
            return 2;
        }
        return 10;
    },
    keyGenerator: createCompositeKey,
    message: createEnhancedRateLimitMessage("Burst Protection"),
    standardHeaders: true,
    legacyHeaders: false,
});
//# sourceMappingURL=rateLimiting.js.map