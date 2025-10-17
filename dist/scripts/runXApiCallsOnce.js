"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runXApiCallsOnce = main;
require("dotenv/config");
const twitterPoller_1 = require("../services/twitterPoller");
const validateEntries_1 = require("../services/validateEntries");
const fastDeleteSweep_1 = require("../services/fastDeleteSweep");
const lotteryQueries_1 = require("../db/lotteryQueries");
async function executeWithTiming(name, fn) {
    const startTime = Date.now();
    console.log(`\n🚀 [${name}] Starting execution...`);
    try {
        await fn();
        const duration = Date.now() - startTime;
        console.log(`✅ [${name}] Completed successfully in ${duration}ms`);
        return {
            function: name,
            success: true,
            duration,
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error?.message || String(error);
        console.error(`❌ [${name}] Failed after ${duration}ms:`, errorMsg);
        return {
            function: name,
            success: false,
            duration,
            error: errorMsg,
        };
    }
}
async function initializeLotteryRound() {
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
}
async function main() {
    console.log(`\n🎯 X API One-Time Execution Script`);
    console.log(`=====================================`);
    console.log(`This script will run all X API functions exactly once.`);
    console.log(`Started at: ${new Date().toISOString()}\n`);
    const results = [];
    const overallStartTime = Date.now();
    const initResult = await executeWithTiming("initializeLotteryRound", initializeLotteryRound);
    results.push(initResult);
    const pollResult = await executeWithTiming("pollMentions", () => (0, twitterPoller_1.pollMentions)());
    results.push(pollResult);
    const validateResult = await executeWithTiming("validateEntries", () => (0, validateEntries_1.validateEntries)(false));
    results.push(validateResult);
    const deleteResult = await executeWithTiming("fastDeleteSweep", () => (0, fastDeleteSweep_1.fastDeleteSweep)());
    results.push(deleteResult);
    const overallDuration = Date.now() - overallStartTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    console.log(`\n📊 EXECUTION SUMMARY`);
    console.log(`====================`);
    console.log(`Total duration: ${overallDuration}ms`);
    console.log(`Functions executed: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Completed at: ${new Date().toISOString()}\n`);
    console.log(`📋 DETAILED RESULTS:`);
    results.forEach((result) => {
        const status = result.success ? "✅" : "❌";
        const duration = `${result.duration}ms`;
        const error = result.error ? ` (${result.error})` : "";
        console.log(`  ${status} ${result.function}: ${duration}${error}`);
    });
    if (failureCount > 0) {
        console.log(`\n⚠️  ${failureCount} function(s) failed. Check logs above.`);
        process.exit(1);
    }
    else {
        console.log(`\n🎉 All functions completed successfully!`);
        process.exit(0);
    }
}
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    process.exit(1);
});
process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    process.exit(1);
});
if (require.main === module) {
    main().catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=runXApiCallsOnce.js.map