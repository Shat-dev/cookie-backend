#!/usr/bin/env ts-node
//"countdown": "ts-node src/scripts/countdown-control.ts"

import axios from "axios";
import env from "../utils/loadEnv";

// Configuration from shared environment loader
const { BACKEND_URL, ADMIN_API_KEY } = env;

console.log(
  `[CONFIG] Using BACKEND_URL=${BACKEND_URL}, ADMIN_API_KEY length=${ADMIN_API_KEY?.length}`
);

// API client with admin authentication
const apiClient = axios.create({
  baseURL: BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_API_KEY}`,
  },
});

/**
 * Get current countdown status (public endpoint)
 */
async function getCountdownStatus() {
  try {
    console.log("📊 Fetching countdown status...");
    const response = await axios.get(`${BACKEND_URL}/api/countdown`);

    const { phase, remainingSeconds, endsAt, isActive } = response.data;

    console.log("\n🎯 Countdown Status:");
    console.log(`   Phase: ${phase}`);
    console.log(`   Active: ${isActive}`);
    console.log(`   Remaining: ${remainingSeconds} seconds`);
    console.log(`   Ends at: ${endsAt || "N/A"}`);

    return response.data;
  } catch (error: any) {
    console.error(
      "❌ Failed to get countdown status:",
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Start a new countdown round (admin endpoint)
 */
async function startCountdownRound() {
  try {
    console.log("🚀 Starting countdown round...");
    const response = await apiClient.post("/api/admin/start-round");

    console.log("✅ Countdown round started successfully!");
    console.log(`   Phase: ${response.data.phase}`);
    console.log(`   Ends at: ${response.data.endsAt}`);

    return response.data;
  } catch (error: any) {
    console.error(
      "❌ Failed to start countdown round:",
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Reset the countdown (admin endpoint)
 */
async function resetCountdown() {
  try {
    console.log("🔄 Resetting countdown...");
    const response = await apiClient.post("/api/admin/reset-countdown");

    console.log("✅ Countdown reset successfully!");
    console.log(`   Phase: ${response.data.phase}`);

    return response.data;
  } catch (error: any) {
    console.error(
      "❌ Failed to reset countdown:",
      error.response?.data || error.message
    );
    throw error;
  }
}

/**
 * Monitor countdown status with real-time updates
 */
async function monitorCountdown(intervalSeconds: number = 5) {
  console.log(
    `👀 Starting countdown monitor (updates every ${intervalSeconds}s)...`
  );
  console.log("Press Ctrl+C to stop monitoring\n");

  const monitor = setInterval(async () => {
    try {
      const status = await getCountdownStatus();

      // Clear previous lines and show updated status
      process.stdout.write("\x1b[2J\x1b[0f"); // Clear screen
      console.log(`🕐 ${new Date().toLocaleTimeString()} - Countdown Monitor`);
      console.log(
        `Phase: ${status.phase} | Active: ${status.isActive} | Remaining: ${status.remainingSeconds}s`
      );

      if (status.phase === "starting" && !status.isActive) {
        console.log('💡 Tip: Use "start" command to begin a new round');
      }
    } catch (error) {
      console.error("Monitor error:", error);
    }
  }, intervalSeconds * 1000);

  // Handle Ctrl+C gracefully
  process.on("SIGINT", () => {
    clearInterval(monitor);
    console.log("\n👋 Monitoring stopped");
    process.exit(0);
  });
}

/**
 * Main CLI interface
 */
async function main() {
  const command = process.argv[2];

  console.log("🎲 Countdown Controller Script");
  console.log(`🔗 Backend URL: ${BACKEND_URL}\n`);

  try {
    switch (command) {
      case "status":
        await getCountdownStatus();
        break;

      case "start":
        await startCountdownRound();
        break;

      case "reset":
        await resetCountdown();
        break;

      case "monitor":
        const interval = parseInt(process.argv[3]) || 5;
        await monitorCountdown(interval);
        break;

      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;

      default:
        console.log(
          '❓ Unknown command. Use "help" to see available commands.\n'
        );
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error("\n💥 Command failed");
    process.exit(1);
  }
}

function showHelp() {
  console.log("📖 Available Commands:");
  console.log("");
  console.log("  status              Get current countdown status");
  console.log("  start               Start a new countdown round (admin)");
  console.log(
    "  reset               Reset countdown to starting state (admin)"
  );
  console.log("  monitor [interval]  Monitor countdown with real time updates");
  console.log("  help                Show this help message");
  console.log("");
  console.log("📋 Examples:");
  console.log("  npm run countdown status");
  console.log("  npm run countdown start");
  console.log("  npm run countdown reset");
  console.log("  npm run countdown monitor 3    # Update every 3 seconds");
  console.log("");
  console.log("🔧 Environment Variables:");
  console.log(
    "  BACKEND_URL     Backend server URL (default: http://localhost:3001)"
  );
  console.log("  ADMIN_API_KEY   Required for admin operations (start/reset)");
  console.log("");
  console.log("⏱️  Countdown Phases:");
  console.log(
    "  starting  → countdown (1 hour) → selecting (1 min) → winner (1 min) → starting"
  );
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

export {
  getCountdownStatus,
  startCountdownRound,
  resetCountdown,
  monitorCountdown,
};
