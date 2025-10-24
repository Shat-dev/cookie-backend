import { Request, Response } from "express";
import {
  getCountdownState,
  setCountdownState,
  resetCountdownState,
  CountdownState,
} from "../repositories/countdownRepository";

// ===== Internal guards =====
let currentTimeout: NodeJS.Timeout | null = null;
let transitioning = false; // prevents overlapping transitions

// Utility: sleep
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Indefinite retry with exponential backoff (capped).
 * Keeps signatures unchanged. Logs each failure.
 */
async function withDbRetry<T>(
  opName: string,
  fn: () => Promise<T>
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const base = 500; // ms
      const backoff = Math.min(30000, base * 2 ** Math.min(attempt, 10)); // cap 30s
      console.error(
        `⚠️ [DB RETRY] ${opName} failed (attempt ${attempt}):`,
        err?.message || err
      );
      await delay(backoff);
      // continue
    }
  }
}

/**
 * Wrap setTimeout to safely await async functions and catch errors.
 */
function scheduleTransition(
  fn: () => Promise<void>,
  ms: number
): NodeJS.Timeout {
  return setTimeout(async () => {
    try {
      await fn();
    } catch (err: any) {
      console.error("❌ [COUNTDOWN] Transition crashed:", err?.message || err);
    }
  }, Math.max(0, ms));
}

/**
 * Restore countdown state on server startup
 */
export async function restoreCountdownState(): Promise<void> {
  try {
    console.log("🔄 Restoring countdown state from database...");

    const savedState = await withDbRetry(
      "getCountdownState(restore)",
      getCountdownState
    );
    console.log(
      `📊 Found saved state: ${savedState.phase} (active: ${savedState.is_active})`
    );

    if (!savedState.is_active) {
      console.log("✅ No active countdown to restore");
      return;
    }

    switch (savedState.phase) {
      case "countdown":
        await restoreCountdownPhase(savedState);
        break;
      case "selecting":
        console.log("🎯 Resuming selecting phase...");
        await runSelectingPhase();
        break;
      case "winner":
        console.log("🏆 Resuming winner phase...");
        await runWinnerPhase();
        break;
      case "new_round":
        console.log("🔄 Resuming new_round phase...");
        await runNewRoundPhase();
        break;
      default:
        console.log(
          `⚠️ Unknown phase: ${savedState.phase}, resetting to starting`
        );
        await withDbRetry(
          "resetCountdownState(restore-default)",
          resetCountdownState
        );
    }
  } catch (error) {
    console.error("❌ Error restoring countdown state:", error);
    console.log("🔄 Resetting to default state due to restoration error");
    await withDbRetry(
      "resetCountdownState(restore-error)",
      resetCountdownState
    );
  }
}

/**
 * Restore countdown phase specifically - handles timing logic with self-heal
 */
async function restoreCountdownPhase(
  savedState: CountdownState
): Promise<void> {
  if (!savedState.ends_at) {
    console.log("⚠️ Countdown phase missing end time, restarting countdown");
    await runCountdownPhase();
    return;
  }

  const now = Date.now();
  const endTime = new Date(savedState.ends_at as any).getTime(); // robust if string or Date
  const remainingMs = endTime - now;

  if (!Number.isFinite(remainingMs)) {
    console.log("⚠️ Invalid ends_at detected. Restarting countdown.");
    await runCountdownPhase();
    return;
  }

  if (remainingMs <= 0) {
    console.log(
      "⏰ Countdown expired on restore, transitioning to selecting phase"
    );
    await runSelectingPhase();
  } else {
    const remainingSeconds = Math.floor(remainingMs / 1000);
    console.log(
      `⏰ Resuming countdown with ${remainingSeconds} seconds remaining`
    );

    if (currentTimeout) clearTimeout(currentTimeout);
    currentTimeout = scheduleTransition(async () => {
      await runSelectingPhase();
    }, remainingMs);
  }
}

/**
 * Get the current countdown state and remaining seconds
 */
export const getCountdownStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const countdownState = await withDbRetry(
      "getCountdownState(status)",
      getCountdownState
    );
    let remainingSeconds = 0;

    if (countdownState.phase === "countdown" && countdownState.ends_at) {
      const now = Date.now();
      const end = new Date(countdownState.ends_at as any).getTime();
      const timeLeft = end - now;
      remainingSeconds = Math.max(0, Math.floor(timeLeft / 1000));
    }

    res.json({
      success: true,
      phase: countdownState.phase,
      remainingSeconds,
      endsAt: countdownState.ends_at,
      isActive: countdownState.is_active,
    });
  } catch (error) {
    console.error("Error getting countdown status:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get countdown status" });
  }
};

/**
 * Start a new countdown round (protected endpoint)
 */
export const startCountdownRound = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const currentState = await withDbRetry(
      "getCountdownState(start)",
      getCountdownState
    );
    if (currentState.is_active) {
      res.status(400).json({
        success: false,
        error: "A countdown round is already active",
        currentPhase: currentState.phase,
      });
      return;
    }

    console.log("🔍 About to start countdown lifecycle...");
    await startCountdownLifecycle();

    const updatedState = await withDbRetry(
      "getCountdownState(post-start)",
      getCountdownState
    );
    res.json({
      success: true,
      message: "Countdown round started",
      phase: updatedState.phase,
      endsAt: updatedState.ends_at,
    });
  } catch (error) {
    console.error("Error starting countdown round:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to start countdown round" });
  }
};

