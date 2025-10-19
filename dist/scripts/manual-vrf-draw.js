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
            throw new Error("Private key required for VRF draw operations");
        }
        console.log("🔑 Signer configured:", await lotteryClient_1.signer.getAddress());
        console.log("🔌 Connecting to database...");
        await connection_1.default.query("SELECT NOW()");
        console.log("✅ Database connection successful");
        console.log("🔍 Fetching active round...");
        const round = await lotteryQueries_1.lotteryQueries.getActiveRound();
        if (!round)
            throw new Error("No active round exists");
        console.log(`✅ Found active round ${round.round_number} (ID: ${round.id})`);
        console.log("📊 Fetching verified entries...");
        const { rows } = await connection_1.default.query("SELECT wallet_address, token_id FROM entries WHERE verified = true");
        const entries = rows;
        console.log(`📊 Found ${entries.length} verified entries`);
        if (entries.length === 0)
            throw new Error("No verified entries");
        const snapshotEntries = entries.map((e) => ({
            wallet_address: e.wallet_address,
            token_id: e.token_id,
        }));
        console.log("📦 Pushing snapshot...");
        const snapshotTxHash = await freezeCoordinator_1.freezeCoordinator.pushSnapshot(round.round_number, snapshotEntries);
        if (!snapshotTxHash)
            throw new Error("Snapshot push failed");
        console.log(`📦 Snapshot pushed - TX: ${snapshotTxHash}`);
        const snapshotReceipt = await lotteryClient_1.signer.provider.waitForTransaction(snapshotTxHash, 3);
        if (!snapshotReceipt)
            throw new Error("Snapshot transaction not yet confirmed");
        console.log(`✅ Snapshot tx confirmed in block ${snapshotReceipt.blockNumber}`);
        console.log("⏳ Waiting 15s for on-chain state sync after snapshot...");
        await new Promise((r) => setTimeout(r, 15000));
        const eligibleTokensCheck = await lotteryClient_1.lottery.getEligibleTokens();
        console.log(`📦 Contract now reports ${eligibleTokensCheck.length} eligible tokens`);
        const signerAddr = await lotteryClient_1.signer.getAddress();
        const [ownerAddr, isDrawing, eligibleTokens] = await Promise.all([
            lotteryClient_1.lottery.owner(),
            lotteryClient_1.lottery.isDrawing(),
            lotteryClient_1.lottery.getEligibleTokens(),
        ]);
        console.log(`👤 Owner:  ${ownerAddr}`);
        console.log(`👤 Signer: ${signerAddr}`);
        console.log(`📦 Eligible tokens on-chain: ${eligibleTokens.length}`);
        console.log(`🔄 isDrawing flag: ${isDrawing}`);
        if (signerAddr.toLowerCase() !== ownerAddr.toLowerCase()) {
            throw new Error("Signer is not contract owner. requestRandomWinner() is onlyOwner.");
        }
        if (isDrawing) {
            throw new Error("Draw already in progress (s_drawing==true).");
        }
        if (eligibleTokens.length === 0) {
            throw new Error("No eligible tokens set on-chain. setEligibleTokens() failed or not mined.");
        }
        try {
            await lotteryClient_1.lottery.requestRandomWinner.staticCall();
        }
        catch (e) {
            console.error("❌ staticCall requestRandomWinner() would revert:", e?.message || e);
            throw e;
        }
        console.log("🎲 Triggering VRF draw...");
        const drawTx = await lotteryClient_1.lottery.requestRandomWinner();
        console.log(`🎲 VRF draw transaction sent: ${drawTx.hash}`);
        const drawReceipt = await drawTx.wait(2);
        console.log(`✅ VRF tx confirmed: ${drawReceipt.hash}`);
        console.log("🏁 Attempting to mark round as completed...");
        try {
            await new Promise((r) => setTimeout(r, 10000));
            const latestRequestId = await lotteryClient_1.lottery.getLatestRequestId();
            console.log(`🔗 Latest VRF requestId: ${latestRequestId}`);
            const drawResult = await lotteryClient_1.lottery.getDrawResult(latestRequestId);
            console.log(`🎯 Draw result — Winner: ${drawResult.winner}, Token: ${drawResult.winningTokenId}`);
            if (drawResult.winner !== "0x0000000000000000000000000000000000000000" &&
                drawResult.winningTokenId !== 0n) {
                await lotteryQueries_1.lotteryQueries.completeRound(round.id, drawResult.winner, drawResult.winningTokenId.toString());
                console.log(`🏁 Winner stored in database: ${drawResult.winner}`);
            }
            else {
                console.log("⏳ Winner data not yet available — VRF still fulfilling.");
            }
        }
        catch (err) {
            console.log(`⚠️ Could not fetch draw result: ${err.message}`);
        }
        console.log("🎯 Creating next round...");
        const nextRound = await lotteryQueries_1.lotteryQueries.createRound(round.round_number + 1);
        console.log(`🎯 Next round ${nextRound.round_number} created`);
        console.log("🚪 Exiting...");
        await connection_1.default.end();
        console.log("✅ Manual VRF draw completed successfully");
        return;
    }
    catch (error) {
        console.error("❌ Error during manual VRF draw:", error.message);
        console.error("Stack trace:", error.stack);
        try {
            await connection_1.default.end();
        }
        catch { }
        return;
    }
}
main().catch((err) => {
    console.error("❌ Unhandled error:", err);
    return;
});
//# sourceMappingURL=manual-vrf-draw.js.map