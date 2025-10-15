"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createErrorResponseWithMessage = exports.createErrorResponse = exports.sanitizeErrorResponse = exports.auditDataOperation = exports.auditWarning = exports.auditSecurity = exports.auditFailure = exports.auditSuccess = exports.auditAction = exports.auditLogger = exports.AuditLogger = exports.AuditActionType = exports.AuditLogLevel = void 0;
const crypto_1 = __importDefault(require("crypto"));
var AuditLogLevel;
(function (AuditLogLevel) {
    AuditLogLevel["ACTION"] = "ACTION";
    AuditLogLevel["SUCCESS"] = "SUCCESS";
    AuditLogLevel["FAILURE"] = "FAILURE";
    AuditLogLevel["WARNING"] = "WARNING";
    AuditLogLevel["SECURITY"] = "SECURITY";
})(AuditLogLevel || (exports.AuditLogLevel = AuditLogLevel = {}));
var AuditActionType;
(function (AuditActionType) {
    AuditActionType["CREATE_ROUND"] = "CREATE_ROUND";
    AuditActionType["DRAW_WINNER"] = "DRAW_WINNER";
    AuditActionType["SYNC_ENTRIES"] = "SYNC_ENTRIES";
    AuditActionType["SUBMIT_ENTRY"] = "SUBMIT_ENTRY";
    AuditActionType["VERIFY_ENTRY"] = "VERIFY_ENTRY";
    AuditActionType["CREATE_WINNER"] = "CREATE_WINNER";
    AuditActionType["ADMIN_LOGIN"] = "ADMIN_LOGIN";
    AuditActionType["AUTH_FAILURE"] = "AUTH_FAILURE";
    AuditActionType["DELETE_ENTRIES"] = "DELETE_ENTRIES";
    AuditActionType["BULK_OPERATION"] = "BULK_OPERATION";
})(AuditActionType || (exports.AuditActionType = AuditActionType = {}));
class AuditLogger {
    static getInstance() {
        if (!AuditLogger.instance) {
            AuditLogger.instance = new AuditLogger();
        }
        return AuditLogger.instance;
    }
    sanitizePII(data) {
        const salt = process.env.LOG_SALT || "audit-log-salt-change-in-production";
        return crypto_1.default
            .createHash("sha256")
            .update(data + salt)
            .digest("hex")
            .substring(0, 12);
    }
    extractRequestInfo(req) {
        const rawIP = req.ip || req.connection.remoteAddress || "unknown";
        const rawUserAgent = req.headers["user-agent"] || "unknown";
        return {
            ip: this.sanitizePII(rawIP),
            userAgent: this.sanitizePII(rawUserAgent),
            endpoint: `${req.method} ${req.path}`,
            timestamp: new Date().toISOString(),
        };
    }
    logAction(action, req, details = {}) {
        const requestInfo = this.extractRequestInfo(req);
        const logEntry = {
            ...requestInfo,
            level: AuditLogLevel.ACTION,
            action,
            details,
            success: true,
        };
        console.log(`🔐 [ADMIN ${action}] Action initiated`, logEntry);
    }
    logSuccess(action, req, details = {}, startTime) {
        const requestInfo = this.extractRequestInfo(req);
        const duration = startTime ? Date.now() - startTime : undefined;
        const logEntry = {
            ...requestInfo,
            level: AuditLogLevel.SUCCESS,
            action,
            details,
            success: true,
            duration,
        };
        console.log(`✅ [ADMIN ${action}] Operation successful`, logEntry);
    }
    logFailure(action, req, error, details = {}, startTime) {
        const requestInfo = this.extractRequestInfo(req);
        const duration = startTime ? Date.now() - startTime : undefined;
        const logEntry = {
            ...requestInfo,
            level: AuditLogLevel.FAILURE,
            action,
            details,
            success: false,
            error,
            duration,
        };
        console.error(`❌ [ADMIN ${action}] Operation failed`, logEntry);
    }
    logSecurity(action, req, details = {}) {
        const requestInfo = this.extractRequestInfo(req);
        const logEntry = {
            ...requestInfo,
            level: AuditLogLevel.SECURITY,
            action,
            details,
            success: false,
        };
        console.warn(`🚨 [SECURITY ${action}] Security event detected`, logEntry);
    }
    logWarning(action, req, message, details = {}) {
        const requestInfo = this.extractRequestInfo(req);
        const logEntry = {
            ...requestInfo,
            level: AuditLogLevel.WARNING,
            action,
            details: { ...details, warning: message },
            success: true,
        };
        console.warn(`⚠️ [ADMIN ${action}] Warning`, logEntry);
    }
    logDataOperation(action, details, impact = "medium") {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: AuditLogLevel.ACTION,
            action,
            details: { ...details, impact },
            success: true,
            ip: "system",
            endpoint: "background-operation",
        };
        const emoji = {
            low: "📝",
            medium: "📊",
            high: "🚨",
            critical: "🚨🚨🚨",
        }[impact];
        console.log(`${emoji} [DATA ${action}] ${impact.toUpperCase()} impact operation`, logEntry);
    }
    startTimer() {
        return Date.now();
    }
}
exports.AuditLogger = AuditLogger;
exports.auditLogger = AuditLogger.getInstance();
const auditAction = (action, req, details) => exports.auditLogger.logAction(action, req, details);
exports.auditAction = auditAction;
const auditSuccess = (action, req, details, startTime) => exports.auditLogger.logSuccess(action, req, details, startTime);
exports.auditSuccess = auditSuccess;
const auditFailure = (action, req, error, details, startTime) => exports.auditLogger.logFailure(action, req, error, details, startTime);
exports.auditFailure = auditFailure;
const auditSecurity = (action, req, details) => exports.auditLogger.logSecurity(action, req, details);
exports.auditSecurity = auditSecurity;
const auditWarning = (action, req, message, details) => exports.auditLogger.logWarning(action, req, message, details);
exports.auditWarning = auditWarning;
const auditDataOperation = (action, details, impact) => exports.auditLogger.logDataOperation(action, details, impact);
exports.auditDataOperation = auditDataOperation;
const sanitizeErrorResponse = (error, fallbackMessage = "Internal server error") => {
    const isProduction = process.env.NODE_ENV === "production";
    const logDetails = {
        message: error?.message || "Unknown error",
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
        timestamp: new Date().toISOString(),
    };
    const clientMessage = isProduction
        ? fallbackMessage
        : error?.message || fallbackMessage;
    return {
        message: clientMessage,
        logDetails,
    };
};
exports.sanitizeErrorResponse = sanitizeErrorResponse;
const createErrorResponse = (error, fallbackMessage = "Internal server error") => {
    const { message } = (0, exports.sanitizeErrorResponse)(error, fallbackMessage);
    return {
        success: false,
        error: message,
    };
};
exports.createErrorResponse = createErrorResponse;
const createErrorResponseWithMessage = (error, fallbackMessage = "Internal server error") => {
    const { message } = (0, exports.sanitizeErrorResponse)(error, fallbackMessage);
    return {
        success: false,
        message: fallbackMessage,
    };
};
exports.createErrorResponseWithMessage = createErrorResponseWithMessage;
//# sourceMappingURL=auditLogger.js.map