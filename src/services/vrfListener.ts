import { lottery } from "../lotteryClient";
import pool from "../db/connection";

const processedTxs = new Set<string>();

export async function startVrfListener() {
  console.log("🔔 Starting VRF listener service (debounced)...");

  lottery.on("WinnerPicked", async (winner, tokenId, randomWord, event) => {
    const txHash = event.transactionHash;
    if (!txHash) return;

    // Debounce duplicate event logs (RPC replays)
    if (processedTxs.has(txHash)) {
      console.log(`⚙️ Skipping duplicate fulfillment tx: ${txHash}`);
      return;
    }
    processedTxs.add(txHash);

    try {
      console.log("🎯 WinnerPicked event detected!");
      console.log("🏆 Winner:", winner);
      console.log("🪙 Token ID:", tokenId.toString());
      console.log("🔗 Fulfillment TX:", `https://testnet.bscscan.com/tx/${txHash}`);

      // Find most recent incomplete round
      const { rows } = await pool.query(
        "SELECT id FROM rounds WHERE completed = false ORDER BY created_at DESC LIMIT 1"
      );

      if (rows.length === 0) {
        console.warn("⚠️ No incomplete round found — skipping DB update");
        return;
      }

      const roundId = rows[0].id;

      // Update round record
      await pool.query(
        `
          UPDATE rounds
          SET winner = $1,
              winning_token_id = $2,
              fulfillment_tx = $3,
              completed = true,
              completed_at = NOW()
          WHERE id = $4
        `,
        [winner, tokenId.toString(), txHash, roundId]
      );

      console.log(`✅ Round ${roundId} updated with winner ${winner}`);
    } catch (err: any) {
      console.error("❌ Error handling WinnerPicked event:", err.message);
    }
  });

  console.log("👂 VRF listener active — waiting for fulfillments...");
}
