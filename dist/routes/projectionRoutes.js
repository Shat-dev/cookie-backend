"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ethers_1 = require("ethers");
const lotteryClient_1 = require("../lotteryClient");
const entryRepository_1 = require("../db/entryRepository");
const GACHA_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";
const GACHA_ABI = ["function owned(address owner) view returns (uint256[])"];
const gacha = new ethers_1.ethers.Contract(GACHA_ADDRESS, GACHA_ABI, lotteryClient_1.provider);
const router = (0, express_1.Router)();
let cached = null;
let last = 0;
const TTL = Number(process.env.PROJECTION_TTL_MS) || 60000;
async function getUniqueTweetingWallets() {
    const rows = await entryRepository_1.entryRepository.getAllEntries();
    const set = new Set(rows.map((r) => r.wallet_address.toLowerCase()));
    return Array.from(set);
}
router.get("/current-projections", async (_req, res) => {
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
                const ids = await gacha.owned(w);
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
        res.status(500).json({ success: false, error: e?.message || "failed" });
        return;
    }
});
exports.default = router;
//# sourceMappingURL=projectionRoutes.js.map