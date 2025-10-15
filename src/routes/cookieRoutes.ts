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
import contractAddress from "../constants/contract-address.json";

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
  // Prioritize contract-address.json over environment variable
  const contractAddr = contractAddress.Cookie?.trim();
  if (contractAddr && ethers.isAddress(contractAddr)) {
    return contractAddr;
  }

  // Fallback to environment variable
  const envAddr = process.env.COOKIE_ADDRESS?.trim();
  if (envAddr) {
    if (!ethers.isAddress(envAddr))
      throw new Error(`COOKIE_ADDRESS invalid: ${envAddr}`);
    return envAddr;
  }

  throw new Error(
    "Cookie address missing. Provide constants/contract-address.json or set COOKIE_ADDRESS"
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
