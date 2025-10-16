"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServices = startServices;
require("dotenv/config");
const crypto_1 = __importDefault(require("crypto"));
const twitterPoller_1 = require("./twitterPoller");
const validateEntries_1 = require("./validateEntries");
const fastDeleteSweep_1 = require("./fastDeleteSweep");
const rateLimiter_1 = require("./rateLimiter");
const lotteryQueries_1 = require("../db/lotteryQueries");
const jitter = (ms, j) => ms + crypto_1.default.randomInt(0, j);
const MIN2 = 120000;
const LOOKUP_TARGET = Number(process.env.LOOKUP_CALLS_PER_WINDOW || 12);
const MENTIONS_TARGET = Number(process.env.MENTIONS_CALLS_PER_WINDOW || 6);
const VALIDATE_DEFAULT = Math.max((0, rateLimiter_1.spacingMs)("lookup", Math.min(LOOKUP_TARGET, 8)), MIN2);
const DELETE_DEFAULT = Math.max((0, rateLimiter_1.spacingMs)("lookup", Math.min(LOOKUP_TARGET, 4)), 300000);
const MENTIONS_DEFAULT = Math.max((0, rateLimiter_1.spacingMs)("mentions", Math.min(MENTIONS_TARGET, 6)), MIN2);
const TWITTER_POLL_INTERVAL = Number(process.env.TWITTER_POLL_INTERVAL) || MENTIONS_DEFAULT;
const VALIDATE_ENTRIES_INTERVAL = Number(process.env.VALIDATE_ENTRIES_INTERVAL) || VALIDATE_DEFAULT;
const FAST_DELETE_SWEEP_INTERVAL = Number(process.env.FAST_DELETE_SWEEP_INTERVAL) || DELETE_DEFAULT;
async function initializeLotteryRound() {
    try {
        console.log(`🎯 [INIT] Checking for active lottery round...`);
        const activeRound = await lotteryQueries_1.lotteryQueries.getActiveRound();
        if (activeRound) {
            console.log(`✅ [INIT] Active round found: Round #${activeRound.round_number} (ID: ${activeRound.id})`);
            return;
        }
        console.log(`🚀 [INIT] No active round found — creating initial round...`);
        const nextRoundNumber = await lotteryQueries_1.lotteryQueries.getNextRoundNumber();
        const newRound = await lotteryQueries_1.lotteryQueries.createRound(nextRoundNumber);
        const syncedCount = await lotteryQueries_1.lotteryQueries.syncEntriesFromCurrentPool(newRound.id);
        console.log(`✅ [INIT] Created Round #${newRound.round_number} with ${syncedCount} synced entries`);
        console.log(`📊 [INIT] Lottery system ready for VRF draws`);
    }
    catch (error) {
        console.error(`❌ [INIT] Failed to initialize lottery round:`, error.message);
        console.error(`⚠️ [INIT] Manual round creation may be required via API`);
    }
}
async function startServices() {
    console.log(`\n🔄 Initializing background services...`);
    await initializeLotteryRound();
    let twitterPollerRunning = false;
    const twitterPollerTick = async () => {
        if (twitterPollerRunning)
            return;
        twitterPollerRunning = true;
        try {
            await (0, twitterPoller_1.pollMentions)();
        }
        catch (e) {
            console.error(`❌ [twitterPoller] tick failed:`, e);
        }
        finally {
            twitterPollerRunning = false;
        }
    };
    setInterval(twitterPollerTick, jitter(TWITTER_POLL_INTERVAL, 15000));
    void twitterPollerTick();
    console.log(`  ✅ twitterPoller scheduled (interval: ${TWITTER_POLL_INTERVAL}ms)`);
    let validateEntriesRunning = false;
    const validateEntriesTick = async () => {
        if (validateEntriesRunning)
            return;
        validateEntriesRunning = true;
        try {
            await (0, validateEntries_1.validateEntries)(false);
        }
        catch (e) {
            console.error(`❌ [validateEntries] tick failed:`, e);
        }
        finally {
            validateEntriesRunning = false;
        }
    };
    setInterval(validateEntriesTick, jitter(VALIDATE_ENTRIES_INTERVAL, 15000));
    setTimeout(() => void validateEntriesTick(), 10000);
    console.log(`  ✅ validateEntries scheduled (interval: ${VALIDATE_ENTRIES_INTERVAL}ms)`);
    let fastDeleteSweepRunning = false;
    const fastDeleteSweepTick = async () => {
        if (fastDeleteSweepRunning)
            return;
        fastDeleteSweepRunning = true;
        try {
            await (0, fastDeleteSweep_1.fastDeleteSweep)();
        }
        catch (e) {
            console.error(`❌ [fastDeleteSweep] tick failed:`, e);
        }
        finally {
            fastDeleteSweepRunning = false;
        }
    };
    if (FAST_DELETE_SWEEP_INTERVAL > 0) {
        setInterval(fastDeleteSweepTick, jitter(FAST_DELETE_SWEEP_INTERVAL, 15000));
        setTimeout(() => void fastDeleteSweepTick(), 20000);
        console.log(`  ✅ fastDeleteSweep scheduled (interval: ${FAST_DELETE_SWEEP_INTERVAL}ms)`);
    }
    else {
        console.log(`  ⏭ fastDeleteSweep disabled (FAST_DELETE_SWEEP_INTERVAL=0)`);
    }
    console.log(`\n📋 Background tasks summary:`);
    console.log(`  - lotteryRoundInit: startup only (idempotent)`);
    console.log(`  - twitterPoller: ~${Math.round(TWITTER_POLL_INTERVAL / 1000)}s`);
    console.log(`  - validateEntries: ~${Math.round(VALIDATE_ENTRIES_INTERVAL / 1000)}s`);
    console.log(`  - fastDeleteSweep: ~${Math.round(FAST_DELETE_SWEEP_INTERVAL / 1000)}s`);
    console.log(`\n🎉 All background services initialized successfully!`);
}
//# sourceMappingURL=startServices.js.map