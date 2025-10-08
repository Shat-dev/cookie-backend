import "dotenv/config";
import { lottery } from "../lotteryClient";
import pool from "../db/connection";

async function debugRound() {
  console.log("🔍 Debugging Round Data");
  console.log("=======================");

  try {
    const currentRound = await lottery.s_currentRound();
    console.log(`Current round: ${currentRound}`);

    if (currentRound > 0n) {
      console.log("Calling getRound...");
      const rd = await lottery.getRound(Number(currentRound));
      console.log("Raw round data:", rd);
      console.log("Round data type:", typeof rd);
      console.log("Round properties:");
      console.log("  start:", rd.start, typeof rd.start);
      console.log("  end:", rd.end, typeof rd.end);
      console.log("  isActive:", rd.isActive, typeof rd.isActive);
      console.log("  isCompleted:", rd.isCompleted, typeof rd.isCompleted);
    }
  } catch (error: any) {
    console.error("❌ Debug failed:", error.message || error);
  } finally {
    await pool.end();
  }
}

// Run debug if called directly
if (require.main === module) {
  debugRound()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Debug script failed:", error);
      process.exit(1);
    });
}
