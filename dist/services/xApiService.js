"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeXApiCalls = executeXApiCalls;
const twitterPoller_1 = require("./twitterPoller");
const validateEntries_1 = require("./validateEntries");
const fastDeleteSweep_1 = require("./fastDeleteSweep");
const lotteryQueries_1 = require("../db/lotteryQueries");
async function executeWithTiming(name, fn) {
    const startTime = Date.now();
    console.log(`\n🚀 [ADMIN X_API] [${name}] Starting execution...`);
    try {
        await fn();
        const duration = Date.now() - startTime;
        console.log(`✅ [ADMIN X_API] [${name}] Completed successfully in ${duration}ms`);
        return {
            function: name,
            success: true,
            duration,
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const errorMsg = error?.message || String(error);
        console.error(`❌ [ADMIN X_API] [${name}] Failed after ${duration}ms:`, errorMsg);
        return {
            function: name,
            success: false,
            duration,
            error: errorMsg,
        };
    }
}
async function initializeLotteryRound() {
    console.log(`🎯 [ADMIN X_API] [INIT] Checking for active lottery round...`);
    const activeRound = await lotteryQueries_1.lotteryQueries.getActiveRound();
    if (activeRound) {
        console.log(`✅ [ADMIN X_API] [INIT] Active round found: Round #${activeRound.round_number} (ID: ${activeRound.id})`);
        return;
    }
    console.log(`🚀 [ADMIN X_API] [INIT] No active round found — creating initial round...`);
    const nextRoundNumber = await lotteryQueries_1.lotteryQueries.getNextRoundNumber();
    const newRound = await lotteryQueries_1.lotteryQueries.createRound(nextRoundNumber);
    const syncedCount = await lotteryQueries_1.lotteryQueries.syncEntriesFromCurrentPool(newRound.id);
    console.log(`✅ [ADMIN X_API] [INIT] Created Round #${newRound.round_number} with ${syncedCount} synced entries`);
}
async function executeXApiCalls(adminIp, userAgent) {
    const startTime = Date.now();
    try {
        console.log("📡 [ADMIN X_API] Starting authenticated X API execution process...");
        const results = [];
        const initResult = await executeWithTiming("initializeLotteryRound", initializeLotteryRound);
        results.push(initResult);
        const pollResult = await executeWithTiming("pollMentions", () => (0, twitterPoller_1.pollMentions)());
        results.push(pollResult);
        const validateResult = await executeWithTiming("validateEntries", () => (0, validateEntries_1.validateEntries)(false));
        results.push(validateResult);
        const deleteResult = await executeWithTiming("fastDeleteSweep", () => (0, fastDeleteSweep_1.fastDeleteSweep)());
        results.push(deleteResult);
        const totalDuration = Date.now() - startTime;
        const successCount = results.filter((r) => r.success).length;
        const failureCount = results.filter((r) => !r.success).length;
        console.log(`\n📊 [ADMIN X_API] EXECUTION SUMMARY`);
        console.log(`====================`);
        console.log(`Total duration: ${totalDuration}ms`);
        console.log(`Functions executed: ${results.length}`);
        console.log(`Successful: ${successCount}`);
        console.log(`Failed: ${failureCount}`);
        console.log(`📋 [ADMIN X_API] DETAILED RESULTS:`);
        results.forEach((result) => {
            const status = result.success ? "✅" : "❌";
            const duration = `${result.duration}ms`;
            const error = result.error ? ` (${result.error})` : "";
            console.log(`  ${status} ${result.function}: ${duration}${error}`);
        });
        const success = failureCount === 0;
        const message = success
            ? `All X API functions completed successfully in ${totalDuration}ms`
            : `${failureCount} function(s) failed out of ${results.length}`;
        console.log(`✅ [ADMIN X_API] X API execution completed ${success ? "successfully" : "with errors"} in ${totalDuration}ms`);
        return {
            success,
            totalDuration,
            functionsExecuted: results.length,
            successCount,
            failureCount,
            results,
            message,
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        console.error("❌ [ADMIN X_API] X API execution failed:", error.message);
        return {
            success: false,
            totalDuration: duration,
            functionsExecuted: 0,
            successCount: 0,
            failureCount: 1,
            results: [],
            message: "X API execution failed",
            error: error.message,
        };
    }
}
//# sourceMappingURL=xApiService.js.map