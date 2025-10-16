import { z } from "zod";
import { Request, Response, NextFunction } from "express";

// ===== ZOD VALIDATION SCHEMAS =====

// Ethereum address validation
const ethereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format");

// Token ID validation (positive integer as string)
const tokenIdSchema = z
  .string()
  .regex(/^\d+$/, "Token ID must be a positive integer")
  .refine((val) => {
    const num = parseInt(val, 10);
    return num >= 0 && num <= Number.MAX_SAFE_INTEGER;
  }, "Token ID must be within valid range");

// Tweet URL validation
const tweetUrlSchema = z
  .string()
  .url("Invalid URL format")
  .refine((url) => {
    try {
      const parsedUrl = new URL(url);
      return (
        parsedUrl.hostname === "twitter.com" ||
        parsedUrl.hostname === "x.com" ||
        parsedUrl.hostname === "www.twitter.com" ||
        parsedUrl.hostname === "www.x.com"
      );
    } catch {
      return false;
    }
  }, "URL must be a valid Twitter/X.com link");

// Date validation (ISO string or Date object)
const dateSchema = z.union([
  z.string().datetime("Invalid ISO date format"),
  z.date(),
]);

// Prize amount validation (string representation of number)
const prizeAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Prize amount must be a valid number")
  .refine((val) => {
    const num = parseFloat(val);
    return num > 0 && num <= 1000000; // Reasonable upper limit
  }, "Prize amount must be positive and reasonable");

// Draw number validation
const drawNumberSchema = z
  .number()
  .int("Draw number must be an integer")
  .min(1, "Draw number must be positive");

// Round ID validation
const roundIdSchema = z
  .number()
  .int("Round ID must be an integer")
  .min(1, "Round ID must be positive");

// ===== REQUEST VALIDATION SCHEMAS =====

// POST /rounds - Create lottery round (manual system - no time fields needed)
export const createRoundSchema = z.object({
  // No fields needed for manual lottery system
});

// POST /draw-winner - Draw winner
export const drawWinnerSchema = z.object({
  round_id: roundIdSchema,
});

// PUT /funds-admin - Set funds admin
export const setFundsAdminSchema = z.object({
  funds_admin_address: ethereumAddressSchema,
});

// PUT /draw-interval - Set draw interval
export const setDrawIntervalSchema = z.object({
  draw_interval_hours: z
    .number()
    .int("Draw interval must be an integer")
    .min(1, "Draw interval must be at least 1 hour")
    .max(168, "Draw interval cannot exceed 168 hours (1 week)"),
});

// POST /submit-entry - Submit entry
export const submitEntrySchema = z.object({
  tokenId: tokenIdSchema,
});

// POST /verify-entry - Verify entry
export const verifyEntrySchema = z.object({
  tweetUrl: tweetUrlSchema,
  walletAddress: ethereumAddressSchema,
  tokenId: tokenIdSchema,
});

// POST /create-winner - Create winner
export const createWinnerSchema = z.object({
  drawNumber: drawNumberSchema,
  winnerAddress: ethereumAddressSchema,
  prizeAmount: prizeAmountSchema,
  tokenId: tokenIdSchema,
  imageUrl: z.string().url("Invalid image URL format"),
});

// Query parameter validation for GET endpoints
export const walletQuerySchema = z.object({
  wallet: ethereumAddressSchema,
});

export const roundIdQuerySchema = z.object({
  id: z.string().regex(/^\d+$/, "Round ID must be a number"),
});

// ===== VALIDATION MIDDLEWARE FACTORY =====

/**
 * Creates validation middleware for request body
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the request body
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const errors = result.error.issues.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          received: err.input,
        }));

        // Log validation failure for security monitoring
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

      // Replace req.body with validated and potentially transformed data
      req.body = result.data;
      return next();
    } catch (error) {
      console.error("Validation middleware error:", error);
      return res.status(500).json({
        success: false,
        error: "Internal validation error",
      });
    }
  };
}

/**
 * Creates validation middleware for query parameters
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
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

      // Replace req.query with validated data
      req.query = result.data as any;
      return next();
    } catch (error) {
      console.error("Query validation middleware error:", error);
      return res.status(500).json({
        success: false,
        error: "Internal validation error",
      });
    }
  };
}

/**
 * Creates validation middleware for URL parameters
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
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

      req.params = result.data as any;
      return next();
    } catch (error) {
      console.error("Params validation middleware error:", error);
      return res.status(500).json({
        success: false,
        error: "Internal validation error",
      });
    }
  };
}

// ===== SANITIZATION UTILITIES =====

/**
 * Sanitizes string input by trimming and limiting length
 */
export function sanitizeString(
  input: unknown,
  maxLength: number = 1000
): string {
  if (typeof input !== "string") {
    throw new Error("Input must be a string");
  }
  return input.trim().slice(0, maxLength);
}

/**
 * Sanitizes and validates Ethereum address
 */
export function sanitizeEthereumAddress(input: unknown): string {
  const sanitized = sanitizeString(input, 42);
  const result = ethereumAddressSchema.safeParse(sanitized);
  if (!result.success) {
    throw new Error("Invalid Ethereum address");
  }
  return result.data.toLowerCase(); // Normalize to lowercase
}

/**
 * Sanitizes and validates token ID
 */
export function sanitizeTokenId(input: unknown): string {
  const sanitized = sanitizeString(input, 20);
  const result = tokenIdSchema.safeParse(sanitized);
  if (!result.success) {
    throw new Error("Invalid token ID");
  }
  return result.data;
}
