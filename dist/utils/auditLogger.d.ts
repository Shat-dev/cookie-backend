import { Request } from "express";
export declare enum AuditLogLevel {
    ACTION = "ACTION",
    SUCCESS = "SUCCESS",
    FAILURE = "FAILURE",
    WARNING = "WARNING",
    SECURITY = "SECURITY"
}
export declare enum AuditActionType {
    CREATE_ROUND = "CREATE_ROUND",
    DRAW_WINNER = "DRAW_WINNER",
    SYNC_ENTRIES = "SYNC_ENTRIES",
    SUBMIT_ENTRY = "SUBMIT_ENTRY",
    VERIFY_ENTRY = "VERIFY_ENTRY",
    CREATE_WINNER = "CREATE_WINNER",
    ADMIN_LOGIN = "ADMIN_LOGIN",
    AUTH_FAILURE = "AUTH_FAILURE",
    DELETE_ENTRIES = "DELETE_ENTRIES",
    BULK_OPERATION = "BULK_OPERATION"
}
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
export declare class AuditLogger {
    private static instance;
    static getInstance(): AuditLogger;
    private sanitizePII;
    private extractRequestInfo;
    logAction(action: AuditActionType, req: Request, details?: Record<string, any>): void;
    logSuccess(action: AuditActionType, req: Request, details?: Record<string, any>, startTime?: number): void;
    logFailure(action: AuditActionType, req: Request, error: string, details?: Record<string, any>, startTime?: number): void;
    logSecurity(action: AuditActionType, req: Request, details?: Record<string, any>): void;
    logWarning(action: AuditActionType, req: Request, message: string, details?: Record<string, any>): void;
    logDataOperation(action: AuditActionType, details: Record<string, any>, impact?: "low" | "medium" | "high" | "critical"): void;
    startTimer(): number;
}
export declare const auditLogger: AuditLogger;
export declare const auditAction: (action: AuditActionType, req: Request, details?: Record<string, any>) => void;
export declare const auditSuccess: (action: AuditActionType, req: Request, details?: Record<string, any>, startTime?: number) => void;
export declare const auditFailure: (action: AuditActionType, req: Request, error: string, details?: Record<string, any>, startTime?: number) => void;
export declare const auditSecurity: (action: AuditActionType, req: Request, details?: Record<string, any>) => void;
export declare const auditWarning: (action: AuditActionType, req: Request, message: string, details?: Record<string, any>) => void;
export declare const auditDataOperation: (action: AuditActionType, details: Record<string, any>, impact?: "low" | "medium" | "high" | "critical") => void;
export declare const sanitizeErrorResponse: (error: any, fallbackMessage?: string) => {
    message: string;
    logDetails: any;
};
export declare const createErrorResponse: (error: any, fallbackMessage?: string) => {
    success: boolean;
    error: string;
};
export declare const createErrorResponseWithMessage: (error: any, fallbackMessage?: string) => {
    success: boolean;
    message: string;
};
//# sourceMappingURL=auditLogger.d.ts.map