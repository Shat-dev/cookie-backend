"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entryController = void 0;
const entryRepository_1 = require("../db/entryRepository");
const auditLogger_1 = require("../utils/auditLogger");
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
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch current pool");
        console.error("Error fetching current pool:", logDetails);
        const response = (0, auditLogger_1.createErrorResponse)(error, "Failed to fetch current pool");
        res.status(500).json(response);
    }
}
async function submitEntry(req, res) {
    const startTime = auditLogger_1.auditLogger.startTimer();
    try {
        const { tokenId } = (req.body ?? {});
        const token = String(tokenId || "").trim();
        (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.SUBMIT_ENTRY, req, {
            tokenId: token,
            method: "manual",
        });
        if (!token) {
            const errorMsg = "Token ID is required";
            (0, auditLogger_1.auditFailure)(auditLogger_1.AuditActionType.SUBMIT_ENTRY, req, errorMsg, {
                tokenId: !!tokenId,
                received: tokenId,
            }, startTime);
            const response = {
                success: false,
                error: errorMsg,
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
        (0, auditLogger_1.auditSuccess)(auditLogger_1.AuditActionType.SUBMIT_ENTRY, req, {
            tokenId: token,
            tweetId,
            walletAddress,
            method: "manual",
            verified: true,
        }, startTime);
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
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to submit entry");
        console.error("Error submitting entry:", logDetails);
        (0, auditLogger_1.auditFailure)(auditLogger_1.AuditActionType.SUBMIT_ENTRY, req, logDetails.message || "Unknown error", {
            error: logDetails.message,
            stack: logDetails.stack?.split("\n")?.[0],
        }, startTime);
        const response = (0, auditLogger_1.createErrorResponse)(error, "Failed to submit entry");
        res.status(500).json(response);
    }
}
async function verifyEntry(req, res) {
    const startTime = auditLogger_1.auditLogger.startTimer();
    try {
        const { tweetUrl, walletAddress, tokenId } = (req.body ??
            {});
        const url = String(tweetUrl || "").trim();
        const wallet = String(walletAddress || "").trim();
        const token = String(tokenId || "").trim();
        (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.VERIFY_ENTRY, req, {
            tweetUrl: url,
            walletAddress: wallet,
            tokenId: token,
        });
        if (!url || !wallet || !token) {
            const errorMsg = "Tweet URL, wallet address, and token ID are required";
            (0, auditLogger_1.auditFailure)(auditLogger_1.AuditActionType.VERIFY_ENTRY, req, errorMsg, {
                tweetUrl: !!url,
                walletAddress: !!wallet,
                tokenId: !!token,
                received: { url, wallet, token },
            }, startTime);
            const response = {
                success: false,
                error: errorMsg,
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
        (0, auditLogger_1.auditSuccess)(auditLogger_1.AuditActionType.VERIFY_ENTRY, req, {
            tweetId,
            tweetUrl: url,
            walletAddress: wallet,
            tokenId: token,
            verified: true,
            method: "manual",
        }, startTime);
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
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to verify entry");
        console.error("Error verifying entry:", logDetails);
        (0, auditLogger_1.auditFailure)(auditLogger_1.AuditActionType.VERIFY_ENTRY, req, logDetails.message || "Unknown error", {
            error: logDetails.message,
            stack: logDetails.stack?.split("\n")?.[0],
        }, startTime);
        const response = (0, auditLogger_1.createErrorResponse)(error, "Failed to verify entry");
        res.status(500).json(response);
    }
}
exports.entryController = {
    getCurrentPool,
    submitEntry,
    verifyEntry,
};
//# sourceMappingURL=entryController.js.map