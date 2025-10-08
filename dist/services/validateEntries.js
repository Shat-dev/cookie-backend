"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEntries = validateEntries;
const connection_1 = __importDefault(require("../db/connection"));
const entryRepository_1 = require("../db/entryRepository");
const ownershipUtils_1 = require("../utils/ownershipUtils");
const twitterService_1 = require("./twitterService");
const schedulerRepository_1 = require("../db/schedulerRepository");
const xLimiter_1 = require("../utils/xLimiter");
const twitterService = new twitterService_1.TwitterService();
const isNumericId = (s) => /^\d+$/.test(s);
async function validateEntries(finalSweep = false) {
    const startTime = Date.now();
    try {
        const rows = await entryRepository_1.entryRepository.getAllEntries();
        if (!rows.length) {
            console.log("[validateEntries] no rows to validate.");
            const duration = Date.now() - startTime;
            await schedulerRepository_1.schedulerRepository.updateHeartbeat("validateEntries", duration);
            return;
        }
        const byTweet = new Map();
        for (const row of rows) {
            const tid = row.tweet_id;
            if (!byTweet.has(tid)) {
                byTweet.set(tid, {
                    tweet_id: tid,
                    wallet_address: row.wallet_address.toLowerCase(),
                    tweet_url: row.tweet_url,
                    tokens: new Set(),
                });
            }
            byTweet.get(tid).tokens.add(String(row.token_id));
        }
        const allTweetIds = Array.from(byTweet.keys());
        const invalidTweetIds = allTweetIds.filter((id) => !isNumericId(id));
        if (invalidTweetIds.length) {
            console.warn(`[validateEntries] purging ${invalidTweetIds.length} invalid tweet_id rows (non-numeric). Example(s):`, invalidTweetIds.slice(0, 5));
            for (const badId of invalidTweetIds) {
                await entryRepository_1.entryRepository.deleteEntriesByTweetId(badId);
                byTweet.delete(badId);
            }
        }
        const validTweetIds = Array.from(byTweet.keys());
        if (!validTweetIds.length) {
            console.log("[validateEntries] no valid tweet_ids after purge.");
            return;
        }
        console.log(`[validateEntries] checking ${validTweetIds.length} tweets... (finalSweep=${finalSweep})`);
        const CHUNK = finalSweep ? 50 : 100;
        const maxBatchesEnv = Number(process.env.VALIDATE_MAX_BATCHES_PER_RUN || 3);
        const maxBatchesPerRun = finalSweep
            ? Number.MAX_SAFE_INTEGER
            : maxBatchesEnv;
        let processedBatches = 0;
        let totalProcessed = 0;
        for (let i = 0; i < validTweetIds.length; i += CHUNK) {
            if (!finalSweep && processedBatches >= maxBatchesPerRun) {
                console.log(`[validateEntries] reached batch cap (${maxBatchesEnv}); finishing this run.`);
                break;
            }
            const slice = validTweetIds.slice(i, i + CHUNK);
            const batchStartTime = Date.now();
            let existingSet;
            try {
                if (finalSweep) {
                    existingSet = await (0, xLimiter_1.budget)("tweetLookup", 1, async () => {
                        return await twitterService.getTweetsByIds(slice);
                    });
                }
                else {
                    existingSet = await twitterService.getTweetsByIds(slice);
                }
            }
            catch (e) {
                const status = e?.response?.status;
                const msg = e?.response?.data || e?.message || e;
                console.error(`[validateEntries] getTweetsByIds failed for batch (${slice.length})${status ? ` [${status}]` : ""}:`, msg);
                processedBatches++;
                continue;
            }
            const deletedIds = slice.filter((id) => !existingSet.has(id));
            const aliveIds = slice.filter((id) => existingSet.has(id));
            for (const delId of deletedIds) {
                await entryRepository_1.entryRepository.deleteEntriesByTweetId(delId);
                console.log(`🗑️ Deleted ALL entries for deleted tweet: ${delId}`);
            }
            for (const tid of aliveIds) {
                const group = byTweet.get(tid);
                const wallet = group.wallet_address;
                const tweetUrl = group.tweet_url;
                const ownedNow = await (0, ownershipUtils_1.getAllDecodedOwnedTokenIds)(wallet);
                const ownedSet = new Set(ownedNow.map(String));
                const dbTokens = group.tokens;
                const toRemove = [];
                for (const token of dbTokens) {
                    if (!ownedSet.has(token))
                        toRemove.push(token);
                }
                if (toRemove.length > 0) {
                    for (const tokenId of toRemove) {
                        await connection_1.default.query(`DELETE FROM entries WHERE tweet_id = $1 AND token_id = $2`, [tid, tokenId]);
                        dbTokens.delete(tokenId);
                    }
                    console.log(`🔄 ${tid}: Removed ${toRemove.length} token(s) no longer owned.`);
                }
                const toAdd = [];
                for (const token of ownedSet) {
                    if (!dbTokens.has(token))
                        toAdd.push(token);
                }
                if (toAdd.length > 0) {
                    await entryRepository_1.entryRepository.upsertManyTokenEntries({
                        tweet_id: tid,
                        wallet_address: wallet,
                        token_ids: toAdd,
                        tweet_url: tweetUrl,
                        verified: true,
                    });
                    toAdd.forEach((t) => dbTokens.add(t));
                    console.log(`➕ ${tid}: Auto-added ${toAdd.length} newly acquired token(s).`);
                }
                console.log(`✅ ${tid}: Synced. Total tokens now: ${dbTokens.size} (wallet ${wallet})`);
            }
            processedBatches++;
            totalProcessed += slice.length;
            const batchDuration = Date.now() - batchStartTime;
            if (finalSweep) {
                const progress = (((i + slice.length) / validTweetIds.length) *
                    100).toFixed(1);
                console.log(`📊 [validateEntries] Final sweep progress: ${progress}% (${i + slice.length}/${validTweetIds.length}) - Batch ${processedBatches} completed in ${batchDuration}ms`);
                if (i + CHUNK < validTweetIds.length) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        }
        const duration = Date.now() - startTime;
        await schedulerRepository_1.schedulerRepository.updateHeartbeat("validateEntries", duration);
        console.log(`[validateEntries] completed in ${duration}ms - Processed ${totalProcessed} tweets in ${processedBatches} batches`);
    }
    catch (error) {
        await schedulerRepository_1.schedulerRepository.recordError("validateEntries");
        console.error("[validateEntries] failed:", error?.message || error);
        throw error;
    }
}
//# sourceMappingURL=validateEntries.js.map