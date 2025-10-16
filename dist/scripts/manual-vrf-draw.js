"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const connection_1 = __importDefault(require("../db/connection"));
const lotteryQueries_1 = require("../db/lotteryQueries");
const freezeCoordinator_1 = require("../services/freezeCoordinator");
const lotteryClient_1 = require("../lotteryClient");
async function main() {
    try {
        if (!lotteryClient_1.signer) {
            console.error("❌ No signer available - private key not configured");
            throw new Error("Private key required for VRF draw operations");
        }
        console.log("🔑 Signer configured:", await lotteryClient_1.signer.getAddress());
        console.log("🔌 Connecting to database...");
        const testConnection = await connection_1.default.query("SELECT NOW()");
        console.log("✅ Database connection successful");
        console.log("🔍 Fetching active round...");
        const round = await lotteryQueries_1.lotteryQueries.getActiveRound();
        if (!round) {
            console.error("❌ No active round found");
            throw new Error("No active round exists");
        }
        console.log(`✅ Found active round ${round.round_number} (ID: ${round.id})`);
        console.log("📊 Fetching verified entries...");
        const { rows } = await connection_1.default.query("SELECT wallet_address, token_id FROM entries WHERE verified = true");
        const entries = rows;
        console.log(`📊 Found ${entries.length} verified entries`);
        if (entries.length === 0) {
            console.error("❌ No verified entries found");
            throw new Error("No verified entries available for draw");
        }
        const snapshotEntries = entries.map((entry) => ({
            wallet_address: entry.wallet_address,
            token_id: entry.token_id,
        }));
        console.log("📦 Pushing snapshot...");
        const snapshotTx = await freezeCoordinator_1.freezeCoordinator.pushSnapshot(round.round_number, snapshotEntries);
        if (!snapshotTx) {
            console.error("❌ Failed to push snapshot");
            throw new Error("Snapshot push failed");
        }
        console.log(`📦 Snapshot pushed - TX: ${snapshotTx}`);
        console.log("🎲 Triggering VRF draw...");
        const drawTx = await lotteryClient_1.lottery.drawWinner(round.round_number);
        console.log(`🎲 VRF draw transaction sent: ${drawTx.hash}`);
        console.log("⏳ Waiting for transaction confirmation...");
        const receipt = await drawTx.wait(2);
        console.log(`✅ VRF tx confirmed: ${receipt.hash}`);
        console.log("🏁 Attempting to mark round as completed...");
        try {
            const roundData = await lotteryClient_1.lottery.getRound(round.round_number);
            if (roundData.isCompleted &&
                roundData.winner &&
                roundData.winningTokenId !== "0") {
                await lotteryQueries_1.lotteryQueries.completeRound(round.id, roundData.winner, roundData.winningTokenId);
                console.log(`🏁 Round marked completed with winner: ${roundData.winner}`);
            }
            else {
                console.log("⏳ Winner data not yet available - round will be marked completed by background process");
            }
        }
        catch (error) {
            console.log(`⚠️ Could not immediately mark round as completed: ${error.message}`);
            console.log("🔄 Round will be marked completed by background process when winner data is available");
        }
        console.log("🎯 Creating next round...");
        const nextRound = await lotteryQueries_1.lotteryQueries.createRound(round.round_number + 1);
        console.log(`🎯 Next round ${nextRound.round_number} created`);
        console.log("🚪 Exiting...");
        await connection_1.default.end();
        console.log("✅ Manual VRF draw completed successfully");
        process.exit(0);
    }
    catch (error) {
        console.error("❌ Error during manual VRF draw:", error.message);
        console.error("Stack trace:", error.stack);
        try {
            await connection_1.default.end();
        }
        catch (poolError) {
            console.error("❌ Error closing database connection:", poolError);
        }
        process.exit(1);
    }
}
main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
});
//# sourceMappingURL=manual-vrf-draw.js.map