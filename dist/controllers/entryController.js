"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entryController = void 0;
const entryRepository_1 = require("../db/entryRepository");
async function getCurrentPool(_req, res) {
    try {
        const rows = await entryRepository_1.entryRepository.getAllEntries();
        const byWallet = new Map();
        for (const r of rows) {
            const w = r.wallet_address.toLowerCase();
            if (!byWallet.has(w))
                byWallet.set(w, new Set());
            byWallet.get(w).add(r.token_id);
        }
        const payload = Array.from(byWallet.entries()).map(([wallet_address, set]) => ({
            wallet_address,
            token_ids: Array.from(set),
        }));
        const response = {
            success: true,
            data: payload,
        };
        res.setHeader("Cache-Control", "no-store");
        res.json(response);
    }
    catch (error) {
        console.error("Error fetching current pool:", error);
        const response = {
            success: false,
            error: "Failed to fetch current pool",
        };
        res.status(500).json(response);
    }
}
async function submitEntry(req, res) {
    try {
        const { tokenId } = (req.body ?? {});
        const token = String(tokenId || "").trim();
        if (!token) {
            const response = {
                success: false,
                error: "Token ID is required",
            };
            res.status(400).json(response);
            return;
        }
        const walletAddress = "social_verified";
        const tweetId = `manual-${Date.now()}`;
        const tweetUrl = "https://manual-entry";
        await entryRepository_1.entryRepository.upsertTokenEntry({
            tweet_id: tweetId,
            wallet_address: walletAddress,
            token_id: token,
            tweet_url: tweetUrl,
            verified: true,
            image_url: null,
        });
        const response = {
            success: true,
            data: {
                id: 0,
                tweet_id: tweetId,
                wallet_address: walletAddress,
                token_id: token,
                tweet_url: tweetUrl,
                image_url: null,
                verified: true,
                created_at: new Date().toISOString(),
            },
        };
        res.status(201).json(response);
    }
    catch (error) {
        console.error("Error submitting entry:", error);
        const response = {
            success: false,
            error: "Failed to submit entry",
        };
        res.status(500).json(response);
    }
}
async function verifyEntry(req, res) {
    try {
        const { tweetUrl, walletAddress, tokenId } = (req.body ??
            {});
        const url = String(tweetUrl || "").trim();
        const wallet = String(walletAddress || "").trim();
        const token = String(tokenId || "").trim();
        if (!url || !wallet || !token) {
            const response = {
                success: false,
                error: "Tweet URL, wallet address, and token ID are required",
            };
            res.status(400).json(response);
            return;
        }
        const tweetId = url.match(/status\/(\d+)/)?.[1] || `verify-${Date.now()}`;
        await entryRepository_1.entryRepository.upsertTokenEntry({
            tweet_id: tweetId,
            wallet_address: wallet,
            token_id: token,
            tweet_url: url,
            verified: true,
            image_url: null,
        });
        const response = {
            success: true,
            data: {
                id: 0,
                tweet_id: tweetId,
                wallet_address: wallet,
                token_id: token,
                tweet_url: url,
                image_url: null,
                verified: true,
                created_at: new Date().toISOString(),
            },
        };
        res.json(response);
    }
    catch (error) {
        console.error("Error verifying entry:", error);
        const response = {
            success: false,
            error: "Failed to verify entry",
        };
        res.status(500).json(response);
    }
}
exports.entryController = {
    getCurrentPool,
    submitEntry,
    verifyEntry,
};
//# sourceMappingURL=entryController.js.map