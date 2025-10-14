import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

/* ---------- env helpers ---------- */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`❌ Missing required env var: ${name}`);
  return v.trim();
}

// Use the appropriate RPC URL based on network environment
const NETWORK = process.env.NETWORK || "base-sepolia";
const RPC_URL =
  NETWORK === "base-mainnet"
    ? requireEnv("BASE_MAINNET_RPC_URL")
    : requireEnv("BASE_SEPOLIA_RPC_URL");
const COOKIE_ADDRESS = requireEnv("COOKIE_ADDRESS");
if (!ethers.isAddress(COOKIE_ADDRESS)) {
  throw new Error(
    `❌ COOKIE_ADDRESS is not a valid address: ${COOKIE_ADDRESS}`
  );
}

/* ---------- ABI loader (supports array / {abi} / {default}) ---------- */
const ABI_PATH = path.join(__dirname, "../constants/CookieABI.json");
if (!fs.existsSync(ABI_PATH)) throw new Error(`❌ ABI not found: ${ABI_PATH}`);

const ABI_MODULE = require(ABI_PATH);
const CookieABI = Array.isArray(ABI_MODULE)
  ? ABI_MODULE
  : Array.isArray(ABI_MODULE?.abi)
  ? ABI_MODULE.abi
  : Array.isArray(ABI_MODULE?.default)
  ? ABI_MODULE.default
  : null;

if (!Array.isArray(CookieABI)) {
  throw new Error("❌ CookieABI.json must be an ABI array (or { abi: [] }).");
}

/* ---------- provider / contract factory ---------- */
const provider = new ethers.JsonRpcProvider(RPC_URL);
export function getCookieContract() {
  return new ethers.Contract(COOKIE_ADDRESS, CookieABI, provider);
}

/* ---------- ERC-404 helpers ---------- */
const ID_PREFIX = 1n << 255n;
const isEncoded = (n: bigint) => n >= ID_PREFIX;
const decodeId = (n: bigint) => (isEncoded(n) ? n - ID_PREFIX : n);

/**
 * Returns which of `knownTokenIds` are currently owned by `walletAddress`.
 * Uses a single `owned(wallet)` read (fast + ERC-404 aware).
 */
export async function getTokenIdsOwnedBy(
  walletAddress: string,
  knownTokenIds: string[]
): Promise<string[]> {
  const contract = getCookieContract();

  let encodedOwned: bigint[];
  try {
    encodedOwned = await contract.owned(walletAddress);
  } catch (e) {
    console.error("owned(wallet) failed for", walletAddress, e);
    return [];
  }
  if (!encodedOwned?.length) return [];

  // Decode to human IDs and index in a Set for quick intersection
  const ownedSet = new Set(
    encodedOwned.map((raw: bigint) => decodeId(raw).toString())
  );

  // Intersect with the list we’re validating
  return knownTokenIds.filter((id) => ownedSet.has(id));
}

/** (Optional) Get *all* decoded token IDs owned by a wallet. */
export async function getAllDecodedOwnedTokenIds(
  walletAddress: string
): Promise<string[]> {
  const contract = getCookieContract();
  try {
    const encodedOwned: bigint[] = await contract.owned(walletAddress);
    return (encodedOwned || []).map((raw) => decodeId(raw).toString());
  } catch (e) {
    console.error("owned(wallet) failed for", walletAddress, e);
    return [];
  }
}
