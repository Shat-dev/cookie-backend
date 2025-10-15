"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ethers_1 = require("ethers");
const rateLimiting_1 = require("../middleware/rateLimiting");
const lotteryClient_1 = require("../lotteryClient");
const entryRepository_1 = require("../db/entryRepository");
const auditLogger_1 = require("../utils/auditLogger");
const contract_address_json_1 = __importDefault(require("../constants/contract-address.json"));
const COOKIE_ADDRESS = contract_address_json_1.default.Cookie;
const router = (0, express_1.Router)();
const COOKIE_ABI = ["function owned(address owner) view returns (uint256[])"];
const cookie = new ethers_1.ethers.Contract(COOKIE_ADDRESS, COOKIE_ABI, lotteryClient_1.provider);
let cached = null;
let last = 0;
const TTL = Number(process.env.PROJECTION_TTL_MS) || 60000;
async function getUniqueTweetingWallets() {
    const rows = await entryRepository_1.entryRepository.getAllEntries();
    const set = new Set(rows.map((r) => r.wallet_address.toLowerCase()));
    return Array.from(set);
}
router.get("/current-projections", rateLimiting_1.publicDataRateLimit, async (_req, res) => {
    try {
        const now = Date.now();
        if (cached && now - last < TTL) {
            res.json(cached);
            return;
        }
        const wallets = await getUniqueTweetingWallets();
        const data = [];
        for (const w of wallets) {
            try {
                const ids = await cookie.owned(w);
                data.push({
                    wallet_address: w,
                    token_ids: ids.map((b) => b.toString()),
                });
            }
            catch {
                data.push({ wallet_address: w, token_ids: [] });
            }
        }
        cached = { success: true, data };
        last = now;
        res.json(cached);
        return;
    }
    catch (e) {
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(e, "Failed to get projections");
        console.error("Projection route error:", logDetails);
        res.status(500).json((0, auditLogger_1.createErrorResponse)(e, "Failed to get projections"));
        return;
    }
});
exports.default = router;
//# sourceMappingURL=projectionRoutes.js.map