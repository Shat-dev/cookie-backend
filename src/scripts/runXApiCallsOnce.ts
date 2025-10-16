/* eslint-disable no-console */
import "dotenv/config";
import { pollMentions } from "../services/twitterPoller";
import { validateEntries } from "../services/validateEntries";
import { fastDeleteSweep } from "../services/fastDeleteSweep";
import { lotteryQueries } from "../db/lotteryQueries";

/**
 * One-time execution script for all X (Twitter) API calls.
 * This script runs all the X API functions that are normally scheduled
 * in startServices.ts exactly once, useful for testing or manual execution.
 */
//node dist/scripts/runXApiCallsOnce.js

interface ExecutionResult {
  function: string;
  success: boolean;
  duration: number;
  error?: string;
}

async function executeWithTiming<T>(
  name: string,
  fn: () => Promise<T>
): Promise<ExecutionResult> {
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
  } catch (error: any) {
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

/**
 * Initialize lottery round if needed (same as startServices)
 */
async function initializeLotteryRound(): Promise<void> {
  console.log(`🎯 [INIT] Checking for active lottery round...`);

  const activeRound = await lotteryQueries.getActiveRound();

  if (activeRound) {
    console.log(
      `✅ [INIT] Active round found: Round #${activeRound.round_number} (ID: ${activeRound.id})`
    );
    return;
  }

  console.log(`🚀 [INIT] No active round found — creating initial round...`);

  const nextRoundNumber = await lotteryQueries.getNextRoundNumber();
  const newRound = await lotteryQueries.createRound(nextRoundNumber);

  const syncedCount = await lotteryQueries.syncEntriesFromCurrentPool(
    newRound.id
  );

  console.log(
    `✅ [INIT] Created Round #${newRound.round_number} with ${syncedCount} synced entries`
  );
}

async function main() {
  console.log(`\n🎯 X API One-Time Execution Script`);
  console.log(`=====================================`);
  console.log(`This script will run all X API functions exactly once.`);
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const results: ExecutionResult[] = [];
  const overallStartTime = Date.now();

  // 1. Initialize lottery round (prerequisite)
  const initResult = await executeWithTiming(
    "initializeLotteryRound",
    initializeLotteryRound
  );
  results.push(initResult);

  // 2. Poll for new mentions
  const pollResult = await executeWithTiming("pollMentions", () =>
    pollMentions()
  );
  results.push(pollResult);

  // 3. Validate existing entries (regular sweep, not final)
  const validateResult = await executeWithTiming("validateEntries", () =>
    validateEntries(false)
  );
  results.push(validateResult);

  // 4. Fast delete sweep for deleted tweets
  const deleteResult = await executeWithTiming("fastDeleteSweep", () =>
    fastDeleteSweep()
  );
  results.push(deleteResult);

  // Summary
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

  // Detailed results
  console.log(`📋 DETAILED RESULTS:`);
  results.forEach((result) => {
    const status = result.success ? "✅" : "❌";
    const duration = `${result.duration}ms`;
    const error = result.error ? ` (${result.error})` : "";
    console.log(`  ${status} ${result.function}: ${duration}${error}`);
  });

  // Exit with appropriate code
  if (failureCount > 0) {
    console.log(`\n⚠️  ${failureCount} function(s) failed. Check logs above.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 All functions completed successfully!`);
    process.exit(0);
  }
}

// Handle unhandled errors
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
}

export { main as runXApiCallsOnce };
