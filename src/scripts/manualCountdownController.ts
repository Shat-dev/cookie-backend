import { Request, Response } from "express";

// In-memory state for the countdown system
interface CountdownState {
  phase: "starting" | "countdown" | "selecting" | "winner" | "new_round";
  endsAt: Date | null;
  isActive: boolean;
}

let countdownState: CountdownState = {
  phase: "starting",
  endsAt: null,
  isActive: false,
};

let currentTimeout: NodeJS.Timeout | null = null;

/**
 * Get the current countdown state and remaining seconds
 */
export const getCountdownStatus = (req: Request, res: Response): void => {
  try {
    let remainingSeconds = 0;

    if (countdownState.phase === "countdown" && countdownState.endsAt) {
      const now = new Date();
      const timeLeft = countdownState.endsAt.getTime() - now.getTime();
      remainingSeconds = Math.max(0, Math.floor(timeLeft / 1000));
    }

    res.json({
      success: true,
      phase: countdownState.phase,
      remainingSeconds,
      endsAt: countdownState.endsAt,
      isActive: countdownState.isActive,
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
export const startCountdownRound = (req: Request, res: Response): void => {
  try {
    // Check if a countdown is already active
    if (countdownState.isActive) {
      res.status(400).json({
        success: false,
        error: "A countdown round is already active",
        currentPhase: countdownState.phase,
      });
      return;
    }

    console.log("🔍 About to start countdown lifecycle...");
    startCountdownLifecycle();

    res.json({
      success: true,
      message: "Countdown round started",
      phase: countdownState.phase,
      endsAt: countdownState.endsAt,
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
function startCountdownLifecycle() {
  // Clear any existing timeout
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Start the continuous loop with countdown phase
  runCountdownPhase();
}

/**
 * Phase 1: Countdown (1 hour)
 */
function runCountdownPhase() {
  const now = new Date();
  const countdownEnd = new Date(now.getTime() + 60 * 1000); // 1 hour from now (currently 1 minute for testing)

  countdownState = {
    phase: "countdown",
    endsAt: countdownEnd,
    isActive: true,
  };

  console.log("🚀 Phase 1: countdown (1 hour)");

  // Schedule transition to "selecting" phase after 1 hour
  currentTimeout = setTimeout(() => {
    runSelectingPhase();
  }, 60 * 1000); // 1 hour (currently 1 minute for testing)
}

/**
 * Phase 2: Selecting (1 minute)
 */
function runSelectingPhase() {
  countdownState = {
    phase: "selecting",
    endsAt: null,
    isActive: true,
  };

  console.log("🎯 Phase 2: selecting (1 minute)");

  // Schedule transition to "winner" phase after 1 minute
  currentTimeout = setTimeout(() => {
    runWinnerPhase();
  }, 60 * 1000); // 1 minute
}

/**
 * Phase 3: Winner (1 minute) - Triggers VRF draw via authenticated API
 */
function runWinnerPhase() {
  countdownState = {
    phase: "winner",
    endsAt: null,
    isActive: true,
  };

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
function runNewRoundPhase() {
  countdownState = {
    phase: "new_round",
    endsAt: null,
    isActive: true,
  };

  console.log("🔄 Phase 4: new_round (30 seconds)");

  // Schedule transition back to "countdown" phase after 30 seconds to continue the loop
  currentTimeout = setTimeout(() => {
    runCountdownPhase(); // Loop back to countdown phase
  }, 30 * 1000); // 30 seconds
}

/**
 * Get current state (for debugging)
 */
export const getCurrentState = () => countdownState;

/**
 * Reset the countdown (for emergency use) - Stops the continuous loop
 */
export const resetCountdown = (req: Request, res: Response): void => {
  try {
    // Clear any active timeout to stop the continuous loop
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }

    countdownState = {
      phase: "starting",
      endsAt: null,
      isActive: false,
    };

    console.log("🔄 Countdown manually reset to starting state - Loop stopped");

    res.json({
      success: true,
      message: "Countdown reset to starting state and loop stopped",
      phase: countdownState.phase,
    });
  } catch (error) {
    console.error("Error resetting countdown:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reset countdown",
    });
  }
};
