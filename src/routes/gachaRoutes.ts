import express from "express";
import { ethers } from "ethers";
// JSON imports require: tsconfig {"resolveJsonModule": true, "esModuleInterop": true}
// Ensure these JSON files are available at runtime (e.g., copied to dist/)
import CONTRACTS_JSON from "../constants/contract-address.json";
import GachaABI from "../constants/GachaABI.json";
import { robustRpcProvider } from "../utils/rpcProvider";

const router = express.Router();
const GACHA_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";

// --- RPC setup ---
const provider = robustRpcProvider.getProvider();

// --- Address + ABI from files ---
const GACHA_ADDR = (CONTRACTS_JSON as any)?.Gacha?.trim();
if (!GACHA_ADDR || !ethers.isAddress(GACHA_ADDR)) {
  throw new Error(
    `Invalid Gacha address in contract-address.json: '${GACHA_ADDR}'`
  );
}
const GACHA_ABI = (GachaABI as any).abi as ethers.InterfaceAbi;

const gacha = new ethers.Contract(GACHA_ADDR, GACHA_ABI, provider);

// GET /api/gacha/owned/:wallet -> { success, wallet, tokenIds: string[] }
router.get("/gacha/owned/:wallet", async (req, res) => {
  try {
    const wallet = req.params.wallet;
    if (!ethers.isAddress(wallet)) {
      return res.status(400).json({ success: false, error: "invalid wallet" });
    }
    const ids: bigint[] = await gacha.owned(wallet);
    const tokenIds = ids.map((b) => b.toString());
    return res.json({
      success: true,
      wallet,
      tokenIds,
      count: tokenIds.length,
    });
  } catch (e: any) {
    console.error("gacha/owned error:", e);
    return res
      .status(500)
      .json({ success: false, error: e?.message || "internal error" });
  }
});

export default router;
