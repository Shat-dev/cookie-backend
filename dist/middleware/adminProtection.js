"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markProtectionApplied = exports.ensureAdminProtection = exports.completeAdminProtection = exports.lightAdminProtection = exports.destructiveOperationProtection = exports.dataSyncProtection = exports.entryManagementProtection = exports.winnerDrawProtection = exports.lotteryRoundProtection = exports.criticalAdminProtection = exports.highSecurityAdminProtection = exports.standardAdminProtection = void 0;
exports.createAdminProtection = createAdminProtection;
const rateLimiting_1 = require("./rateLimiting");
const csrfProtection_1 = require("./csrfProtection");
const auth_1 = require("./auth");
const validation_1 = require("./validation");
const auditLogger_1 = require("../utils/auditLogger");
const SECURITY_LEVELS = {
    standard: {
        rateLimit: true,
        csrfProtection: true,
        authentication: true,
        skipAudit: false,
    },
    high: {
        rateLimit: true,
        csrfProtection: true,
        authentication: true,
        skipAudit: false,
        skipCsrfForMethods: [],
    },
    critical: {
        rateLimit: true,
        csrfProtection: true,
        authentication: true,
        skipAudit: false,
        skipCsrfForMethods: [],
    },
};
function createAdminProtection(options = {}) {
    const securityLevel = options.securityLevel || "standard";
    const levelDefaults = SECURITY_LEVELS[securityLevel];
    const config = { ...levelDefaults, ...options };
    return async (req, res, next) => {
        try {
            console.log(`🔒 [ADMIN PROTECTION] Starting ${securityLevel.toUpperCase()} security check for ${req.method} ${req.path}`);
            const startTime = Date.now();
            if (config.securityLevel === "critical") {
                (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
                    reason: "critical_admin_operation_attempted",
                    endpoint: `${req.method} ${req.path}`,
                    security_level: securityLevel,
                    ip: req.ip || req.connection.remoteAddress,
                    user_agent: req.headers["user-agent"],
                });
            }
            const middlewareChain = [];
            if (config.beforeMiddleware) {
                middlewareChain.push(...config.beforeMiddleware);
            }
            if (config.rateLimit) {
                middlewareChain.push(config.customRateLimit || rateLimiting_1.adminRateLimit);
            }
            if (config.csrfProtection) {
                const skipCsrf = config.skipCsrfForMethods?.includes(req.method);
                if (!skipCsrf) {
                    middlewareChain.push(csrfProtection_1.adminCsrfProtection);
                }
            }
            if (config.authentication) {
                middlewareChain.push(auth_1.requireAdminAuth);
            }
            if (config.bodySchema) {
                middlewareChain.push((0, validation_1.validateBody)(config.bodySchema));
            }
            if (config.querySchema) {
                middlewareChain.push((0, validation_1.validateQuery)(config.querySchema));
            }
            if (config.paramsSchema) {
                middlewareChain.push((0, validation_1.validateParams)(config.paramsSchema));
            }
            if (config.afterMiddleware) {
                middlewareChain.push(...config.afterMiddleware);
            }
            let currentIndex = 0;
            const executeNext = (error) => {
                if (error) {
                    console.error(`🚨 [ADMIN PROTECTION] Middleware chain failed at index ${currentIndex}:`, error);
                    if (!config.skipAudit) {
                        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Unknown error");
                        (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
                            reason: "admin_protection_middleware_failure",
                            middleware_index: currentIndex,
                            error: logDetails.message || "Unknown error",
                            security_level: securityLevel,
                            duration: Date.now() - startTime,
                        });
                    }
                    return next(error);
                }
                if (currentIndex >= middlewareChain.length) {
                    const duration = Date.now() - startTime;
                    console.log(`✅ [ADMIN PROTECTION] ${securityLevel.toUpperCase()} security passed for ${req.method} ${req.path} (${duration}ms)`);
                    if (!config.skipAudit && config.auditAction) {
                        (0, auditLogger_1.auditAction)(config.auditAction, req, {
                            security_level: securityLevel,
                            protection_duration: duration,
                            middleware_count: middlewareChain.length,
                        });
                    }
                    return next();
                }
                const middleware = middlewareChain[currentIndex++];
                try {
                    middleware(req, res, executeNext);
                }
                catch (middlewareError) {
                    executeNext(middlewareError);
                }
            };
            executeNext();
        }
        catch (error) {
            console.error("🚨 [ADMIN PROTECTION] Critical error in protection middleware:", error);
            (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.AUTH_FAILURE, req, {
                reason: "admin_protection_critical_failure",
                error: error instanceof Error ? error.message : "Unknown error",
                security_level: securityLevel,
            });
            res.status(500).json({
                success: false,
                error: "Internal server error",
                code: "ADMIN_PROTECTION_ERROR",
            });
            return;
        }
    };
}
const standardAdminProtection = (options = {}) => createAdminProtection({ securityLevel: "standard", ...options });
exports.standardAdminProtection = standardAdminProtection;
const highSecurityAdminProtection = (options = {}) => createAdminProtection({ securityLevel: "high", ...options });
exports.highSecurityAdminProtection = highSecurityAdminProtection;
const criticalAdminProtection = (options = {}) => createAdminProtection({ securityLevel: "critical", ...options });
exports.criticalAdminProtection = criticalAdminProtection;
const lotteryRoundProtection = (bodySchema) => (0, exports.highSecurityAdminProtection)({
    bodySchema,
    auditAction: auditLogger_1.AuditActionType.CREATE_ROUND,
});
exports.lotteryRoundProtection = lotteryRoundProtection;
const winnerDrawProtection = (bodySchema) => (0, exports.criticalAdminProtection)({
    bodySchema,
    auditAction: auditLogger_1.AuditActionType.DRAW_WINNER,
});
exports.winnerDrawProtection = winnerDrawProtection;
const entryManagementProtection = (bodySchema) => (0, exports.standardAdminProtection)({
    bodySchema,
    auditAction: auditLogger_1.AuditActionType.SUBMIT_ENTRY,
});
exports.entryManagementProtection = entryManagementProtection;
const dataSyncProtection = () => (0, exports.highSecurityAdminProtection)({
    auditAction: auditLogger_1.AuditActionType.SYNC_ENTRIES,
});
exports.dataSyncProtection = dataSyncProtection;
const destructiveOperationProtection = (bodySchema) => (0, exports.criticalAdminProtection)({
    bodySchema,
    auditAction: auditLogger_1.AuditActionType.DELETE_ENTRIES,
    beforeMiddleware: [
        (req, res, next) => {
            console.log(`⚠️ [DESTRUCTIVE OP] ${req.method} ${req.path} - High risk operation detected`);
            (0, auditLogger_1.auditSecurity)(auditLogger_1.AuditActionType.DELETE_ENTRIES, req, {
                reason: "destructive_operation_attempted",
                endpoint: `${req.method} ${req.path}`,
                requires_special_attention: true,
            });
            next();
        },
    ],
});
exports.destructiveOperationProtection = destructiveOperationProtection;
const lightAdminProtection = (querySchema, paramsSchema) => createAdminProtection({
    rateLimit: true,
    csrfProtection: false,
    authentication: true,
    querySchema,
    paramsSchema,
    skipAudit: true,
    securityLevel: "standard",
});
exports.lightAdminProtection = lightAdminProtection;
const completeAdminProtection = (auditAction, bodySchema, querySchema, paramsSchema) => (0, exports.highSecurityAdminProtection)({
    bodySchema,
    querySchema,
    paramsSchema,
    auditAction,
});
exports.completeAdminProtection = completeAdminProtection;
const ensureAdminProtection = (req, res, next) => {
    const hasProtection = res.locals.adminProtectionApplied ||
        req.headers["x-admin-protection"] ||
        res.getHeaders()["x-admin-protection"];
    if (!hasProtection && process.env.NODE_ENV === "development") {
        console.warn(`⚠️ [ADMIN PROTECTION] Route ${req.method} ${req.path} may be missing admin protection!`);
    }
    res.locals.adminProtectionChecked = true;
    next();
};
exports.ensureAdminProtection = ensureAdminProtection;
const markProtectionApplied = (req, res, next) => {
    res.locals.adminProtectionApplied = true;
    res.setHeader("X-Admin-Protection", "enabled");
    next();
};
exports.markProtectionApplied = markProtectionApplied;
exports.default = {
    createAdminProtection,
    standardAdminProtection: exports.standardAdminProtection,
    highSecurityAdminProtection: exports.highSecurityAdminProtection,
    criticalAdminProtection: exports.criticalAdminProtection,
    lotteryRoundProtection: exports.lotteryRoundProtection,
    winnerDrawProtection: exports.winnerDrawProtection,
    entryManagementProtection: exports.entryManagementProtection,
    dataSyncProtection: exports.dataSyncProtection,
    destructiveOperationProtection: exports.destructiveOperationProtection,
    lightAdminProtection: exports.lightAdminProtection,
    completeAdminProtection: exports.completeAdminProtection,
    ensureAdminProtection: exports.ensureAdminProtection,
    markProtectionApplied: exports.markProtectionApplied,
};
//# sourceMappingURL=adminProtection.js.map