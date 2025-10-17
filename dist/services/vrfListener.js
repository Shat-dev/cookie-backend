"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startVrfListener = startVrfListener;
const lotteryClient_1 = require("../lotteryClient");
const connection_1 = __importDefault(require("../db/connection"));
const processedTxs = new Set();
async function startVrfListener() {
    console.log("🔔 Starting VRF listener service (debounced)...");
    lotteryClient_1.lottery.on("WinnerPicked", async (winner, tokenId, randomWord, event) => {
        const txHash = event.transactionHash;
        if (!txHash)
            return;
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
            const { rows } = await connection_1.default.query("SELECT id FROM rounds WHERE completed = false ORDER BY created_at DESC LIMIT 1");
            if (rows.length === 0) {
                console.warn("⚠️ No incomplete round found — skipping DB update");
                return;
            }
            const roundId = rows[0].id;
            await connection_1.default.query(`
          UPDATE rounds
          SET winner = $1,
              winning_token_id = $2,
              fulfillment_tx = $3,
              completed = true,
              completed_at = NOW()
          WHERE id = $4
        `, [winner, tokenId.toString(), txHash, roundId]);
            console.log(`✅ Round ${roundId} updated with winner ${winner}`);
        }
        catch (err) {
            console.error("❌ Error handling WinnerPicked event:", err.message);
        }
    });
    console.log("👂 VRF listener active — waiting for fulfillments...");
}
//# sourceMappingURL=vrfListener.js.map