import "dotenv/config";
import { ethers } from "ethers";
import { lottery, getRound } from "../lotteryClient";
import { entryRepository } from "../db/entryRepository";

async function printStatus() {
  console.log("🤖 Chainlink Automation Status");
  console.log("================================\n");

  try {
    // Get automation status
    const [enabled, nextAt, currentRound] = await Promise.all([
      lottery.s_automationEnabled(),
      lottery.s_nextAllowedPerformAt(),
      lottery.s_currentRound(),
    ]);

    const [upkeepNeeded, performData] = await lottery.checkUpkeep("0x");

    let reason = "";
    if (!upkeepNeeded && performData !== "0x") {
      try {
        reason = ethers.toUtf8String(performData);
      } catch {
        reason = "unknown";
      }
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const nextAllowedTime = Number(nextAt);
    const timeUntilNext = Math.max(0, nextAllowedTime - currentTime);

    // Automation info
    console.log("📊 AUTOMATION:");
    console.log(`   Enabled: ${enabled ? "YES ✅" : "NO ❌"}`);
    console.log(`   Upkeep Needed: ${upkeepNeeded ? "YES ✅" : "NO ❌"}`);
    if (!upkeepNeeded && reason) {
      console.log(`   Reason: ${reason}`);
    }
    if (timeUntilNext > 0) {
      const hours = Math.floor(timeUntilNext / 3600);
      const minutes = Math.floor((timeUntilNext % 3600) / 60);
      const seconds = timeUntilNext % 60;
      console.log(`   Next Allowed: ${hours}h ${minutes}m ${seconds}s`);
    }
    console.log();

    // Round info
    console.log("🎲 ROUND STATUS:");
    if (currentRound > 0n) {
      console.log(`   Current Round: ${Number(currentRound)}`);

      try {
        const rd = await getRound(Number(currentRound));
        const now = BigInt(currentTime);
        const isActive =
          rd.isActive &&
          BigInt(rd.start) <= now &&
          BigInt(rd.end) > now &&
          !rd.isCompleted;

        if (isActive) {
          const endTime = Number(rd.end);
          const secondsRemaining = endTime - currentTime;
          const minutes = Math.floor(secondsRemaining / 60);
          const seconds = secondsRemaining % 60;

          console.log(`   Status: ACTIVE ✅`);
          console.log(`   Ends in: ${minutes}m ${seconds}s`);
          console.log(`   Total Entries: ${rd.totalEntries}`);
        } else if (rd.isCompleted) {
          console.log(`   Status: COMPLETED ✅`);
          console.log(`   Winner: ${rd.winner}`);
          console.log(`   Winning Token: ${rd.winningTokenId}`);
        } else {
          console.log(`   Status: INACTIVE ❌`);
        }
      } catch (error) {
        console.log(`   Error reading round data:`, error);
      }
    } else {
      console.log(`   No rounds created yet`);
    }
    console.log();

    // Entry pool info
    console.log("📋 ENTRY POOL:");
    const unpushedCount = await entryRepository.countUnpushed();
    console.log(`   Unpushed Entries: ${unpushedCount}`);

    if (unpushedCount > 0 && (!currentRound || currentRound === 0n)) {
      console.log(`   ⚠️  NEEDS ROUND CREATION - First entry will trigger`);
    }
    console.log();

    // Summary
    console.log("📌 SUMMARY:");
    if (!enabled) {
      console.log(
        "   ⚠️  Automation is DISABLED - Run 'npm run enable-automation' to enable"
      );
    } else if (unpushedCount > 0 && (!currentRound || currentRound === 0n)) {
      console.log(
        "   ✅ System is ready - Waiting for first entry to create round"
      );
    } else if (currentRound > 0n) {
      console.log("   ✅ Round is active - System operating normally");
    } else {
      console.log("   💤 System is idle - No entries to process");
    }
  } catch (error: any) {
    console.error("❌ Error checking status:", error.message || error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  printStatus()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Script failed:", error);
      process.exit(1);
    });
}
