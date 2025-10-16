import { z } from "zod";
import { Request, Response, NextFunction } from "express";
export declare const createRoundSchema: z.ZodObject<{
    start_time: z.ZodUnion<readonly [z.ZodString, z.ZodDate]>;
    end_time: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
}, z.core.$strip>;
export declare const drawWinnerSchema: z.ZodObject<{
    round_id: z.ZodNumber;
}, z.core.$strip>;
export declare const setFundsAdminSchema: z.ZodObject<{
    funds_admin_address: z.ZodString;
}, z.core.$strip>;
export declare const setDrawIntervalSchema: z.ZodObject<{
    draw_interval_hours: z.ZodNumber;
}, z.core.$strip>;
export declare const submitEntrySchema: z.ZodObject<{
    tokenId: z.ZodString;
}, z.core.$strip>;
export declare const verifyEntrySchema: z.ZodObject<{
    tweetUrl: z.ZodString;
    walletAddress: z.ZodString;
    tokenId: z.ZodString;
}, z.core.$strip>;
export declare const createWinnerSchema: z.ZodObject<{
    drawNumber: z.ZodNumber;
    winnerAddress: z.ZodString;
    prizeAmount: z.ZodString;
    tokenId: z.ZodString;
    imageUrl: z.ZodString;
}, z.core.$strip>;
export declare const walletQuerySchema: z.ZodObject<{
    wallet: z.ZodString;
}, z.core.$strip>;
export declare const roundIdQuerySchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export declare function validateBody<T>(schema: z.ZodSchema<T>): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function validateQuery<T>(schema: z.ZodSchema<T>): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function validateParams<T>(schema: z.ZodSchema<T>): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function sanitizeString(input: unknown, maxLength?: number): string;
export declare function sanitizeEthereumAddress(input: unknown): string;
export declare function sanitizeTokenId(input: unknown): string;
//# sourceMappingURL=validation.d.ts.map