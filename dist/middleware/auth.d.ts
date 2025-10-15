import { Request, Response, NextFunction } from "express";
interface AuthenticatedRequest extends Request {
    isAdmin?: boolean;
}
export declare const requireAdminAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const optionalAdminAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=auth.d.ts.map