import { Request } from "express";
import crypto from "crypto";

// ===== AUDIT LOG LEVELS =====
export enum AuditLogLevel {
  ACTION = "ACTION", // Admin action initiated
  SUCCESS = "SUCCESS", // Action completed successfully
  FAILURE = "FAILURE", // Action failed
  WARNING = "WARNING", // Suspicious or noteworthy activity
  SECURITY = "SECURITY", // Security-related events
}

// ===== AUDIT LOG TYPES =====
export enum AuditActionType {
  // Lottery Operations
  CREATE_ROUND = "CREATE_ROUND",
  DRAW_WINNER = "DRAW_WINNER",
  SYNC_ENTRIES = "SYNC_ENTRIES",

  // Entry Management
  SUBMIT_ENTRY = "SUBMIT_ENTRY",
  VERIFY_ENTRY = "VERIFY_ENTRY",

  // Winner Management
  CREATE_WINNER = "CREATE_WINNER",

  // Authentication
  ADMIN_LOGIN = "ADMIN_LOGIN",
  AUTH_FAILURE = "AUTH_FAILURE",

  // Data Operations
  DELETE_ENTRIES = "DELETE_ENTRIES",
  BULK_OPERATION = "BULK_OPERATION",
}

// ===== AUDIT LOG INTERFACE =====
export interface AuditLogEntry {
  timestamp: string;
  level: AuditLogLevel;
  action: AuditActionType;
  ip: string;
  userAgent?: string;
  endpoint: string;
  details: Record<string, any>;
  success: boolean;
  error?: string;
  duration?: number;
}

// ===== AUDIT LOGGER CLASS =====
export class AuditLogger {
  private static instance: AuditLogger;

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Sanitize PII by hashing with a salt
   */
  private sanitizePII(data: string): string {
    const salt = process.env.LOG_SALT || "audit-log-salt-change-in-production";
    return crypto
      .createHash("sha256")
      .update(data + salt)
      .digest("hex")
      .substring(0, 12);
  }

