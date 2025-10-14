"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCookieContract = getCookieContract;
exports.getTokenIdsOwnedBy = getTokenIdsOwnedBy;
exports.getAllDecodedOwnedTokenIds = getAllDecodedOwnedTokenIds;
const ethers_1 = require("ethers");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
dotenv_1.default.config();
function requireEnv(name) {
    const v = process.env[name];
    if (!v || !v.trim())
        throw new Error(`❌ Missing required env var: ${name}`);
    return v.trim();
}
const NETWORK = process.env.NETWORK || "base-sepolia";
const RPC_URL = NETWORK === "base-mainnet"
    ? requireEnv("BASE_MAINNET_RPC_URL")
    : requireEnv("BASE_SEPOLIA_RPC_URL");
const COOKIE_ADDRESS = requireEnv("COOKIE_ADDRESS");
if (!ethers_1.ethers.isAddress(COOKIE_ADDRESS)) {
    throw new Error(`❌ COOKIE_ADDRESS is not a valid address: ${COOKIE_ADDRESS}`);
}
const ABI_PATH = path_1.default.join(__dirname, "../constants/CookieABI.json");
if (!fs_1.default.existsSync(ABI_PATH))
    throw new Error(`❌ ABI not found: ${ABI_PATH}`);
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
const provider = new ethers_1.ethers.JsonRpcProvider(RPC_URL);
function getCookieContract() {
    return new ethers_1.ethers.Contract(COOKIE_ADDRESS, CookieABI, provider);
}
const ID_PREFIX = 1n << 255n;
const isEncoded = (n) => n >= ID_PREFIX;
const decodeId = (n) => (isEncoded(n) ? n - ID_PREFIX : n);
async function getTokenIdsOwnedBy(walletAddress, knownTokenIds) {
    const contract = getCookieContract();
    let encodedOwned;
    try {
        encodedOwned = await contract.owned(walletAddress);
    }
    catch (e) {
        console.error("owned(wallet) failed for", walletAddress, e);
        return [];
    }
    if (!encodedOwned?.length)
        return [];
    const ownedSet = new Set(encodedOwned.map((raw) => decodeId(raw).toString()));
    return knownTokenIds.filter((id) => ownedSet.has(id));
}
async function getAllDecodedOwnedTokenIds(walletAddress) {
    const contract = getCookieContract();
    try {
        const encodedOwned = await contract.owned(walletAddress);
        return (encodedOwned || []).map((raw) => decodeId(raw).toString());
    }
    catch (e) {
        console.error("owned(wallet) failed for", walletAddress, e);
        return [];
    }
}
//# sourceMappingURL=ownershipUtils.js.map