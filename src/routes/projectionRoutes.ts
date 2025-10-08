// src/routes/projectionRoutes.ts
import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { provider } from "../lotteryClient";
import { entryRepository } from "../db/entryRepository";

const GACHA_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";
const GACHA_ABI = ["function owned(address owner) view returns (uint256[])"];
const gacha = new ethers.Contract(GACHA_ADDRESS, GACHA_ABI, provider);

const router = Router();

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
          const ids: bigint[] = await gacha.owned(w);
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
      res.status(500).json({ success: false, error: e?.message || "failed" });
      return;
    }
  }
);

export default router;
