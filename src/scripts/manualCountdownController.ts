import { Request, Response } from "express";
import {
  getCountdownState,
  setCountdownState,
  resetCountdownState,
  CountdownState,
} from "../repositories/countdownRepository";

// Active timeout for phase transitions
let currentTimeout: NodeJS.Timeout | null = null;

/**
 * Restore countdown state on server startup
 * This function checks the database for existing countdown state and resumes if needed
 */
export async function restoreCountdownState(): Promise<void> {
  try {
    console.log("🔄 Restoring countdown state from database...");

    const savedState = await getCountdownState();
    console.log(
      `📊 Found saved state: ${savedState.phase} (active: ${savedState.is_active})`
    );

    // If not active, nothing to restore
    if (!savedState.is_active) {
      console.log("✅ No active countdown to restore");
      return;
    }

    // Handle different phases
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
        await resetCountdownState();
    }
  } catch (error) {
    console.error("❌ Error restoring countdown state:", error);
    console.log("🔄 Resetting to default state due to restoration error");
    await resetCountdownState();
  }
}

/**
 * Restore countdown phase specifically - handles timing logic
 */
async function restoreCountdownPhase(
  savedState: CountdownState
): Promise<void> {
  if (!savedState.ends_at) {
    console.log("⚠️ Countdown phase missing end time, restarting countdown");
    await runCountdownPhase();
    return;
  }

  const now = new Date();
  const endTime = new Date(savedState.ends_at);
  const remainingMs = endTime.getTime() - now.getTime();

  if (remainingMs <= 0) {
    console.log(
      "⏰ Countdown time has expired, transitioning to selecting phase"
    );
    await runSelectingPhase();
  } else {
    const remainingSeconds = Math.floor(remainingMs / 1000);
    console.log(
      `⏰ Resuming countdown with ${remainingSeconds} seconds remaining`
    );

    // Clear any existing timeout before setting new one
    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    // Schedule the transition for the remaining time
    currentTimeout = setTimeout(() => {
      runSelectingPhase();
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
    const countdownState = await getCountdownState();
    let remainingSeconds = 0;

    if (countdownState.phase === "countdown" && countdownState.ends_at) {
      const now = new Date();
      const timeLeft = countdownState.ends_at.getTime() - now.getTime();
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
    res.status(500).json({
      success: false,
      error: "Failed to get countdown status",
    });
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
    // Check if a countdown is already active
    const currentState = await getCountdownState();
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

    // Get the updated state after starting
    const updatedState = await getCountdownState();
    res.json({
      success: true,
      message: "Countdown round started",
      phase: updatedState.phase,
      endsAt: updatedState.ends_at,
    });
  } catch (error) {
    console.error("Error starting countdown round:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start countdown round",
    });
  }
};

/**
 * Internal function to manage the continuous countdown lifecycle
 */
async function startCountdownLifecycle(): Promise<void> {
  // Clear any existing timeout
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Start the continuous loop with countdown phase
  await runCountdownPhase();
}

/**
 * Phase 1: Countdown (1 hour)
 */
async function runCountdownPhase(): Promise<void> {
  const now = new Date();
  const countdownEnd = new Date(now.getTime() + 60 * 1000 * 5); // 1 hour from now (currently 5 minute for testing)

  await setCountdownState({
    phase: "countdown",
    ends_at: countdownEnd,
    is_active: true,
  });

  console.log("🚀 Phase 1: countdown (1 hour)");

  // Clear any existing timeout before setting new one
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Schedule transition to "selecting" phase after 1 hour
  currentTimeout = setTimeout(() => {
    runSelectingPhase();
  }, 60 * 1000 * 5); // 1 hour (currently 5 minute for testing)
}

/**
 * Phase 2: Selecting (1 minute)
 */
async function runSelectingPhase(): Promise<void> {
  await setCountdownState({
    phase: "selecting",
    ends_at: null,
    is_active: true,
  });

  console.log("🎯 Phase 2: selecting (1 minute)");

  // Clear any existing timeout before setting new one
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Schedule transition to "winner" phase after 1 minute
  currentTimeout = setTimeout(() => {
    runWinnerPhase();
  }, 60 * 1000); // 1 minute
}

/**
 * Phase 3: Winner (1 minute) - Triggers VRF draw via authenticated API
 */
async function runWinnerPhase(): Promise<void> {
  await setCountdownState({
    phase: "winner",
    ends_at: null,
    is_active: true,
  });

  console.log("🏆 Phase 3: winner (1 minute)");
  console.log("🏁 Winner phase reached — triggering authenticated VRF draw");

  // Execute VRF draw via authenticated HTTP endpoint
  executeVrfDrawViaApi()
    .then((result) => {
      if (result.success) {
        console.log(`✅ [COUNTDOWN VRF] VRF draw completed: ${result.txHash}`);
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
      console.error(
        "❌ [COUNTDOWN VRF] Failed to execute VRF draw:",
        err.message
      );
    });

  // Clear any existing timeout before setting new one
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Schedule transition to "new_round" phase after 1 minute
  currentTimeout = setTimeout(() => {
    runNewRoundPhase();
  }, 60 * 1000); // 1 minute
}

/**
 * Execute VRF draw via authenticated HTTP endpoint
 * This replaces direct subprocess execution with secure API calls
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

    if (!ADMIN_API_KEY) {
      throw new Error(
        "ADMIN_API_KEY not configured for countdown VRF execution"
      );
    }

    if (!BACKEND_URL) {
      throw new Error("BACKEND_URL not configured for countdown VRF execution");
    }

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
        timeout: 120000, // 2 minute timeout
      }
    );

    return response.data;
  } catch (error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      console.error(`❌ [COUNTDOWN VRF] HTTP ${status} error:`, data);

      return {
        success: false,
        error: data?.error || `HTTP ${status} error`,
      };
    } else {
      console.error("❌ [COUNTDOWN VRF] Network/request error:", error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

/**
 * Phase 4: New Round (30 seconds) - Brief pause before next cycle
 */
async function runNewRoundPhase(): Promise<void> {
  await setCountdownState({
    phase: "new_round",
    ends_at: null,
    is_active: true,
  });

  console.log("🔄 Phase 4: new_round (30 seconds)");

  // Clear any existing timeout before setting new one
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Schedule transition back to "countdown" phase after 30 seconds to continue the loop
  currentTimeout = setTimeout(() => {
    runCountdownPhase(); // Loop back to countdown phase
  }, 30 * 1000); // 30 seconds
}

/**
 * Get current state (for debugging)
 */
export const getCurrentState = async () => {
  return await getCountdownState();
};

/**
 * Reset the countdown (for emergency use) - Stops the continuous loop
 */
export const resetCountdown = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Clear any active timeout to stop the continuous loop
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }

    // Reset the database state
    await resetCountdownState();

    console.log("🔄 Countdown manually reset to starting state - Loop stopped");

    res.json({
      success: true,
      message: "Countdown reset to starting state and loop stopped",
      phase: "starting",
    });
  } catch (error) {
    console.error("Error resetting countdown:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset countdown",
    });
  }
};