/**
 * Internal function to manage the continuous countdown lifecycle
 */
async function startCountdownLifecycle(): Promise<void> {
  if (currentTimeout) clearTimeout(currentTimeout);
  await runCountdownPhase();
}

/**
 * Phase 1: Countdown (1 hour)
 */
async function runCountdownPhase(): Promise<void> {
  if (transitioning) return;
  transitioning = true;
  try {
    const now = Date.now();
    const countdownEnd = new Date(now + 60 * 60 * 1000); // 1 hour

    await withDbRetry("setCountdownState(countdown)", () =>
      setCountdownState({
        phase: "countdown",
        ends_at: countdownEnd,
        is_active: true,
      })
    );

    console.log("🚀 Phase 1: countdown (1 hour)");

    if (currentTimeout) clearTimeout(currentTimeout);
    currentTimeout = scheduleTransition(async () => {
      await runSelectingPhase();
    }, 60 * 60 * 1000);
  } finally {
    transitioning = false;
  }
}

/**
 * Phase 2: Selecting (1 minute) with DB retry
 */
async function runSelectingPhase(): Promise<void> {
  if (transitioning) return;
  transitioning = true;
  try {
    await withDbRetry("setCountdownState(selecting)", () =>
      setCountdownState({ phase: "selecting", ends_at: null, is_active: true })
    );

    console.log("🎯 Phase 2: selecting (1 minute)");

    // Fire-and-log. Failures are logged inside the function. Does not block transition.
    executeXApiCallsViaApi()
      .then((result) => {
        if (result.success) {
          console.log(`✅ [COUNTDOWN X_API] Completed: ${result.message}`);
          if (result.successCount && result.functionsExecuted) {
            console.log(
              `📊 [COUNTDOWN X_API] Functions: ${result.successCount}/${result.functionsExecuted} successful`
            );
          }
        } else {
          console.error(`❌ [COUNTDOWN X_API] Failed: ${result.error}`);
        }
      })
      .catch((err) => {
        console.error(
          "❌ [COUNTDOWN X_API] Request error:",
          err?.message || err
        );
      });

    if (currentTimeout) clearTimeout(currentTimeout);
    currentTimeout = scheduleTransition(async () => {
      await runWinnerPhase();
    }, 60 * 1000); // 1 minute
  } finally {
    transitioning = false;
  }
}

/**
 * Phase 3: Winner (1 minute) - Triggers VRF draw via authenticated API
 */
async function runWinnerPhase(): Promise<void> {
  if (transitioning) return;
  transitioning = true;
  try {
    await withDbRetry("setCountdownState(winner)", () =>
      setCountdownState({ phase: "winner", ends_at: null, is_active: true })
    );

    console.log("🏆 Phase 3: winner (1 minute)");
    console.log("🏁 Winner phase reached — triggering authenticated VRF draw");

    executeVrfDrawViaApi()
      .then((result) => {
        if (result.success) {
          console.log(
            `✅ [COUNTDOWN VRF] VRF draw completed: ${result.txHash}`
          );
          if (result.winnerAddress) {
            console.log(
              `🏆 [COUNTDOWN VRF] Winner: ${result.winnerAddress} (Token: ${result.winningTokenId})`
            );
          }
        } else {
          console.error(`❌ [COUNTDOWN VRF] VRF draw failed: ${result.error}`);
        }
      })
      .catch((err) => {
        console.error("❌ [COUNTDOWN VRF] Request error:", err?.message || err);
      });

    if (currentTimeout) clearTimeout(currentTimeout);
    currentTimeout = scheduleTransition(async () => {
      await runNewRoundPhase();
    }, 60 * 1000 * 2); // 2 minutes
  } finally {
    transitioning = false;
  }
}

/**
 * Execute VRF draw via authenticated HTTP endpoint
 */
