import express from "express";
import { ethers } from "ethers";
import { publicDataRateLimit } from "../middleware/rateLimiting";
import { validateParams, walletQuerySchema } from "../middleware/validation";
import {
  sanitizeErrorResponse,
  createErrorResponse,
} from "../utils/auditLogger";
import fs from "fs";
import path from "path";
import { robustRpcProvider } from "../utils/rpcProvider";

const router = express.Router();
const provider = robustRpcProvider.getProvider();

// ---- helpers ----
function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function normalizeAbi(raw: any): ethers.InterfaceAbi {
  if (Array.isArray(raw)) return raw as ethers.InterfaceAbi;
  if (raw?.abi && Array.isArray(raw.abi)) return raw.abi as ethers.InterfaceAbi;
  if (raw?.default && Array.isArray(raw.default))
    return raw.default as ethers.InterfaceAbi;
  throw new Error("CookieABI.json invalid. Expect array or { abi: [] }.");
}

function tryLoadJson(p: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function loadAbi(): ethers.InterfaceAbi {
  const candidates = [
    path.join(__dirname, "../constants/GachaABI.json"),
    path.join(__dirname, "../../src/constants/GachaABI.json"),
  ];
  for (const p of candidates) {
    const j = tryLoadJson(p);
    if (j) return normalizeAbi(j);
  }
  throw new Error("GachaABI.json not found in constants/");
}

function resolveAddress(): string {
  const envAddr = process.env.GACHA_ADDRESS?.trim();
  if (envAddr) {
    if (!ethers.isAddress(envAddr))
      throw new Error(`GACHA_ADDRESS invalid: ${envAddr}`);
    return envAddr;
  }
  const candidates = [
    path.join(__dirname, "../constants/contract-address.json"),
    path.join(__dirname, "../../src/constants/contract-address.json"),
  ];
  for (const p of candidates) {
    const j = tryLoadJson(p);
    const a = j?.Gacha?.trim?.();
    if (a && ethers.isAddress(a)) return a;
  }
  throw new Error(
    "Gacha address missing. Set GACHA_ADDRESS or provide constants/contract-address.json"
  );
}

let gachaSingleton: ethers.Contract | null = null;
function getGacha(): ethers.Contract {
  if (gachaSingleton) return gachaSingleton;
  const address = resolveAddress();
  const abi = loadAbi();
  gachaSingleton = new ethers.Contract(address, abi, provider);
  return gachaSingleton;
}

// ---- routes ----
router.get(
  "/gacha/owned/:wallet",
  publicDataRateLimit,
  validateParams(walletQuerySchema),
  async (req, res) => {
    try {
      const wallet = req.params.wallet;
      if (!ethers.isAddress(wallet)) {
        return res
          .status(400)
          .json({ success: false, error: "invalid wallet" });
      }
      const gacha = getGacha();
      const ids: readonly bigint[] = await gacha.owned(wallet);
      const tokenIds = ids.map((b) => b.toString());
      return res.json({
        success: true,
        wallet,
        tokenIds,
        count: tokenIds.length,
      });
    } catch (e: any) {
      const { logDetails } = sanitizeErrorResponse(e, "gacha/owned");
      console.error("gacha/owned error:", logDetails);
      return res.status(500).json(createErrorResponse(e, "Internal error"));
    }
  }
);

export default router;
