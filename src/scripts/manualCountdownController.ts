import { Request, Response } from "express";
import { fork } from "child_process";
import path from "path";

// In-memory state for the countdown system
interface CountdownState {
  phase: "starting" | "countdown" | "selecting" | "winner";
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
 * Internal function to manage the full countdown lifecycle
 */
function startCountdownLifecycle() {
  // Clear any existing timeout
  if (currentTimeout) {
    clearTimeout(currentTimeout);
  }

  // Phase 1: Start countdown (1 hour)
  const now = new Date();
  const countdownEnd = new Date(now.getTime() + 60 * 1000); // 1 hour from now andd //60 after, this is now 1 minute

  countdownState = {
    phase: "countdown",
    endsAt: countdownEnd,
    isActive: true,
  };

  console.log("🚀 Countdown started - Phase 1: countdown (1 hour)");

  // Schedule transition to "selecting" phase after 1 hour
  currentTimeout = setTimeout(() => {
    countdownState = {
      phase: "selecting",
      endsAt: null,
      isActive: true,
    };

    console.log("🎯 Phase 2: selecting (1 minute)");

    // Schedule transition to "winner" phase after 1 minute
    currentTimeout = setTimeout(() => {
      countdownState = {
        phase: "winner",
        endsAt: null,
        isActive: true,
      };

      console.log("🏆 Phase 3: winner (1 minute)");
      console.log("🏁 Winner phase reached — triggering manual VRF draw");

      // Fork the VRF draw script as an isolated process
      try {
        const vrfPath =
          process.env.NODE_ENV === "production"
            ? path.resolve(__dirname, "../scripts/manual-vrf-draw.js")
            : path.resolve(__dirname, "../scripts/manual-vrf-draw.ts");

        console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`🔧 VRF script path: ${vrfPath}`);

        const subprocess = fork(vrfPath, [], {
          execArgv:
            process.env.NODE_ENV === "production"
              ? []
              : ["-r", require.resolve("ts-node/register")],
          stdio: ["pipe", "pipe", "pipe", "ipc"],
        });

        // Explicit stream piping to ensure VRF logs appear in main console
        subprocess.stdout?.on("data", (data) => {
          process.stdout.write(data);
        });

        subprocess.stderr?.on("data", (data) => {
          process.stderr.write(data);
        });

        subprocess.on("error", (err) => {
          console.error("❌ Failed to spawn VRF subprocess:", err);
          console.error("❌ Check if the VRF script file exists at:", vrfPath);
        });

        subprocess.on("exit", (code) => {
          console.log(`🎲 VRF subprocess exited with code ${code}`);
        });
      } catch (err) {
        console.error("❌ Failed to start manual VRF draw process:", err);
      }

      // Schedule reset to "starting" phase after 1 more minute
      currentTimeout = setTimeout(() => {
        countdownState = {
          phase: "starting",
          endsAt: null,
          isActive: false,
        };

        console.log("🔄 Reset to starting - Ready for next round");
        currentTimeout = null;
      }, 60 * 1000); // 1 minute
    }, 60 * 1000); // 1 minute
  }, 60 * 1000); // 1 hour need to add * 60
}

/**
 * Get current state (for debugging)
 */
export const getCurrentState = () => countdownState;

/**
 * Reset the countdown (for emergency use)
 */
export const resetCountdown = (req: Request, res: Response): void => {
  try {
    if (currentTimeout) {
      clearTimeout(currentTimeout);
      currentTimeout = null;
    }

    countdownState = {
      phase: "starting",
      endsAt: null,
      isActive: false,
    };

    console.log("🔄 Countdown manually reset to starting state");

    res.json({
      success: true,
      message: "Countdown reset to starting state",
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
