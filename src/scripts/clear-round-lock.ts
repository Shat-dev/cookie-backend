#!/usr/bin/env ts-node

import pool from "../db/connection";

async function clearRoundLock() {
  console.log("🔓 Clearing PostgreSQL advisory lock for round creation...");

  try {
    // Release the advisory lock (lock ID 12345 from roundCoordinator)
    const { rows } = await pool.query("SELECT pg_advisory_unlock($1)", [12345]);

    if (rows[0]?.pg_advisory_unlock) {
      console.log("✅ Advisory lock cleared successfully!");
    } else {
      console.log("ℹ️ No lock was held (or already released)");
    }

    // Check current round status
    console.log("\n📊 Current system status:");

    // Import lottery client to check current round
    const { lottery } = await import("../lotteryClient");
    const currentRound = await lottery.s_currentRound();
    console.log(`   Current round: ${currentRound.toString()}`);

    if (currentRound === 0n) {
      console.log("   Status: No rounds exist yet");
      console.log(
        "   Next: TwitterPoller should create first round on next mention processing"
      );
    } else {
      console.log(`   Status: Round ${currentRound.toString()} exists`);
    }
  } catch (error) {
    console.error("❌ Error clearing lock:", error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log("\n🏁 Lock clearing complete!");
  }
}

if (require.main === module) {
  clearRoundLock().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { clearRoundLock };
