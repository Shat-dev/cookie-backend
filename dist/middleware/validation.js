"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundIdQuerySchema = exports.walletQuerySchema = exports.createWinnerSchema = exports.verifyEntrySchema = exports.submitEntrySchema = exports.setDrawIntervalSchema = exports.setFundsAdminSchema = exports.drawWinnerSchema = exports.createRoundSchema = void 0;
exports.validateBody = validateBody;
exports.validateQuery = validateQuery;
exports.validateParams = validateParams;
exports.sanitizeString = sanitizeString;
exports.sanitizeEthereumAddress = sanitizeEthereumAddress;
exports.sanitizeTokenId = sanitizeTokenId;
const zod_1 = require("zod");
const ethereumAddressSchema = zod_1.z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format");
const tokenIdSchema = zod_1.z
    .string()
    .regex(/^\d+$/, "Token ID must be a positive integer")
    .refine((val) => {
    const num = parseInt(val, 10);
    return num >= 0 && num <= Number.MAX_SAFE_INTEGER;
}, "Token ID must be within valid range");
const tweetUrlSchema = zod_1.z
    .string()
    .url("Invalid URL format")
    .refine((url) => {
    try {
        const parsedUrl = new URL(url);
        return (parsedUrl.hostname === "twitter.com" ||
            parsedUrl.hostname === "x.com" ||
            parsedUrl.hostname === "www.twitter.com" ||
            parsedUrl.hostname === "www.x.com");
    }
    catch {
        return false;
    }
}, "URL must be a valid Twitter/X.com link");
const dateSchema = zod_1.z.union([
    zod_1.z.string().datetime("Invalid ISO date format"),
    zod_1.z.date(),
]);
const prizeAmountSchema = zod_1.z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Prize amount must be a valid number")
    .refine((val) => {
    const num = parseFloat(val);
    return num > 0 && num <= 1000000;
}, "Prize amount must be positive and reasonable");
const drawNumberSchema = zod_1.z
    .number()
    .int("Draw number must be an integer")
    .min(1, "Draw number must be positive");
const roundIdSchema = zod_1.z
    .number()
    .int("Round ID must be an integer")
    .min(1, "Round ID must be positive");
exports.createRoundSchema = zod_1.z.object({});
exports.drawWinnerSchema = zod_1.z.object({
    round_id: roundIdSchema,
});
exports.setFundsAdminSchema = zod_1.z.object({
    funds_admin_address: ethereumAddressSchema,
});
exports.setDrawIntervalSchema = zod_1.z.object({
    draw_interval_hours: zod_1.z
        .number()
        .int("Draw interval must be an integer")
        .min(1, "Draw interval must be at least 1 hour")
        .max(168, "Draw interval cannot exceed 168 hours (1 week)"),
});
exports.submitEntrySchema = zod_1.z.object({
    tokenId: tokenIdSchema,
});
exports.verifyEntrySchema = zod_1.z.object({
    tweetUrl: tweetUrlSchema,
    walletAddress: ethereumAddressSchema,
    tokenId: tokenIdSchema,
});
exports.createWinnerSchema = zod_1.z.object({
    drawNumber: drawNumberSchema,
    winnerAddress: ethereumAddressSchema,
    prizeAmount: prizeAmountSchema,
    tokenId: tokenIdSchema,
    imageUrl: zod_1.z.string().url("Invalid image URL format"),
});
exports.walletQuerySchema = zod_1.z.object({
    wallet: ethereumAddressSchema,
});
exports.roundIdQuerySchema = zod_1.z.object({
    id: zod_1.z.string().regex(/^\d+$/, "Round ID must be a number"),
});
function validateBody(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.body);
            if (!result.success) {
                const errors = result.error.issues.map((err) => ({
                    field: err.path.join("."),
                    message: err.message,
                    received: err.input,
                }));
                console.warn(`🚫 [VALIDATION ERROR] Input validation failed`, {
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.connection.remoteAddress,
                    endpoint: `${req.method} ${req.path}`,
                    errors,
                    body: req.body,
                });
                return res.status(400).json({
                    success: false,
                    error: "Input validation failed",
                    details: errors,
                });
            }
            req.body = result.data;
            return next();
        }
        catch (error) {
            console.error("Validation middleware error:", error);
            return res.status(500).json({
                success: false,
                error: "Internal validation error",
            });
        }
    };
}
function validateQuery(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.query);
            if (!result.success) {
                const errors = result.error.issues.map((err) => ({
                    field: err.path.join("."),
                    message: err.message,
                    received: err.input,
                }));
                console.warn(`🚫 [VALIDATION ERROR] Query validation failed`, {
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.connection.remoteAddress,
                    endpoint: `${req.method} ${req.path}`,
                    errors,
                    query: req.query,
                });
                return res.status(400).json({
                    success: false,
                    error: "Query validation failed",
                    details: errors,
                });
            }
            req.query = result.data;
            return next();
        }
        catch (error) {
            console.error("Query validation middleware error:", error);
            return res.status(500).json({
                success: false,
                error: "Internal validation error",
            });
        }
    };
}
function validateParams(schema) {
    return (req, res, next) => {
        try {
            const result = schema.safeParse(req.params);
            if (!result.success) {
                const errors = result.error.issues.map((err) => ({
                    field: err.path.join("."),
                    message: err.message,
                    received: err.input,
                }));
                console.warn(`🚫 [VALIDATION ERROR] Params validation failed`, {
                    timestamp: new Date().toISOString(),
                    ip: req.ip || req.connection.remoteAddress,
                    endpoint: `${req.method} ${req.path}`,
                    errors,
                    params: req.params,
                });
                return res.status(400).json({
                    success: false,
                    error: "URL parameter validation failed",
                    details: errors,
                });
            }
            req.params = result.data;
            return next();
        }
        catch (error) {
            console.error("Params validation middleware error:", error);
            return res.status(500).json({
                success: false,
                error: "Internal validation error",
            });
        }
    };
}
function sanitizeString(input, maxLength = 1000) {
    if (typeof input !== "string") {
        throw new Error("Input must be a string");
    }
    return input.trim().slice(0, maxLength);
}
function sanitizeEthereumAddress(input) {
    const sanitized = sanitizeString(input, 42);
    const result = ethereumAddressSchema.safeParse(sanitized);
    if (!result.success) {
        throw new Error("Invalid Ethereum address");
    }
    return result.data.toLowerCase();
}
function sanitizeTokenId(input) {
    const sanitized = sanitizeString(input, 20);
    const result = tokenIdSchema.safeParse(sanitized);
    if (!result.success) {
        throw new Error("Invalid token ID");
    }
    return result.data;
}
//# sourceMappingURL=validation.js.map