/**
 * Graceful shutdown cleanup function
 *
 * This function is called when the process receives SIGTERM (Railway deployment)
 * or SIGINT (Ctrl+C) signals. It ensures:
 *
 * 1. Active countdown timeouts are cleared to prevent orphaned timers
 * 2. Database countdown state is marked as inactive to prevent restoration issues
 * 3. Process exits cleanly without leaving inconsistent state
 *
 * This prevents issues like:
 * - Duplicate VRF draws after restart
 * - Stuck countdown phases
 * - Overlapping timer conflicts
 */
async function cleanup(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal} signal. Starting countdown cleanup...`);

  try {
    // Clear any active timeout
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
      console.log("✅ Cleared active countdown timeout");
    }

    // Mark countdown as inactive in database to prevent restoration issues
    try {
      await setCountdownState({ is_active: false });
      console.log("✅ Marked countdown as inactive in database");
    } catch (dbError) {
      console.error("⚠️ Failed to update database during cleanup:", dbError);
      // Continue with shutdown even if DB update fails
    }

    console.log("✅ Countdown cleanup completed successfully");
  } catch (error) {
    console.error("❌ Error during countdown cleanup:", error);
  }

  // Exit gracefully
  process.exit(0);
}

/**
 * Synchronous cleanup wrapper for signal handlers
 * Uses setTimeout to handle async cleanup with a timeout
 */
function handleShutdownSignal(signal: string): void {
  // Prevent multiple cleanup attempts
  if (process.env.COUNTDOWN_CLEANUP_STARTED) {
    console.log(`⚠️ Cleanup already in progress, ignoring ${signal}`);
    return;
  }
  process.env.COUNTDOWN_CLEANUP_STARTED = "true";

  // Set a timeout to force exit if cleanup takes too long
  const forceExitTimeout = setTimeout(() => {
    console.log("⚠️ Cleanup timeout reached, forcing exit");
    process.exit(1);
  }, 5000); // 5 second timeout

  // Run async cleanup
  cleanup(signal)
    .then(() => {
      clearTimeout(forceExitTimeout);
    })
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
