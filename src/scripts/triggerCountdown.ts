#!/usr/bin/env tsx

import "dotenv/config";

/**
 * Local script to trigger a countdown round on the deployed Railway backend
 *
 * Usage:
 *   npx tsx triggerCountdown.ts
 *
 * Environment Variables Required:
 *   RAILWAY_APP_URL - Your Railway app URL (e.g., https://your-app.railway.app)
 *   ADMIN_SECRET - The admin secret key for authentication
 */

interface CountdownResponse {
  success: boolean;
  message?: string;
  phase?: string;
  endsAt?: string;
  error?: string;
  currentPhase?: string;
  remainingSeconds?: number;
  isActive?: boolean;
}

async function triggerCountdown(): Promise<void> {
  const railwayUrl = process.env.RAILWAY_APP_URL;
  const adminSecret = process.env.ADMIN_SECRET;

  // Validate environment variables
  if (!railwayUrl) {
    console.error("❌ Error: RAILWAY_APP_URL environment variable is required");
    console.log(
      "   Set it to your Railway app URL, e.g.: https://your-app.railway.app"
    );
    process.exit(1);
  }

  if (!adminSecret) {
    console.error("❌ Error: ADMIN_SECRET environment variable is required");
    console.log(
      "   This should match the ADMIN_API_KEY on your Railway backend"
    );
    process.exit(1);
  }

  const baseUrl = railwayUrl.replace(/\/$/, "");
  const triggerUrl = `${baseUrl}/api/admin/start-round`;

  console.log("🚀 Triggering countdown round...");
  console.log(`📡 Target URL: ${triggerUrl}`);

  try {
    const response = await fetch(triggerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminSecret}`,
        "User-Agent": "Cookie-Lottery-Trigger/1.0",
      },
      body: JSON.stringify({}),
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`❌ HTTP Error ${response.status}: ${response.statusText}`);
      console.error("Response:", responseText);

      if (response.status === 401) {
        console.log(
          "💡 Tip: Check that your ADMIN_SECRET matches the ADMIN_API_KEY on Railway"
        );
      } else if (response.status === 404) {
        console.log(
          "💡 Tip: Check that your RAILWAY_APP_URL is correct and the backend is deployed"
        );
      }
      process.exit(1);
    }

    // ✅ Typed parse
    const data = JSON.parse(responseText) as CountdownResponse;

    if (data.success) {
      console.log("✅ Countdown round started successfully!");
      console.log(`📊 Current phase: ${data.phase}`);
      if (data.endsAt) {
        const endTime = new Date(data.endsAt);
        console.log(`⏰ Countdown ends at: ${endTime.toLocaleString()}`);
      }
      console.log("🎯 Your frontend should now show the live countdown!");
    } else {
      console.error("❌ Failed to start countdown round");
      console.error("Error:", data.error);
      if (data.currentPhase) {
        console.log(`ℹ️  Current phase: ${data.currentPhase}`);
        console.log(
          "💡 A countdown may already be active. Wait for it to complete or use reset."
        );
      }
    }
  } catch (error) {
    console.error("❌ Network error occurred:");

    if (error instanceof Error) {
      console.error("Error:", error.message);
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("ECONNREFUSED")
      ) {
        console.log(
          "💡 Tip: Check that your RAILWAY_APP_URL is correct and accessible"
        );
      } else if (
        error.message.includes("certificate") ||
        error.message.includes("SSL")
      ) {
        console.log(
          "💡 Tip: Make sure you're using https:// for your Railway URL"
        );
      }
    } else {
      console.error("Unknown error:", error);
    }

    process.exit(1);
  }
}

// ✅ Typed status checker
async function checkCountdownStatus(): Promise<void> {
  const railwayUrl = process.env.RAILWAY_APP_URL;

  if (!railwayUrl) {
    console.error("❌ Error: RAILWAY_APP_URL environment variable is required");
    process.exit(1);
  }

  const baseUrl = railwayUrl.replace(/\/$/, "");
  const statusUrl = `${baseUrl}/api/lottery/countdown`;

  try {
    const response = await fetch(statusUrl);
    const data = (await response.json()) as CountdownResponse;

    if (data.success) {
      console.log("📊 Current countdown status:");
      console.log(`   Phase: ${data.phase}`);
      console.log(`   Remaining seconds: ${data.remainingSeconds}`);
      console.log(`   Is active: ${data.isActive}`);
      if (data.endsAt) {
        const endTime = new Date(data.endsAt);
        console.log(`   Ends at: ${endTime.toLocaleString()}`);
      }
    } else {
      console.error("❌ Failed to get countdown status:", data.error);
    }
  } catch (error) {
    console.error("❌ Error checking countdown status:", error);
  }
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--status") || args.includes("-s")) {
    await checkCountdownStatus();
  } else if (args.includes("--help") || args.includes("-h")) {
    console.log("Cookie Lottery Countdown Trigger");
    console.log("");
    console.log("Usage:");
    console.log(
      "  npx tsx triggerCountdown.ts           # Start a new countdown round"
    );
    console.log(
      "  npx tsx triggerCountdown.ts --status  # Check current countdown status"
    );
    console.log("  npx tsx triggerCountdown.ts --help    # Show this help");
    console.log("");
    console.log("Environment Variables:");
    console.log("  RAILWAY_APP_URL  - Your Railway app URL (required)");
    console.log(
      "  ADMIN_SECRET     - Admin secret key for authentication (required)"
    );
  } else {
    await triggerCountdown();
  }
}

main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
