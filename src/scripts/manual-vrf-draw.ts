import "dotenv/config";
import pool from "../db/connection";
import { lotteryQueries } from "../db/lotteryQueries";
import { freezeCoordinator } from "../services/freezeCoordinator";
import { lottery, signer } from "../lotteryClient";

interface EntryRow {
  wallet_address: string;
  token_id: string;
}

// npx ts-node src/scripts/manual-vrf-draw.ts
async function main(): Promise<void> {
  try {
    if (!signer) {
      throw new Error("Private key required for VRF draw operations");
    }

    console.log("🔑 Signer configured:", await signer.getAddress());

    console.log("🔌 Connecting to database...");
    await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful");

    console.log("🔍 Fetching active round...");
    const round = await lotteryQueries.getActiveRound();
    if (!round) throw new Error("No active round exists");
    console.log(
      `✅ Found active round ${round.round_number} (ID: ${round.id})`
    );

    console.log("📊 Fetching verified entries...");
    const { rows } = await pool.query(
      "SELECT wallet_address, token_id FROM entries WHERE verified = true"
    );

    const entries: EntryRow[] = rows;
    console.log(`📊 Found ${entries.length} verified entries`);
    if (entries.length === 0) throw new Error("No verified entries");

    const snapshotEntries = entries.map((e) => ({
      wallet_address: e.wallet_address,
      token_id: e.token_id,
    }));

    console.log("📦 Pushing snapshot...");
    const snapshotTxHash = await freezeCoordinator.pushSnapshot(
      round.round_number,
      snapshotEntries
    );
    if (!snapshotTxHash) throw new Error("Snapshot push failed");

    console.log(`📦 Snapshot pushed - TX: ${snapshotTxHash}`);
    const snapshotReceipt = await signer.provider!.waitForTransaction(
      snapshotTxHash,
      3
    );
    if (!snapshotReceipt)
      throw new Error("Snapshot transaction not yet confirmed");
    console.log(
      `✅ Snapshot tx confirmed in block ${snapshotReceipt.blockNumber}`
    );

    console.log("⏳ Waiting 15s for on-chain state sync after snapshot...");
    await new Promise((r) => setTimeout(r, 15000));

    const eligibleTokensCheck = await lottery.getEligibleTokens();
    console.log(
      `📦 Contract now reports ${eligibleTokensCheck.length} eligible tokens`
    );

    // ===== Preflight checks before VRF =====
    const signerAddr = await signer.getAddress();
    const [ownerAddr, isDrawing, eligibleTokens] = await Promise.all([
      lottery.owner(),
      lottery.isDrawing(),
      lottery.getEligibleTokens(),
    ]);

    console.log(`👤 Owner:  ${ownerAddr}`);
    console.log(`👤 Signer: ${signerAddr}`);
    console.log(`📦 Eligible tokens on-chain: ${eligibleTokens.length}`);
    console.log(`🔄 isDrawing flag: ${isDrawing}`);

    if (signerAddr.toLowerCase() !== ownerAddr.toLowerCase()) {
      throw new Error(
        "Signer is not contract owner. requestRandomWinner() is onlyOwner."
      );
    }
    if (isDrawing) {
      throw new Error("Draw already in progress (s_drawing==true).");
    }
    if (eligibleTokens.length === 0) {
      throw new Error(
        "No eligible tokens set on-chain. setEligibleTokens() failed or not mined."
      );
    }

    // Optional: dry-run to catch the exact revert reason before sending a tx
    try {
      await lottery.requestRandomWinner.staticCall();
    } catch (e: any) {
      console.error(
        "❌ staticCall requestRandomWinner() would revert:",
        e?.message || e
      );
      throw e;
    }

    // ✅ Trigger VRF draw — no arguments
    console.log("🎲 Triggering VRF draw...");
    const drawTx = await lottery.requestRandomWinner();
    console.log(`🎲 VRF draw transaction sent: ${drawTx.hash}`);

    const drawReceipt = await drawTx.wait(2);
    console.log(`✅ VRF tx confirmed: ${drawReceipt.hash}`);

    // 🏁 Check for latest winner using tracked request IDs
    console.log("🏁 Attempting to mark round as completed...");
    try {
      // Wait 10s to give VRF a chance to fulfill
      await new Promise((r) => setTimeout(r, 10_000));

      // ✅ Get the latest Chainlink requestId tracked on-chain
      const latestRequestId = await lottery.getLatestRequestId();
      console.log(`🔗 Latest VRF requestId: ${latestRequestId}`);

      // Fetch draw result for that exact request
      const drawResult = await lottery.getDrawResult(latestRequestId);
      console.log(
        `🎯 Draw result — Winner: ${drawResult.winner}, Token: ${drawResult.winningTokenId}`
      );

      if (
        drawResult.winner !== "0x0000000000000000000000000000000000000000" &&
        drawResult.winningTokenId !== 0n
      ) {
        await lotteryQueries.completeRound(
          round.id,
          drawResult.winner,
          drawResult.winningTokenId.toString()
        );
        console.log(`🏁 Winner stored in database: ${drawResult.winner}`);
      } else {
        console.log("⏳ Winner data not yet available — VRF still fulfilling.");
      }
    } catch (err: any) {
      console.log(`⚠️ Could not fetch draw result: ${err.message}`);
    }

    console.log("🎯 Creating next round...");
    const nextRound = await lotteryQueries.createRound(round.round_number + 1);
    console.log(`🎯 Next round ${nextRound.round_number} created`);

    console.log("🚪 Exiting...");
    await pool.end();
    console.log("✅ Manual VRF draw completed successfully");
    return;
  } catch (error: any) {
    console.error("❌ Error during manual VRF draw:", error.message);
    console.error("Stack trace:", error.stack);
    try {
      await pool.end();
    } catch {}
    return;
  }
}

main().catch((err) => {
  console.error("❌ Unhandled error:", err);
  return;
});
