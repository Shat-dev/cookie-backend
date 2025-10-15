import { Request, Response, NextFunction } from "express";
declare class CSRFTokenManager {
    private tokens;
    private secret;
    constructor();
    generateToken(): string;
    verifyToken(token: string): boolean;
    getSecret(): string;
}
declare const csrfManager: CSRFTokenManager;
export declare const provideCsrfToken: (req: Request, res: Response, next: NextFunction) => void;
export declare const validateCsrfToken: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const adminCsrfProtection: (req: Request, res: Response, next: NextFunction) => void;
export declare const getCsrfToken: (req: Request, res: Response) => void;
export declare const getCsrfSecret: (req: Request, res: Response) => Response<any, Record<string, any>>;
export { csrfManager };
//# sourceMappingURL=csrfProtection.d.ts.map