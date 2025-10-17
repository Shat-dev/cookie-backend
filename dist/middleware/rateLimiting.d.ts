import { RateLimitRequestHandler } from "express-rate-limit";
import { Request, Response } from "express";
interface ExtendedRequest extends Request {
    fingerprint?: string;
    suspiciousActivity?: boolean;
}
declare const generateClientFingerprint: (req: Request) => string;
declare const createCompositeKey: (req: ExtendedRequest) => string;
declare const detectSuspiciousActivity: (req: ExtendedRequest) => boolean;
export declare const enhancedRateLimitMiddleware: (req: ExtendedRequest, res: Response, next: any) => void;
export declare const generalRateLimit: RateLimitRequestHandler;
export declare const publicDataRateLimit: RateLimitRequestHandler;
export declare const entrySubmissionRateLimit: RateLimitRequestHandler;
export declare const healthCheckRateLimit: RateLimitRequestHandler;
export declare const slidingWindowRateLimit: RateLimitRequestHandler;
export declare const burstProtectionRateLimit: RateLimitRequestHandler;
export { generateClientFingerprint, createCompositeKey, detectSuspiciousActivity, };
//# sourceMappingURL=rateLimiting.d.ts.map