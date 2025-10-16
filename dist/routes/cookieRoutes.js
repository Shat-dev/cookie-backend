"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ethers_1 = require("ethers");
const rateLimiting_1 = require("../middleware/rateLimiting");
const validation_1 = require("../middleware/validation");
const auditLogger_1 = require("../utils/auditLogger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const rpcProvider_1 = require("../utils/rpcProvider");
const networkConfig_1 = require("../utils/networkConfig");
const router = express_1.default.Router();
const provider = rpcProvider_1.robustRpcProvider.getProvider();
function requireEnv(name) {
    const v = process.env[name]?.trim();
    if (!v)
        throw new Error(`Missing env: ${name}`);
    return v;
}
function normalizeAbi(raw) {
    if (Array.isArray(raw))
        return raw;
    if (raw?.abi && Array.isArray(raw.abi))
        return raw.abi;
    if (raw?.default && Array.isArray(raw.default))
        return raw.default;
    throw new Error("CookieABI.json invalid. Expect array or { abi: [] }.");
}
function tryLoadJson(p) {
    try {
        return JSON.parse(fs_1.default.readFileSync(p, "utf8"));
    }
    catch {
        return null;
    }
}
function loadAbi() {
    const candidates = [
        path_1.default.join(__dirname, "../constants/CookieABI.json"),
        path_1.default.join(__dirname, "../../src/constants/CookieABI.json"),
    ];
    for (const p of candidates) {
        const j = tryLoadJson(p);
        if (j)
            return normalizeAbi(j);
    }
    throw new Error("CookieABI.json not found in constants/");
}
function resolveAddress() {
    if (!ethers_1.ethers.isAddress(networkConfig_1.COOKIE_CONTRACT_ADDRESS)) {
        throw new Error(`COOKIE_CONTRACT_ADDRESS invalid: ${networkConfig_1.COOKIE_CONTRACT_ADDRESS}`);
    }
    return networkConfig_1.COOKIE_CONTRACT_ADDRESS;
}
let cookieSingleton = null;
function getCookie() {
    if (cookieSingleton)
        return cookieSingleton;
    const address = resolveAddress();
    const abi = loadAbi();
    cookieSingleton = new ethers_1.ethers.Contract(address, abi, provider);
    return cookieSingleton;
}
router.get("/cookie/owned/:wallet", rateLimiting_1.publicDataRateLimit, (0, validation_1.validateParams)(validation_1.walletQuerySchema), async (req, res) => {
    try {
        const wallet = req.params.wallet;
        if (!ethers_1.ethers.isAddress(wallet)) {
            return res
                .status(400)
                .json({ success: false, error: "invalid wallet" });
        }
        const cookie = getCookie();
        const ids = await cookie.owned(wallet);
        const tokenIds = ids.map((b) => b.toString());
        return res.json({
            success: true,
            wallet,
            tokenIds,
            count: tokenIds.length,
        });
    }
    catch (e) {
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(e, "cookie/owned");
        console.error("cookie/owned error:", logDetails);
        return res.status(500).json((0, auditLogger_1.createErrorResponse)(e, "Internal error"));
    }
});
exports.default = router;
//# sourceMappingURL=cookieRoutes.js.map