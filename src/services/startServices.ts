/* eslint-disable no-console */
import "dotenv/config";
import crypto from "crypto";
import { pollMentions } from "./twitterPoller";
import { validateEntries } from "./validateEntries";
import { fastDeleteSweep } from "./fastDeleteSweep";
import { spacingMs } from "./rateLimiter";
import { lotteryQueries } from "../db/lotteryQueries";
import { restoreCountdownState } from "../scripts/manualCountdownController";

// ---- Safe intervals using limiter math ----
const jitter = (ms: number, j: number) => ms + crypto.randomInt(0, j);
const MIN2 = 120_000;

const LOOKUP_TARGET = Number(process.env.LOOKUP_CALLS_PER_WINDOW || 12); // ≤ (cap-reserve)=12
const MENTIONS_TARGET = Number(process.env.MENTIONS_CALLS_PER_WINDOW || 6); // ≤ (cap-reserve)=9

const VALIDATE_DEFAULT = Math.max(
  spacingMs("lookup", Math.min(LOOKUP_TARGET, 8)),
  MIN2
); // ~≤8/15m
const DELETE_DEFAULT = Math.max(
  spacingMs("lookup", Math.min(LOOKUP_TARGET, 4)),
  300_000
); // ~≤4/15m
const MENTIONS_DEFAULT = Math.max(
  spacingMs("mentions", Math.min(MENTIONS_TARGET, 6)),
  MIN2
);

const TWITTER_POLL_INTERVAL =
  Number(process.env.TWITTER_POLL_INTERVAL) || MENTIONS_DEFAULT; // default ~2m+
const VALIDATE_ENTRIES_INTERVAL =
  Number(process.env.VALIDATE_ENTRIES_INTERVAL) || VALIDATE_DEFAULT; // default ~2m+
const FAST_DELETE_SWEEP_INTERVAL =
  Number(process.env.FAST_DELETE_SWEEP_INTERVAL) || DELETE_DEFAULT; // default ~5m+

/**
 * Initialize the first lottery round if none exists.
 * This ensures the system is ready for VRF draws after deployment.
 */
async function initializeLotteryRound(): Promise<void> {
  try {
    console.log(`🎯 [INIT] Checking for active lottery round...`);

    // Check if an active round already exists
    const activeRound = await lotteryQueries.getActiveRound();

    if (activeRound) {
      console.log(
        `✅ [INIT] Active round found: Round #${activeRound.round_number} (ID: ${activeRound.id})`
      );
      return;
    }

    // No active round exists, create the first one
    console.log(`🚀 [INIT] No active round found — creating initial round...`);

    const nextRoundNumber = await lotteryQueries.getNextRoundNumber();
    const newRound = await lotteryQueries.createRound(nextRoundNumber);

    // Sync any existing entries from the entries table
    const syncedCount = await lotteryQueries.syncEntriesFromCurrentPool(
      newRound.id
    );

    console.log(
      `✅ [INIT] Created Round #${newRound.round_number} with ${syncedCount} synced entries`
    );
    console.log(`📊 [INIT] Lottery system ready for VRF draws`);
  } catch (error: any) {
    console.error(
      `❌ [INIT] Failed to initialize lottery round:`,
      error.message
    );
    // Don't crash the server, but log the error
    console.error(`⚠️ [INIT] Manual round creation may be required via API`);
  }
}

/**
 * Centralized service initialization for all background tasks.
 * Called once from server.ts after the HTTP server starts listening.
 */
export async function startServices() {
  console.log(`\n🔄 Initializing background services...`);

  // Initialize lottery round first (idempotent - runs only if needed)
  await initializeLotteryRound();

  // Restore countdown state after database is ready
  try {
    await restoreCountdownState();
    console.log("✅ Countdown state restoration completed");
  } catch (error: any) {
    console.error("❌ Failed to restore countdown state:", error.message);
    console.log("⚠️ Countdown system will start in default 'starting' state");
  }

  // twitterPoller
  let twitterPollerRunning = false;
  const twitterPollerTick = async () => {
    if (twitterPollerRunning) return;
    twitterPollerRunning = true;
    try {
      await pollMentions();
    } catch (e) {
      console.error(`❌ [twitterPoller] tick failed:`, e);
    } finally {
      twitterPollerRunning = false;
    }
  };
  setInterval(twitterPollerTick, jitter(TWITTER_POLL_INTERVAL, 15_000));
  void twitterPollerTick();
  console.log(
    `  ✅ twitterPoller scheduled (interval: ${TWITTER_POLL_INTERVAL}ms)`
  );

  // validateEntries
  let validateEntriesRunning = false;
  const validateEntriesTick = async () => {
    if (validateEntriesRunning) return;
    validateEntriesRunning = true;
    try {
      await validateEntries(false);
    } catch (e) {
      // ensure this does ≤1 lookup call (batch ids ≤100)
      console.error(`❌ [validateEntries] tick failed:`, e);
    } finally {
      validateEntriesRunning = false;
    }
  };
  setInterval(validateEntriesTick, jitter(VALIDATE_ENTRIES_INTERVAL, 15_000));
  setTimeout(() => void validateEntriesTick(), 10_000);
  console.log(
    `  ✅ validateEntries scheduled (interval: ${VALIDATE_ENTRIES_INTERVAL}ms)`
  );

  // fastDeleteSweep
  let fastDeleteSweepRunning = false;
  const fastDeleteSweepTick = async () => {
    if (fastDeleteSweepRunning) return;
    fastDeleteSweepRunning = true;
    try {
      await fastDeleteSweep();
    } catch (e) {
      // ensure this does ≤1 lookup call (batch ids ≤100)
      console.error(`❌ [fastDeleteSweep] tick failed:`, e);
    } finally {
      fastDeleteSweepRunning = false;
    }
  };
  if (FAST_DELETE_SWEEP_INTERVAL > 0) {
    setInterval(
      fastDeleteSweepTick,
      jitter(FAST_DELETE_SWEEP_INTERVAL, 15_000)
    );
    setTimeout(() => void fastDeleteSweepTick(), 20_000);
    console.log(
      `  ✅ fastDeleteSweep scheduled (interval: ${FAST_DELETE_SWEEP_INTERVAL}ms)`
    );
  } else {
    console.log(`  ⏭ fastDeleteSweep disabled (FAST_DELETE_SWEEP_INTERVAL=0)`);
  }

  console.log(`\n📋 Background tasks summary:`);
  console.log(`  - lotteryRoundInit: startup only (idempotent)`);
  console.log(
    `  - twitterPoller: ~${Math.round(TWITTER_POLL_INTERVAL / 1000)}s`
  );
  console.log(
    `  - validateEntries: ~${Math.round(VALIDATE_ENTRIES_INTERVAL / 1000)}s`
  );
  console.log(
    `  - fastDeleteSweep: ~${Math.round(FAST_DELETE_SWEEP_INTERVAL / 1000)}s`
  );

  console.log(`\n🎉 All background services initialized successfully!`);
}
