"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastDeleteSweep = fastDeleteSweep;
const entryRepository_1 = require("../db/entryRepository");
const twitterService_1 = require("./twitterService");
const schedulerRepository_1 = require("../db/schedulerRepository");
const FAST_DELETE_LIMIT = Number(process.env.FAST_DELETE_LIMIT || 100);
const twitter = new twitterService_1.TwitterService();
async function fastDeleteSweep() {
    const startTime = Date.now();
    try {
        const ids = await entryRepository_1.entryRepository.getDistinctTweetIds(FAST_DELETE_LIMIT);
        if (ids.length === 0) {
            const duration = Date.now() - startTime;
            await schedulerRepository_1.schedulerRepository.updateHeartbeat("fastDeleteSweep", duration);
            return;
        }
        const numericIds = ids.filter((id) => /^\d+$/.test(id));
        if (numericIds.length === 0)
            return;
        console.log(`[fastDeleteSweep] scanning ${numericIds.length} tweet ids…`);
        let alive;
        try {
            alive = await twitter.getTweetsByIds(numericIds);
        }
        catch (e) {
            const status = e?.response?.status;
            const msg = e?.response?.data || e?.message || e;
            console.warn(`[fastDeleteSweep] lookup failed${status ? ` [${status}]` : ""}:`, msg);
            return;
        }
        const deleted = numericIds.filter((id) => !alive.has(id));
        if (deleted.length === 0) {
            console.log(`[fastDeleteSweep] 0 deletions`);
            return;
        }
        for (const tid of deleted) {
            await entryRepository_1.entryRepository.deleteEntriesByTweetId(tid);
            console.log(`🗑️ [fastDeleteSweep] purged tweet ${tid}`);
        }
        console.log(`[fastDeleteSweep] purged ${deleted.length} deleted tweets`);
        const duration = Date.now() - startTime;
        await schedulerRepository_1.schedulerRepository.updateHeartbeat("fastDeleteSweep", duration);
    }
    catch (error) {
        await schedulerRepository_1.schedulerRepository.recordError("fastDeleteSweep");
        console.error("[fastDeleteSweep] failed:", error?.message || error);
        throw error;
    }
}
//# sourceMappingURL=fastDeleteSweep.js.map