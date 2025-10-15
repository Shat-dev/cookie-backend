"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastDeleteSweep = fastDeleteSweep;
const entryRepository_1 = require("../db/entryRepository");
const twitterService_1 = require("./twitterService");
const auditLogger_1 = require("../utils/auditLogger");
const FAST_DELETE_LIMIT = Number(process.env.FAST_DELETE_LIMIT || 100);
const MAX_DELETIONS_PER_SWEEP = Number(process.env.MAX_DELETIONS_PER_SWEEP || 5);
const twitter = new twitterService_1.TwitterService();
async function fastDeleteSweep() {
    const ids = await entryRepository_1.entryRepository.getDistinctTweetIds(FAST_DELETE_LIMIT);
    if (ids.length === 0)
        return;
    const numericIds = ids.filter((id) => /^\d+$/.test(id));
    if (numericIds.length === 0)
        return;
    console.log(`[fastDeleteSweep] scanning ${numericIds.length} tweet ids…`);
    let alive;
    try {
        alive = await twitter.getTweetsByIds(numericIds);
        if (!(alive instanceof Set)) {
            console.error(`[fastDeleteSweep] TwitterService returned invalid data type. Expected Set<string>.`);
            return;
        }
    }
    catch (e) {
        const status = e?.response?.status;
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(e, "Tweet lookup failed");
        console.warn(`[fastDeleteSweep] lookup failed${status ? ` [${status}]` : ""}:`, logDetails);
        return;
    }
    const missingIds = numericIds.filter((id) => !alive.has(id));
    let confirmedDeleted = [];
    if (missingIds.length > 0) {
        console.log(`[fastDeleteSweep] verifying ${missingIds.length} potentially deleted tweets...`);
        try {
            const secondCheckAlive = await twitter.getTweetsByIds(missingIds);
            confirmedDeleted = missingIds.filter((id) => !secondCheckAlive.has(id));
        }
        catch (retryErr) {
            console.warn(`[fastDeleteSweep] retry check failed — skipping deletions for safety.`, retryErr?.message || retryErr);
            return;
        }
    }
    if (confirmedDeleted.length === 0) {
        console.log(`[fastDeleteSweep] 0 confirmed deletions after verification`);
        return;
    }
    console.warn(`⚠️ [fastDeleteSweep] DELETION ALERT: ${confirmedDeleted.length}/${numericIds.length} tweets confirmed deleted`);
    if (confirmedDeleted.length > MAX_DELETIONS_PER_SWEEP) {
        console.error(`🚨 [fastDeleteSweep] SAFETY ABORT: Attempted to delete ${confirmedDeleted.length} tweets, but MAX_DELETIONS_PER_SWEEP is ${MAX_DELETIONS_PER_SWEEP}`);
        console.error(`🚨 Skipping deletions for safety. Potential API inconsistency.`);
        console.error(`🚨 Would have deleted: ${confirmedDeleted.slice(0, 5).join(", ")}${confirmedDeleted.length > 5 ? "..." : ""}`);
        return;
    }
    let deletedCount = 0;
    for (const tid of confirmedDeleted) {
        try {
            console.warn(`🗑️ [fastDeleteSweep] CONFIRMED DELETION: Removing entries for tweet ${tid}`);
            await entryRepository_1.entryRepository.deleteEntriesByTweetId(tid);
            deletedCount++;
        }
        catch (dbErr) {
            console.error(`[fastDeleteSweep] DB deletion failed for ${tid}:`);
        }
    }
    console.log(`[fastDeleteSweep] Safely purged ${deletedCount} confirmed deleted tweets`);
}
//# sourceMappingURL=fastDeleteSweep.js.map