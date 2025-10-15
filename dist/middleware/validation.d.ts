import { z } from "zod";
import { Request, Response, NextFunction } from "express";
export declare const createRoundSchema: any;
export declare const drawWinnerSchema: any;
export declare const setFundsAdminSchema: any;
export declare const setDrawIntervalSchema: any;
export declare const submitEntrySchema: any;
export declare const verifyEntrySchema: any;
export declare const createWinnerSchema: any;
export declare const walletQuerySchema: any;
export declare const roundIdQuerySchema: any;
export declare function validateBody<T>(schema: z.ZodSchema<T>): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function validateQuery<T>(schema: z.ZodSchema<T>): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function validateParams<T>(schema: z.ZodSchema<T>): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function sanitizeString(input: unknown, maxLength?: number): string;
export declare function sanitizeEthereumAddress(input: unknown): string;
export declare function sanitizeTokenId(input: unknown): string;
//# sourceMappingURL=validation.d.ts.map