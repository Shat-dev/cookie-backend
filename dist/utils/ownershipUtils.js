"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCookieContract = getCookieContract;
exports.getTokenIdsOwnedBy = getTokenIdsOwnedBy;
exports.getAllDecodedOwnedTokenIds = getAllDecodedOwnedTokenIds;
const ethers_1 = require("ethers");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const networkConfig_1 = require("./networkConfig");
const COOKIE_ADDRESS = networkConfig_1.COOKIE_CONTRACT_ADDRESS;
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
const provider = new ethers_1.ethers.JsonRpcProvider(networkConfig_1.RPC_URL);
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
    const maxRetries = 3;
    const baseDelay = 1000;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const encodedOwned = await contract.owned(walletAddress);
            return (encodedOwned || []).map((raw) => decodeId(raw).toString());
        }
        catch (e) {
            console.error(`owned(wallet) failed for ${walletAddress} (attempt ${attempt}/${maxRetries}):`, e);
            if (attempt === maxRetries) {
                console.error(`❌ Final attempt failed for getAllDecodedOwnedTokenIds(${walletAddress}). Returning empty array.`);
                return [];
            }
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`⏳ Retrying getAllDecodedOwnedTokenIds in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    return [];
}
//# sourceMappingURL=ownershipUtils.js.map