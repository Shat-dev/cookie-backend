import { Request, Response, NextFunction } from "express";
export declare const secureCorsMiddleware: (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const logCorsConfig: () => string[];
//# sourceMappingURL=simpleCors.d.ts.map