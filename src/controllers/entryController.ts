import { Request, Response } from "express";
import { entryRepository } from "../db/entryRepository";
import {
  ApiResponse,
  EntryToken,
  SubmitEntryRequest,
  VerifyEntryRequest,
} from "../types";
import {
  auditAction,
  auditSuccess,
  auditFailure,
  AuditActionType,
  auditLogger,
  sanitizeErrorResponse,
  createErrorResponse,
} from "../utils/auditLogger";

/** GET /current-pool
 * Returns an array shaped for the frontend:
 *   [{ wallet_address, token_ids: [...] }, ...]
 */
async function getCurrentPool(_req: Request, res: Response): Promise<void> {
  try {
    const rows: EntryToken[] = await entryRepository.getAllEntries();

    // Group by wallet (lowercased for consistency)
    const byWallet = new Map<string, Set<string>>();
    for (const r of rows) {
      const w = r.wallet_address.toLowerCase();
      if (!byWallet.has(w)) byWallet.set(w, new Set());
      byWallet.get(w)!.add(r.token_id);
    }

    const payload = Array.from(byWallet.entries()).map(
      ([wallet_address, set]) => ({
        wallet_address,
        token_ids: Array.from(set),
      })
    );

    const response: ApiResponse<
      Array<{ wallet_address: string; token_ids: string[] }>
    > = {
      success: true,
      data: payload,
    };

    // avoid stale caches while polling
    res.setHeader("Cache-Control", "no-store");
    res.json(response);
  } catch (error: any) {
    const { logDetails } = sanitizeErrorResponse(
      error,
      "Failed to fetch current pool"
    );
    console.error("Error fetching current pool:", logDetails);
    const response: ApiResponse<null> = createErrorResponse(
      error,
      "Failed to fetch current pool"
    );
    res.status(500).json(response);
  }
}

/** POST /submit-entry  (manual helper for testing; not used in prod flow)
 * Body: { tokenId }
 * Creates/updates a single (tweet_id, token_id) row with synthetic tweet info.
 */
async function submitEntry(req: Request, res: Response): Promise<void> {
  const startTime = auditLogger.startTimer();

  try {
    const { tokenId } = (req.body ?? {}) as SubmitEntryRequest;
    const token = String(tokenId || "").trim();

    // Audit log for admin action
    auditAction(AuditActionType.SUBMIT_ENTRY, req, {
      tokenId: token,
      method: "manual",
    });

    if (!token) {
      const errorMsg = "Token ID is required";

      auditFailure(
        AuditActionType.SUBMIT_ENTRY,
        req,
        errorMsg,
        {
          tokenId: !!tokenId,
          received: tokenId,
        },
        startTime
      );

      const response: ApiResponse<null> = {
        success: false,
        error: errorMsg,
      };
      res.status(400).json(response);
      return;
    }

    // Manual placeholder values (for testing)
    const walletAddress = "social_verified";
    const tweetId = `manual-${Date.now()}`;
    const tweetUrl = "https://manual-entry";

    await entryRepository.upsertTokenEntry({
      tweet_id: tweetId,
      wallet_address: walletAddress,
      token_id: token,
      tweet_url: tweetUrl,
      verified: true,
      image_url: null,
    });

    // Log successful entry submission
    auditSuccess(
      AuditActionType.SUBMIT_ENTRY,
      req,
      {
        tokenId: token,
        tweetId,
        walletAddress,
        method: "manual",
        verified: true,
      },
      startTime
    );

    const response: ApiResponse<EntryToken> = {
      success: true,
      data: {
        id: 0, // unknown without SELECT; client doesn't need it here
        tweet_id: tweetId,
        wallet_address: walletAddress,
        token_id: token,
        tweet_url: tweetUrl,
        image_url: null,
        verified: true,
        created_at: new Date().toISOString(),
      },
    };
    res.status(201).json(response);
  } catch (error: any) {
    const { logDetails } = sanitizeErrorResponse(
      error,
      "Failed to submit entry"
    );
    console.error("Error submitting entry:", logDetails);

    auditFailure(
      AuditActionType.SUBMIT_ENTRY,
      req,
      logDetails.message || "Unknown error",
      {
        error: logDetails.message,
        stack: logDetails.stack?.split("\n")?.[0],
      },
      startTime
    );

    const response: ApiResponse<null> = createErrorResponse(
      error,
      "Failed to submit entry"
    );
    res.status(500).json(response);
  }
}

/** (Deprecated) POST /verify-entry
 * Body: { tweetUrl, walletAddress, tokenId }
 * In per-token schema we simply upsert a single row for that token.
 */
async function verifyEntry(req: Request, res: Response): Promise<void> {
  const startTime = auditLogger.startTimer();

  try {
    const { tweetUrl, walletAddress, tokenId } = (req.body ??
      {}) as VerifyEntryRequest;

    const url = String(tweetUrl || "").trim();
    const wallet = String(walletAddress || "").trim();
    const token = String(tokenId || "").trim();

    // Audit log for admin action
    auditAction(AuditActionType.VERIFY_ENTRY, req, {
      tweetUrl: url,
      walletAddress: wallet,
      tokenId: token,
    });

    if (!url || !wallet || !token) {
      const errorMsg = "Tweet URL, wallet address, and token ID are required";

      auditFailure(
        AuditActionType.VERIFY_ENTRY,
        req,
        errorMsg,
        {
          tweetUrl: !!url,
          walletAddress: !!wallet,
          tokenId: !!token,
          received: { url, wallet, token },
        },
        startTime
      );

      const response: ApiResponse<null> = {
        success: false,
        error: errorMsg,
      };
      res.status(400).json(response);
      return;
    }

    // Try to extract tweet_id from a URL like https://x.com/.../status/1234567890
    const tweetId = url.match(/status\/(\d+)/)?.[1] || `verify-${Date.now()}`;

    await entryRepository.upsertTokenEntry({
      tweet_id: tweetId,
      wallet_address: wallet,
      token_id: token,
      tweet_url: url,
      verified: true,
      image_url: null,
    });

    // Log successful entry verification
    auditSuccess(
      AuditActionType.VERIFY_ENTRY,
      req,
      {
        tweetId,
        tweetUrl: url,
        walletAddress: wallet,
        tokenId: token,
        verified: true,
        method: "manual",
      },
      startTime
    );

    const response: ApiResponse<EntryToken> = {
      success: true,
      data: {
        id: 0,
        tweet_id: tweetId,
        wallet_address: wallet,
        token_id: token,
        tweet_url: url,
        image_url: null,
        verified: true,
        created_at: new Date().toISOString(),
      },
    };
    res.json(response);
  } catch (error: any) {
    const { logDetails } = sanitizeErrorResponse(
      error,
      "Failed to verify entry"
    );
    console.error("Error verifying entry:", logDetails);

    auditFailure(
      AuditActionType.VERIFY_ENTRY,
      req,
      logDetails.message || "Unknown error",
      {
        error: logDetails.message,
        stack: logDetails.stack?.split("\n")?.[0],
      },
      startTime
    );

    const response: ApiResponse<null> = createErrorResponse(
      error,
      "Failed to verify entry"
    );
    res.status(500).json(response);
  }
}

export const entryController = {
  getCurrentPool,
  submitEntry,
  verifyEntry,
};
