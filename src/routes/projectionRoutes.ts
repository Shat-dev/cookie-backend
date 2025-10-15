// src/routes/projectionRoutes.ts
import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { publicDataRateLimit } from "../middleware/rateLimiting";
import { provider } from "../lotteryClient";
import { entryRepository } from "../db/entryRepository";
import {
  sanitizeErrorResponse,
  createErrorResponse,
} from "../utils/auditLogger";
import cookieAddress from "../constants/contract-address.json";

// Use Cookie address from constants
const COOKIE_ADDRESS = cookieAddress.Cookie;

const router = Router();
const COOKIE_ABI = ["function owned(address owner) view returns (uint256[])"];
const cookie = new ethers.Contract(COOKIE_ADDRESS, COOKIE_ABI, provider);

// simple in-memory cache to avoid RPC spam
let cached: any = null;
let last = 0;
const TTL = Number(process.env.PROJECTION_TTL_MS) || 60_000; // 60s

async function getUniqueTweetingWallets(): Promise<string[]> {
  const rows = await entryRepository.getAllEntries();
  const set = new Set(rows.map((r) => r.wallet_address.toLowerCase()));
  return Array.from(set);
}

router.get(
  "/current-projections",
  publicDataRateLimit,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const now = Date.now();
      if (cached && now - last < TTL) {
        res.json(cached);
        return;
      }

      const wallets = await getUniqueTweetingWallets();

      // fetch owned() per wallet (sequential; simple & safe)
      const data: Array<{ wallet_address: string; token_ids: string[] }> = [];
      for (const w of wallets) {
        try {
          const ids: bigint[] = await cookie.owned(w);
          data.push({
            wallet_address: w,
            token_ids: ids.map((b) => b.toString()),
          });
        } catch {
          data.push({ wallet_address: w, token_ids: [] });
        }
      }

      cached = { success: true, data };
      last = now;

      res.json(cached);
      return;
    } catch (e: any) {
      const { logDetails } = sanitizeErrorResponse(
        e,
        "Failed to get projections"
      );
      console.error("Projection route error:", logDetails);
      res.status(500).json(createErrorResponse(e, "Failed to get projections"));
      return;
    }
  }
);

export default router;
