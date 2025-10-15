import { Request, Response } from "express";
interface ExtendedRequest extends Request {
    fingerprint?: string;
    suspiciousActivity?: boolean;
}
declare const generateClientFingerprint: (req: Request) => string;
declare const createCompositeKey: (req: ExtendedRequest) => string;
declare const detectSuspiciousActivity: (req: ExtendedRequest) => boolean;
export declare const enhancedRateLimitMiddleware: (req: ExtendedRequest, res: Response, next: any) => void;
export declare const generalRateLimit: any;
export declare const adminRateLimit: any;
export declare const publicDataRateLimit: any;
export declare const entrySubmissionRateLimit: any;
export declare const healthCheckRateLimit: any;
export declare const slidingWindowRateLimit: any;
export declare const burstProtectionRateLimit: any;
export { generateClientFingerprint, createCompositeKey, detectSuspiciousActivity, };
//# sourceMappingURL=rateLimiting.d.ts.map