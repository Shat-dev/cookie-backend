import express from "express";
import { ethers } from "ethers";
// JSON imports require: tsconfig {"resolveJsonModule": true, "esModuleInterop": true}
// Ensure these JSON files are available at runtime (e.g., copied to dist/)
import CONTRACTS_JSON from "../constants/contract-address.json";
import CookieABI from "../constants/CookieABI.json";
import { robustRpcProvider } from "../utils/rpcProvider";

const router = express.Router();
const COOKIE_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";

// --- RPC setup ---
const provider = robustRpcProvider.getProvider();

// --- Address + ABI from files ---
const COOKIE_ADDR = (CONTRACTS_JSON as any)?.Cookie?.trim();
if (!COOKIE_ADDR || !ethers.isAddress(COOKIE_ADDR)) {
  throw new Error(
    `Invalid Cookie address in contract-address.json: '${COOKIE_ADDR}'`
  );
}
const COOKIE_ABI = (CookieABI as any).abi as ethers.InterfaceAbi;

const cookie = new ethers.Contract(COOKIE_ADDR, COOKIE_ABI, provider);

// GET /api/cookie/owned/:wallet -> { success, wallet, tokenIds: string[] }
router.get("/cookie/owned/:wallet", async (req, res) => {
  try {
    const wallet = req.params.wallet;
    if (!ethers.isAddress(wallet)) {
      return res.status(400).json({ success: false, error: "invalid wallet" });
    }
    const ids: bigint[] = await cookie.owned(wallet);
    const tokenIds = ids.map((b) => b.toString());
    return res.json({
      success: true,
      wallet,
      tokenIds,
      count: tokenIds.length,
    });
  } catch (e: any) {
    console.error("cookie/owned error:", e);
    return res
      .status(500)
      .json({ success: false, error: e?.message || "internal error" });
  }
});

export default router;
