"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAdminAuth = exports.requireAdminAuth = void 0;
const auditLogger_1 = require("../utils/auditLogger");
const crypto_1 = __importDefault(require("crypto"));
const requireAdminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const adminApiKey = process.env.ADMIN_API_KEY;
    if (!adminApiKey) {
        console.error("🚨 [AUTH] ADMIN_API_KEY not configured in environment");
        return res.status(500).json({
            success: false,
            error: "Server configuration error - authentication not properly configured",
        });
    }
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.warn(`🚨 [AUTH] Unauthorized admin access attempt from IP: ${req.ip || req.connection.remoteAddress} - Missing/invalid authorization header`);
        return res.status(401).json({
            success: false,
            error: "Authorization required. Include header: Authorization: Bearer <api-key>",
        });
    }
    const providedKey = authHeader.substring(7);
    const isValidKey = providedKey &&
        crypto_1.default.timingSafeEqual(Buffer.from(providedKey), Buffer.from(adminApiKey));
    if (!providedKey || !isValidKey) {
        (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
            reason: "invalid_api_key",
            provided_key_length: providedKey?.length || 0,
            endpoint: `${req.method} ${req.path}`,
            attempt_time: new Date().toISOString(),
        });
        return res.status(403).json({
            success: false,
            error: "Invalid API key",
        });
    }
    console.log(`🔐 [ADMIN AUTH] Admin authenticated for ${req.method} ${req.path}`, {
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
        endpoint: `${req.method} ${req.path}`,
    });
    req.isAdmin = true;
    return next();
};
exports.requireAdminAuth = requireAdminAuth;
const optionalAdminAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const adminApiKey = process.env.ADMIN_API_KEY;
    if (authHeader &&
        authHeader.startsWith("Bearer ") &&
        adminApiKey &&
        crypto_1.default.timingSafeEqual(Buffer.from(authHeader.substring(7)), Buffer.from(adminApiKey))) {
        req.isAdmin = true;
        console.log(`🔐 [ADMIN AUTH] Optional admin auth successful for ${req.method} ${req.path}`);
    }
    return next();
};
exports.optionalAdminAuth = optionalAdminAuth;
//# sourceMappingURL=auth.js.map