async function executeVrfDrawViaApi(): Promise<{
  success: boolean;
  txHash?: string;
  winnerAddress?: string;
  winningTokenId?: string;
  error?: string;
}> {
  try {
    const axios = (await import("axios")).default;
    const env = (await import("../utils/loadEnv")).default;
    const { BACKEND_URL, ADMIN_API_KEY } = env;

    if (!ADMIN_API_KEY)
      throw new Error(
        "ADMIN_API_KEY not configured for countdown VRF execution"
      );
    if (!BACKEND_URL)
      throw new Error("BACKEND_URL not configured for countdown VRF execution");

    console.log(
      "🎲 [COUNTDOWN VRF] Executing VRF draw via authenticated API..."
    );

    const response = await axios.post(
      `${BACKEND_URL}/api/admin/manual-vrf-draw`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_API_KEY}`,
          "User-Agent": "countdown-controller/1.0",
        },
        timeout: 120000,
      }
    );

    return response.data;
  } catch (error: any) {
    if (error?.response) {
      const status = error.response.status;
      const data = error.response.data;
      console.error(`❌ [COUNTDOWN VRF] HTTP ${status} error:`, data);
      return { success: false, error: data?.error || `HTTP ${status} error` };
    }
    console.error(
      "❌ [COUNTDOWN VRF] Network/request error:",
      error?.message || error
    );
    return { success: false, error: error?.message || "request error" };
  }
}

/**
 * Execute X API calls via authenticated HTTP endpoint
 */
async function executeXApiCallsViaApi(): Promise<{
  success: boolean;
  totalDuration?: number;
  functionsExecuted?: number;
  successCount?: number;
  failureCount?: number;
  message?: string;
  error?: string;
}> {
  try {
    const axios = (await import("axios")).default;
    const env = (await import("../utils/loadEnv")).default;
    const { BACKEND_URL, ADMIN_API_KEY } = env;

    if (!ADMIN_API_KEY)
      throw new Error(
        "ADMIN_API_KEY not configured for countdown X API execution"
      );
    if (!BACKEND_URL)
      throw new Error(
        "BACKEND_URL not configured for countdown X API execution"
      );

    console.log(
      "📡 [COUNTDOWN X_API] Executing X API calls via authenticated API..."
    );

    const response = await axios.post(
      `${BACKEND_URL}/api/admin/run-x-api-calls`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_API_KEY}`,
          "User-Agent": "countdown-controller/1.0",
        },
        timeout: 120000,
      }
    );

    return response.data;
  } catch (error: any) {
    if (error?.response) {
      const status = error.response.status;
      const data = error.response.data;
      console.error(`❌ [COUNTDOWN X_API] HTTP ${status} error:`, data);
      return { success: false, error: data?.error || `HTTP ${status} error` };
    }
    console.error(
      "❌ [COUNTDOWN X_API] Network/request error:",
      error?.message || error
    );
    return { success: false, error: error?.message || "request error" };
  }
}

/**
 * Phase 4: New Round (30 seconds) - Brief pause before next cycle
 */
async function runNewRoundPhase(): Promise<void> {
  if (transitioning) return;
  transitioning = true;
  try {
    await withDbRetry("setCountdownState(new_round)", () =>
      setCountdownState({ phase: "new_round", ends_at: null, is_active: true })
    );

    console.log("🔄 Phase 4: new_round (30 seconds)");

    if (currentTimeout) clearTimeout(currentTimeout);
    currentTimeout = scheduleTransition(async () => {
      await runCountdownPhase(); // Loop back to countdown phase
    }, 30 * 1000); // 30 seconds
  } finally {
    transitioning = false;
  }
}

/**
 * Get current state (for debugging)
 */
export const getCurrentState = async () => {
  return await withDbRetry("getCountdownState(debug)", getCountdownState);
};

/**
 * Reset the countdown (for emergency use) - Stops the continuous loop
 */
export const resetCountdown = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }

    await withDbRetry("resetCountdownState(manual)", resetCountdownState);
    console.log("🔄 Countdown manually reset to starting state - Loop stopped");

    res.json({
      success: true,
      message: "Countdown reset to starting state and loop stopped",
      phase: "starting",
    });
  } catch (error) {
    console.error("Error resetting countdown:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to reset countdown" });
  }
};

/**
 * Graceful shutdown cleanup
 */
async function cleanup(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal} signal. Starting countdown cleanup...`);
  try {
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
      console.log("✅ Cleared active countdown timeout");
    }
    try {
      await withDbRetry("setCountdownState(inactive-on-shutdown)", () =>
        setCountdownState({ is_active: false })
      );
      console.log("✅ Marked countdown as inactive in database");
    } catch (dbError) {
      console.error("⚠️ Failed to update database during cleanup:", dbError);
    }
    console.log("✅ Countdown cleanup completed successfully");
  } catch (error) {
    console.error("❌ Error during countdown cleanup:", error);
  }
  process.exit(0);
}

/**
 * Synchronous cleanup wrapper for signal handlers
 */
function handleShutdownSignal(signal: string): void {
  if (process.env.COUNTDOWN_CLEANUP_STARTED) {
    console.log(`⚠️ Cleanup already in progress, ignoring ${signal}`);
    return;
  }
  process.env.COUNTDOWN_CLEANUP_STARTED = "true";

  const forceExitTimeout = setTimeout(() => {
    console.log("⚠️ Cleanup timeout reached, forcing exit");
    process.exit(1);
  }, 5000);

  cleanup(signal)
    .then(() => clearTimeout(forceExitTimeout))
    .catch((error) => {
      console.error("❌ Cleanup failed:", error);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    });
}

// Register signal handlers for graceful shutdown
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
process.on("SIGINT", () => handleShutdownSignal("SIGINT"));

// Log that signal handlers are registered (only once)
if (!process.env.COUNTDOWN_SIGNALS_REGISTERED) {
  console.log(
    "🛡️ Countdown graceful shutdown handlers registered (SIGTERM, SIGINT)"
  );
  process.env.COUNTDOWN_SIGNALS_REGISTERED = "true";
}