  /**
   * Extract common request information
   */
  private extractRequestInfo(req: Request) {
    const rawIP = req.ip || req.connection.remoteAddress || "unknown";
    const rawUserAgent = req.headers["user-agent"] || "unknown";

    return {
      ip: this.sanitizePII(rawIP),
      userAgent: this.sanitizePII(rawUserAgent),
      endpoint: `${req.method} ${req.path}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log admin action initiation
   */
  logAction(
    action: AuditActionType,
    req: Request,
    details: Record<string, any> = {}
  ): void {
    const requestInfo = this.extractRequestInfo(req);

    const logEntry: Partial<AuditLogEntry> = {
      ...requestInfo,
      level: AuditLogLevel.ACTION,
      action,
      details,
      success: true, // Assumed true for action initiation
    };

    console.log(`🔐 [ADMIN ${action}] Action initiated`, logEntry);
  }

  /**
   * Log successful admin operation
   */
  logSuccess(
    action: AuditActionType,
    req: Request,
    details: Record<string, any> = {},
    startTime?: number
  ): void {
    const requestInfo = this.extractRequestInfo(req);
    const duration = startTime ? Date.now() - startTime : undefined;

    const logEntry: Partial<AuditLogEntry> = {
      ...requestInfo,
      level: AuditLogLevel.SUCCESS,
      action,
      details,
      success: true,
      duration,
    };

    console.log(`✅ [ADMIN ${action}] Operation successful`, logEntry);
  }

  /**
   * Log failed admin operation
   */
  logFailure(
    action: AuditActionType,
    req: Request,
    error: string,
    details: Record<string, any> = {},
    startTime?: number
  ): void {
    const requestInfo = this.extractRequestInfo(req);
    const duration = startTime ? Date.now() - startTime : undefined;

    const logEntry: Partial<AuditLogEntry> = {
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

  /**
   * Log security-related events
   */
  logSecurity(
    action: AuditActionType,
    req: Request,
    details: Record<string, any> = {}
  ): void {
    const requestInfo = this.extractRequestInfo(req);

    const logEntry: Partial<AuditLogEntry> = {
      ...requestInfo,
      level: AuditLogLevel.SECURITY,
      action,
      details,
      success: false, // Security events are typically failures
    };

    console.warn(`🚨 [SECURITY ${action}] Security event detected`, logEntry);
  }

  /**
   * Log warning events
   */
  logWarning(
    action: AuditActionType,
    req: Request,
    message: string,
    details: Record<string, any> = {}
  ): void {
    const requestInfo = this.extractRequestInfo(req);

    const logEntry: Partial<AuditLogEntry> = {
      ...requestInfo,
      level: AuditLogLevel.WARNING,
      action,
      details: { ...details, warning: message },
      success: true,
    };

    console.warn(`⚠️ [ADMIN ${action}] Warning`, logEntry);
  }

  /**
   * Log data operations with high-impact potential
   */
  logDataOperation(
    action: AuditActionType,
    details: Record<string, any>,
    impact: "low" | "medium" | "high" | "critical" = "medium"
  ): void {
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

    console.log(
      `${emoji} [DATA ${action}] ${impact.toUpperCase()} impact operation`,
      logEntry
    );
  }

  /**
   * Create operation timer for performance tracking
   */
  startTimer(): number {
    return Date.now();
  }
}

// ===== CONVENIENCE FUNCTIONS =====
export const auditLogger = AuditLogger.getInstance();

// Pre-configured audit functions for common operations
export const auditAction = (
  action: AuditActionType,
  req: Request,
  details?: Record<string, any>
) => auditLogger.logAction(action, req, details);

export const auditSuccess = (
  action: AuditActionType,
  req: Request,
  details?: Record<string, any>,
  startTime?: number
) => auditLogger.logSuccess(action, req, details, startTime);

export const auditFailure = (
  action: AuditActionType,
  req: Request,
  error: string,
  details?: Record<string, any>,
  startTime?: number
) => auditLogger.logFailure(action, req, error, details, startTime);

export const auditSecurity = (
  action: AuditActionType,
  req: Request,
  details?: Record<string, any>
) => auditLogger.logSecurity(action, req, details);

export const auditWarning = (
  action: AuditActionType,
  req: Request,
  message: string,
  details?: Record<string, any>
) => auditLogger.logWarning(action, req, message, details);

export const auditDataOperation = (
  action: AuditActionType,
  details: Record<string, any>,
  impact?: "low" | "medium" | "high" | "critical"
) => auditLogger.logDataOperation(action, details, impact);

// Error Response Sanitization Utilities
/**
 * Sanitizes error messages for client responses in production
 * Logs the full error details while returning safe messages to clients
 */
export const sanitizeErrorResponse = (
  error: any,
  fallbackMessage: string = "Internal server error"
): { message: string; logDetails: any } => {
  const isProduction = process.env.NODE_ENV === "production";

  // Always log full error details for debugging (server-side only)
  const logDetails = {
    message: error?.message || "Unknown error",
    stack: error?.stack,
    name: error?.name,
    code: error?.code,
    timestamp: new Date().toISOString(),
  };

  // In production, return generic message. In development, can include more details
  const clientMessage = isProduction
    ? fallbackMessage
    : error?.message || fallbackMessage;

  return {
    message: clientMessage,
    logDetails,
  };
};

/**
 * Creates a standardized error response object for APIs
 */
export const createErrorResponse = (
  error: any,
  fallbackMessage: string = "Internal server error"
) => {
  const { message } = sanitizeErrorResponse(error, fallbackMessage);

  return {
    success: false,
    error: message,
  };
};

/**
 * Creates a standardized error response with message field
 */
export const createErrorResponseWithMessage = (
  error: any,
  fallbackMessage: string = "Internal server error"
) => {
  const { message } = sanitizeErrorResponse(error, fallbackMessage);

  return {
    success: false,
    message: fallbackMessage,
    // Note: No error field to prevent information disclosure
  };
};
