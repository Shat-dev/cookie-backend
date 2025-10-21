/* eslint-disable no-console */
import { pollMentions } from "./twitterPoller";
import { validateEntries } from "./validateEntries";
import { fastDeleteSweep } from "./fastDeleteSweep";
import { lotteryQueries } from "../db/lotteryQueries";

interface ExecutionResult {
  function: string;
  success: boolean;
  duration: number;
  error?: string;
}

interface XApiExecutionResult {
  success: boolean;
  totalDuration: number;
  functionsExecuted: number;
  successCount: number;
  failureCount: number;
  results: ExecutionResult[];
  message: string;
  error?: string;
}

async function executeWithTiming<T>(
  name: string,
  fn: () => Promise<T>
): Promise<ExecutionResult> {
  const startTime = Date.now();
  console.log(`\n🚀 [ADMIN X_API] [${name}] Starting execution...`);

  try {
    await fn();
    const duration = Date.now() - startTime;
    console.log(
      `✅ [ADMIN X_API] [${name}] Completed successfully in ${duration}ms`
    );
    return {
      function: name,
      success: true,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMsg = error?.message || String(error);
    console.error(
      `❌ [ADMIN X_API] [${name}] Failed after ${duration}ms:`,
      errorMsg
    );
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
  console.log(`🎯 [ADMIN X_API] [INIT] Checking for active lottery round...`);

  const activeRound = await lotteryQueries.getActiveRound();

  if (activeRound) {
    console.log(
      `✅ [ADMIN X_API] [INIT] Active round found: Round #${activeRound.round_number} (ID: ${activeRound.id})`
    );
    return;
  }

  console.log(
    `🚀 [ADMIN X_API] [INIT] No active round found — creating initial round...`
  );

  const nextRoundNumber = await lotteryQueries.getNextRoundNumber();
  const newRound = await lotteryQueries.createRound(nextRoundNumber);

  const syncedCount = await lotteryQueries.syncEntriesFromCurrentPool(
    newRound.id
  );

  console.log(
    `✅ [ADMIN X_API] [INIT] Created Round #${newRound.round_number} with ${syncedCount} synced entries`
  );
}

/**
 * Execute all X API calls with full authentication and audit logging
 * This function contains the core X API logic extracted from runXApiCallsOnce.ts
 */
export async function executeXApiCalls(
  adminIp?: string,
  userAgent?: string
): Promise<XApiExecutionResult> {
  const startTime = Date.now();

  try {
    console.log(
      "📡 [ADMIN X_API] Starting authenticated X API execution process..."
    );

    const results: ExecutionResult[] = [];

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

    // Calculate summary
    const totalDuration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    console.log(`\n📊 [ADMIN X_API] EXECUTION SUMMARY`);
    console.log(`====================`);
    console.log(`Total duration: ${totalDuration}ms`);
    console.log(`Functions executed: ${results.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);

    // Detailed results
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

    console.log(
      `✅ [ADMIN X_API] X API execution completed ${
        success ? "successfully" : "with errors"
      } in ${totalDuration}ms`
    );

    return {
      success,
      totalDuration,
      functionsExecuted: results.length,
      successCount,
      failureCount,
      results,
      message,
    };
  } catch (error: any) {
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
