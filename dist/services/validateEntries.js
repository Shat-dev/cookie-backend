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
const auditLogger_1 = require("../utils/auditLogger");
const twitterService = new twitterService_1.TwitterService();
const MAX_DELETIONS_PER_RUN = Number(process.env.MAX_DELETIONS_PER_RUN || 100);
const MASS_DELETION_THRESHOLD = Number(process.env.MASS_DELETION_THRESHOLD || 0.9);
const DELETION_SAFETY_THRESHOLD = Number(process.env.VALIDATE_DELETION_THRESHOLD || 0.9);
const isNumericId = (s) => /^\d+$/.test(s);
async function validateEntries(finalSweep = false) {
    const rows = await entryRepository_1.entryRepository.getAllEntries();
    if (!rows.length) {
        console.log("[validateEntries] no rows to validate.");
        return;
    }
    const initialEntryCount = rows.length;
    const counters = {
        entryDeletions: 0,
        tweetsDeleted: 0,
    };
    const byTweet = new Map();
    for (const row of rows) {
        const tid = row.tweet_id;
        let g = byTweet.get(tid);
        if (!g) {
            g = {
                tweet_id: tid,
                wallet_address: row.wallet_address.toLowerCase(),
                tweet_url: row.tweet_url,
                tokens: new Set(),
            };
            byTweet.set(tid, g);
        }
        g.tokens.add(String(row.token_id));
    }
    const allTweetIds = Array.from(byTweet.keys());
    const invalidTweetIds = allTweetIds.filter((id) => !isNumericId(id));
    if (invalidTweetIds.length) {
        console.warn(`[validateEntries] purging ${invalidTweetIds.length} invalid tweet_id rows (non-numeric). Example(s):`, invalidTweetIds.slice(0, 5));
        for (const badId of invalidTweetIds) {
            const g = byTweet.get(badId);
            const rowsForBad = g ? g.tokens.size : 0;
            if (wouldExceedEntryCap(counters.entryDeletions + rowsForBad, initialEntryCount)) {
                console.error(capMsg("purge-invalid", counters.entryDeletions + rowsForBad, initialEntryCount));
                return;
            }
            await entryRepository_1.entryRepository.deleteEntriesByTweetId(badId);
            counters.entryDeletions += rowsForBad;
            byTweet.delete(badId);
        }
    }
    const validTweetIds = Array.from(byTweet.keys());
    if (!validTweetIds.length) {
        console.log("[validateEntries] no valid tweet_ids after purge.");
        return;
    }
    console.log(`[validateEntries] checking ${validTweetIds.length} tweets... (finalSweep=${finalSweep})`);
    const CHUNK = 100;
    const maxBatchesEnv = Number(process.env.VALIDATE_MAX_BATCHES_PER_RUN || 3);
    const maxBatchesPerRun = finalSweep ? Number.MAX_SAFE_INTEGER : maxBatchesEnv;
    let processedBatches = 0;
    for (let i = 0; i < validTweetIds.length; i += CHUNK) {
        if (!finalSweep && processedBatches >= maxBatchesPerRun) {
            console.log(`[validateEntries] reached batch cap (${maxBatchesPerRun}); finishing this run.`);
            break;
        }
        const slice = validTweetIds.slice(i, i + CHUNK);
        let existingSet;
        try {
            existingSet = await twitterService.getTweetsByIds(slice);
        }
        catch (e) {
            const status = e?.response?.status;
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(e, "Tweet validation failed");
            console.error(`[validateEntries] getTweetsByIds failed for batch (${slice.length})${status ? ` [${status}]` : ""}:`, logDetails);
            processedBatches++;
            continue;
        }
        if (existingSet.size === 0 && slice.length > 0) {
            console.error(`🚫 [validateEntries] DOUBLE-VERIFY SAFEGUARD: 0/${slice.length} tweets returned from batch API call. ` +
                `This could indicate an API outage. Aborting entire validation run to prevent accidental mass deletions.`);
            return;
        }
        if (existingSet.size < slice.length) {
            const missingCount = slice.length - existingSet.size;
            const missingPct = (missingCount / slice.length) * 100;
            console.warn(`⚠️  [validateEntries] PARTIAL RESULT ${existingSet.size}/${slice.length} (${missingPct.toFixed(1)}% missing)`);
            if (missingPct > 50) {
                console.warn(`🚫 [validateEntries] Skipping deletions for this batch due to incompleteness`);
                const aliveIds = slice.filter((id) => existingSet.has(id));
                await processTweetOwnershipSync(aliveIds, byTweet, counters, initialEntryCount);
                processedBatches++;
                continue;
            }
        }
        const potentiallyDeletedIds = slice.filter((id) => !existingSet.has(id));
        const aliveIds = slice.filter((id) => existingSet.has(id));
        if (potentiallyDeletedIds.length > 0) {
            console.log(`🔍 [validateEntries] Double-verifying ${potentiallyDeletedIds.length} tweets missing from first check...`);
            for (const tweetId of potentiallyDeletedIds) {
                if (counters.tweetsDeleted >= MAX_DELETIONS_PER_RUN) {
                    console.error(`⛔ [validateEntries] MAX_DELETIONS_PER_RUN (${MAX_DELETIONS_PER_RUN}) reached. Aborting further deletions.`);
                    await processTweetOwnershipSync(aliveIds, byTweet, counters, initialEntryCount);
                    processedBatches++;
                    return;
                }
                const projectedTweetDeletionRatio = (counters.tweetsDeleted + 1) / validTweetIds.length;
                if (projectedTweetDeletionRatio > MASS_DELETION_THRESHOLD) {
                    console.error(`⛔ [validateEntries] MASS_DELETION_THRESHOLD (${MASS_DELETION_THRESHOLD * 100}%) would be exceeded by deleting tweet ${tweetId}. Aborting run.`);
                    return;
                }
                const isDeleted = await twitterService.verifyTweetDeletion(tweetId);
                if (isDeleted) {
                    const group = byTweet.get(tweetId);
                    const rowsForTweet = group ? group.tokens.size : 0;
                    const projectedEntryDeletions = counters.entryDeletions + rowsForTweet;
                    if (wouldExceedEntryCap(projectedEntryDeletions, initialEntryCount)) {
                        console.error(capMsg("tweet-delete", projectedEntryDeletions, initialEntryCount));
                        return;
                    }
                    await entryRepository_1.entryRepository.deleteEntriesByTweetId(tweetId);
                    counters.entryDeletions += rowsForTweet;
                    counters.tweetsDeleted += 1;
                    console.warn(`🗑️  [validateEntries] DOUBLE-VERIFY CONFIRMED: tweet ${tweetId} deleted → removed ${rowsForTweet} entries (totals: entries=${counters.entryDeletions}, tweets=${counters.tweetsDeleted})`);
                    byTweet.delete(tweetId);
                }
                else {
                    aliveIds.push(tweetId);
                    console.log(`✅ [validateEntries] DOUBLE-VERIFY SAFEGUARD: Tweet ${tweetId} missing from first check but exists on second check - treating as alive.`);
                }
                await sleep(100);
            }
        }
        await processTweetOwnershipSync(aliveIds, byTweet, counters, initialEntryCount);
        processedBatches++;
    }
}
async function processTweetOwnershipSync(aliveIds, byTweet, counters, initialEntryCount) {
    for (const tid of aliveIds) {
        const group = byTweet.get(tid);
        if (!group)
            continue;
        const wallet = group.wallet_address;
        const tweetUrl = group.tweet_url;
        const ownedNow = await (0, ownershipUtils_1.getAllDecodedOwnedTokenIds)(wallet);
        const ownedSet = new Set(ownedNow.map(String));
        const dbTokens = group.tokens;
        if (dbTokens.size > 0 && ownedNow.length === 0) {
            console.warn(`⚠️  [validateEntries] Wallet ${wallet} has ${dbTokens.size} DB tokens but ownership returned empty. Rechecking...`);
            await sleep(1500);
            const ownedRecheck = await (0, ownershipUtils_1.getAllDecodedOwnedTokenIds)(wallet);
            if (ownedRecheck.length === 0) {
                const rowsForTweet = dbTokens.size;
                const projected = counters.entryDeletions + rowsForTweet;
                if (wouldExceedEntryCap(projected, initialEntryCount)) {
                    console.error(capMsg("tweet-prune-zero-owned", projected, initialEntryCount));
                    return;
                }
                await entryRepository_1.entryRepository.deleteEntriesByTweetId(tid);
                counters.entryDeletions += rowsForTweet;
                byTweet.delete(tid);
                console.log(`🧹 [validateEntries] ${tid}: pruned ${rowsForTweet} token(s) (confirmed zero owned on-chain).`);
                continue;
            }
            ownedRecheck.forEach((t) => ownedSet.add(String(t)));
        }
        const toRemove = [];
        for (const token of dbTokens) {
            if (!ownedSet.has(token))
                toRemove.push(token);
        }
        if (toRemove.length > 0) {
            const projected = counters.entryDeletions + toRemove.length;
            if (wouldExceedEntryCap(projected, initialEntryCount)) {
                console.error(capMsg("token-prune", projected, initialEntryCount));
                return;
            }
            for (const tokenId of toRemove) {
                await connection_1.default.query(`DELETE FROM entries WHERE tweet_id = $1 AND token_id = $2`, [tid, tokenId]);
                dbTokens.delete(tokenId);
            }
            counters.entryDeletions += toRemove.length;
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
}
function wouldExceedEntryCap(projectedDeletions, initialTotal) {
    return projectedDeletions > initialTotal * DELETION_SAFETY_THRESHOLD;
}
function capMsg(context, projected, initialTotal) {
    return (`⛔ [validateEntries] SAFEGUARD (${context}): deleting ${projected}/${initialTotal} ` +
        `(${((projected / initialTotal) * 100).toFixed(1)}%) would exceed cap of ${DELETION_SAFETY_THRESHOLD * 100}%. Aborting.`);
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=validateEntries.js.map