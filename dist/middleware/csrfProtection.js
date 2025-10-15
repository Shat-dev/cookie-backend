"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.csrfManager = exports.getCsrfSecret = exports.getCsrfToken = exports.adminCsrfProtection = exports.validateCsrfToken = exports.provideCsrfToken = void 0;
const csrf_1 = __importDefault(require("csrf"));
const auditLogger_1 = require("../utils/auditLogger");
class CSRFTokenManager {
    constructor() {
        this.tokens = new csrf_1.default();
        this.secret = this.tokens.secretSync();
    }
    generateToken() {
        return this.tokens.create(this.secret);
    }
    verifyToken(token) {
        return this.tokens.verify(this.secret, token);
    }
    getSecret() {
        return this.secret;
    }
}
const csrfManager = new CSRFTokenManager();
exports.csrfManager = csrfManager;
const provideCsrfToken = (req, res, next) => {
    try {
        const token = csrfManager.generateToken();
        res.header("X-CSRF-Token", token);
        res.cookie("csrf-token", token, {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });
        res.locals.csrfToken = token;
        next();
    }
    catch (error) {
        console.error("Error generating CSRF token:", error);
        next();
    }
};
exports.provideCsrfToken = provideCsrfToken;
const validateCsrfToken = (req, res, next) => {
    try {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
            return next();
        }
        const token = extractCsrfToken(req);
        if (!token) {
            (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
                reason: "missing_csrf_token",
                method: req.method,
                headers_checked: ["x-csrf-token", "csrf-token"],
                body_checked: ["_csrf", "csrf_token"],
                cookies_checked: ["csrf-token"],
            });
            return res.status(403).json({
                success: false,
                error: "CSRF token missing",
                code: "CSRF_TOKEN_MISSING",
                details: "Cross-site request forgery protection requires a valid token",
            });
        }
        const isValid = csrfManager.verifyToken(token);
        if (!isValid) {
            (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
                reason: "invalid_csrf_token",
                method: req.method,
                token_length: token.length,
                token_prefix: token.substring(0, 8),
                endpoint: `${req.method} ${req.path}`,
            });
            return res.status(403).json({
                success: false,
                error: "Invalid CSRF token",
                code: "CSRF_TOKEN_INVALID",
                details: "The provided CSRF token is not valid or has expired",
            });
        }
        console.log(`🛡️ [CSRF] Valid token for ${req.method} ${req.path}`, {
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.headers["user-agent"],
            timestamp: new Date().toISOString(),
        });
        next();
    }
    catch (error) {
        console.error("Error validating CSRF token:", error);
        (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
            reason: "csrf_validation_error",
            error: error instanceof Error ? error.message : "Unknown error",
            method: req.method,
        });
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            code: "CSRF_VALIDATION_ERROR",
        });
    }
};
exports.validateCsrfToken = validateCsrfToken;
function extractCsrfToken(req) {
    const headerToken = req.headers["x-csrf-token"] || req.headers["csrf-token"];
    if (headerToken && typeof headerToken === "string") {
        return headerToken;
    }
    if (req.body) {
        const bodyToken = req.body._csrf || req.body.csrf_token || req.body["csrf-token"];
        if (bodyToken && typeof bodyToken === "string") {
            return bodyToken;
        }
    }
    if (req.cookies && req.cookies["csrf-token"]) {
        return req.cookies["csrf-token"];
    }
    return null;
}
const adminCsrfProtection = (req, res, next) => {
    try {
        (0, exports.validateCsrfToken)(req, res, (err) => {
            if (err || res.headersSent) {
                return;
            }
            const origin = req.headers.origin;
            const referer = req.headers.referer;
            if (!origin && !referer) {
                (0, auditLogger_1.auditWarning)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, "Admin request missing origin and referer headers - potential CSRF attack", {
                    method: req.method,
                    endpoint: req.path,
                    user_agent: req.headers["user-agent"],
                });
            }
            console.log(`🔒 [ADMIN CSRF] Protected admin operation`, {
                method: req.method,
                path: req.path,
                ip: req.ip || req.connection.remoteAddress,
                origin,
                referer,
                timestamp: new Date().toISOString(),
            });
            return next();
        });
    }
    catch (error) {
        console.error("Error in admin CSRF protection:", error);
        (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
            reason: "admin_csrf_protection_error",
            error: error instanceof Error ? error.message : "Unknown error",
        });
        res.status(500).json({
            success: false,
            error: "Internal server error",
            code: "ADMIN_CSRF_ERROR",
        });
    }
};
exports.adminCsrfProtection = adminCsrfProtection;
const getCsrfToken = (req, res) => {
    try {
        const token = csrfManager.generateToken();
        res.header("X-CSRF-Token", token);
        res.cookie("csrf-token", token, {
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });
        res.json({
            success: true,
            csrf_token: token,
            expires_in: 15 * 60,
            usage: {
                header: "Include as X-CSRF-Token header",
                cookie: "Automatically included in requests",
                body: "Include as _csrf or csrf_token field",
            },
        });
    }
    catch (error) {
        console.error("Error providing CSRF token:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
        });
    }
};
exports.getCsrfToken = getCsrfToken;
const getCsrfSecret = (req, res) => {
    if (process.env.NODE_ENV === "production") {
        return res.status(404).json({
            success: false,
            error: "Endpoint not available in production",
        });
    }
    return res.json({
        success: true,
        secret: csrfManager.getSecret(),
        warning: "This endpoint is only available in development mode",
    });
};
exports.getCsrfSecret = getCsrfSecret;
//# sourceMappingURL=csrfProtection.js.map