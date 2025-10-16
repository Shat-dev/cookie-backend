import "dotenv/config";
import pool from "../db/connection";
import { lotteryQueries } from "../db/lotteryQueries";
import { freezeCoordinator } from "../services/freezeCoordinator";
import { lottery, signer } from "../lotteryClient";

interface EntryRow {
  wallet_address: string;
  token_id: string;
}

async function main(): Promise<void> {
  try {
    // Check if signer is available for blockchain transactions
    if (!signer) {
      console.error("❌ No signer available - private key not configured");
      throw new Error("Private key required for VRF draw operations");
    }

    console.log("🔑 Signer configured:", await signer.getAddress());

    // Connect to the database and log success
    console.log("🔌 Connecting to database...");
    const testConnection = await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful");

    // Retrieve the active round
    console.log("🔍 Fetching active round...");
    const round = await lotteryQueries.getActiveRound();

    if (!round) {
      console.error("❌ No active round found");
      throw new Error("No active round exists");
    }

    console.log(
      `✅ Found active round ${round.round_number} (ID: ${round.id})`
    );

    // Fetch all verified entries
    console.log("📊 Fetching verified entries...");
    const { rows } = await pool.query(
      "SELECT wallet_address, token_id FROM entries WHERE verified = true"
    );

    const entries: EntryRow[] = rows;
    console.log(`📊 Found ${entries.length} verified entries`);

    if (entries.length === 0) {
      console.error("❌ No verified entries found");
      throw new Error("No verified entries available for draw");
    }

    // Transform entries to the format expected by freezeCoordinator
    const snapshotEntries = entries.map((entry) => ({
      wallet_address: entry.wallet_address,
      token_id: entry.token_id,
    }));

    // Push snapshot to contract
    console.log("📦 Pushing snapshot...");
    const snapshotTx = await freezeCoordinator.pushSnapshot(
      round.round_number,
      snapshotEntries
    );

    if (!snapshotTx) {
      console.error("❌ Failed to push snapshot");
      throw new Error("Snapshot push failed");
    }

    console.log(`📦 Snapshot pushed - TX: ${snapshotTx}`);

    // Trigger manual VRF draw
    console.log("🎲 Triggering VRF draw...");
    const drawTx = await lottery.drawWinner(round.round_number);
    console.log(`🎲 VRF draw transaction sent: ${drawTx.hash}`);

    // Wait for transaction confirmation
    console.log("⏳ Waiting for transaction confirmation...");
    const receipt = await drawTx.wait(2);
    console.log(`✅ VRF tx confirmed: ${receipt.hash}`);

    // Mark the round as completed (with try/catch for winner data)
    console.log("🏁 Attempting to mark round as completed...");
    try {
      // Try to get winner data from the blockchain
      const roundData = await lottery.getRound(round.round_number);

      if (
        roundData.isCompleted &&
        roundData.winner &&
        roundData.winningTokenId !== "0"
      ) {
        await lotteryQueries.completeRound(
          round.id,
          roundData.winner,
          roundData.winningTokenId
        );
        console.log(
          `🏁 Round marked completed with winner: ${roundData.winner}`
        );
      } else {
        console.log(
          "⏳ Winner data not yet available - round will be marked completed by background process"
        );
      }
    } catch (error: any) {
      console.log(
        `⚠️ Could not immediately mark round as completed: ${error.message}`
      );
      console.log(
        "🔄 Round will be marked completed by background process when winner data is available"
      );
    }

    // Automatically create the next round
    console.log("🎯 Creating next round...");
    const nextRound = await lotteryQueries.createRound(round.round_number + 1);
    console.log(`🎯 Next round ${nextRound.round_number} created`);

    // Close the DB connection and exit
    console.log("🚪 Exiting...");
    await pool.end();
    console.log("✅ Manual VRF draw completed successfully");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Error during manual VRF draw:", error.message);
    console.error("Stack trace:", error.stack);

    try {
      await pool.end();
    } catch (poolError) {
      console.error("❌ Error closing database connection:", poolError);
    }

    process.exit(1);
  }
}

// Execute the main function
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
