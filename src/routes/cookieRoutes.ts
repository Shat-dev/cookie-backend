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
    path.join(__dirname, "../constants/CookieABI.json"),
    path.join(__dirname, "../../src/constants/CookieABI.json"),
  ];
  for (const p of candidates) {
    const j = tryLoadJson(p);
    if (j) return normalizeAbi(j);
  }
  throw new Error("CookieABI.json not found in constants/");
}

function resolveAddress(): string {
  const envAddr = process.env.COOKIE_ADDRESS?.trim();
  if (envAddr) {
    if (!ethers.isAddress(envAddr))
      throw new Error(`COOKIE_ADDRESS invalid: ${envAddr}`);
    return envAddr;
  }
  const candidates = [
    path.join(__dirname, "../constants/contract-address.json"),
    path.join(__dirname, "../../src/constants/contract-address.json"),
  ];
  for (const p of candidates) {
    const j = tryLoadJson(p);
    const a = j?.Cookie?.trim?.();
    if (a && ethers.isAddress(a)) return a;
  }
  throw new Error(
    "Cookie address missing. Set COOKIE_ADDRESS or provide constants/contract-address.json"
  );
}

let cookieSingleton: ethers.Contract | null = null;
function getCookie(): ethers.Contract {
  if (cookieSingleton) return cookieSingleton;
  const address = resolveAddress();
  const abi = loadAbi();
  cookieSingleton = new ethers.Contract(address, abi, provider);
  return cookieSingleton;
}

// ---- routes ----
router.get(
  "/cookie/owned/:wallet",
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
      const cookie = getCookie();
      const ids: readonly bigint[] = await cookie.owned(wallet);
      const tokenIds = ids.map((b) => b.toString());
      return res.json({
        success: true,
        wallet,
        tokenIds,
        count: tokenIds.length,
      });
    } catch (e: any) {
      const { logDetails } = sanitizeErrorResponse(e, "cookie/owned");
      console.error("cookie/owned error:", logDetails);
      return res.status(500).json(createErrorResponse(e, "Internal error"));
    }
  }
);

export default router;
