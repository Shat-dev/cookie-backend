"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeVrfDraw = executeVrfDraw;
const connection_1 = __importDefault(require("../db/connection"));
const lotteryQueries_1 = require("../db/lotteryQueries");
const freezeCoordinator_1 = require("./freezeCoordinator");
const lotteryClient_1 = require("../lotteryClient");
const auditLogger_1 = require("../utils/auditLogger");
async function executeVrfDraw(adminIp, userAgent) {
    const startTime = Date.now();
    try {
        console.log("🎲 [ADMIN VRF_CALL] Starting authenticated VRF draw process...");
        if (!lotteryClient_1.signer) {
            throw new Error("Private key required for VRF draw operations");
        }
        const signerAddress = await lotteryClient_1.signer.getAddress();
        console.log("🔑 [ADMIN VRF_CALL] Signer configured:", signerAddress);
        console.log("🔌 [ADMIN VRF_CALL] Connecting to database...");
        await connection_1.default.query("SELECT NOW()");
        console.log("✅ [ADMIN VRF_CALL] Database connection successful");
        console.log("🔍 [ADMIN VRF_CALL] Fetching active round...");
        const round = await lotteryQueries_1.lotteryQueries.getActiveRound();
        if (!round)
            throw new Error("No active round exists");
        console.log(`✅ [ADMIN VRF_CALL] Found active round ${round.round_number} (ID: ${round.id})`);
        console.log("📊 [ADMIN VRF_CALL] Fetching verified entries...");
        const { rows } = await connection_1.default.query("SELECT wallet_address, token_id FROM entries WHERE verified = true");
        const entries = rows;
        console.log(`📊 [ADMIN VRF_CALL] Found ${entries.length} verified entries`);
        if (entries.length === 0)
            throw new Error("No verified entries");
        const snapshotEntries = entries.map((e) => ({
            wallet_address: e.wallet_address,
            token_id: e.token_id,
        }));
        console.log("📦 [ADMIN VRF_CALL] Pushing snapshot...");
        const snapshotTxHash = await freezeCoordinator_1.freezeCoordinator.pushSnapshot(round.round_number, snapshotEntries);
        if (!snapshotTxHash)
            throw new Error("Snapshot push failed");
        console.log(`📦 [ADMIN VRF_CALL] Snapshot pushed - TX: ${snapshotTxHash}`);
        const snapshotReceipt = await lotteryClient_1.signer.provider.waitForTransaction(snapshotTxHash, 3);
        if (!snapshotReceipt)
            throw new Error("Snapshot transaction not yet confirmed");
        console.log(`✅ [ADMIN VRF_CALL] Snapshot tx confirmed in block ${snapshotReceipt.blockNumber}`);
        console.log("⏳ [ADMIN VRF_CALL] Waiting 15s for on-chain state sync after snapshot...");
        await new Promise((r) => setTimeout(r, 15000));
        const eligibleTokensCheck = await lotteryClient_1.lottery.getEligibleTokens();
        console.log(`📦 [ADMIN VRF_CALL] Contract now reports ${eligibleTokensCheck.length} eligible tokens`);
        const [ownerAddr, isDrawing, eligibleTokens] = await Promise.all([
            lotteryClient_1.lottery.owner(),
            lotteryClient_1.lottery.isDrawing(),
            lotteryClient_1.lottery.getEligibleTokens(),
        ]);
        console.log(`👤 [ADMIN VRF_CALL] Owner:  ${ownerAddr}`);
        console.log(`👤 [ADMIN VRF_CALL] Signer: ${signerAddress}`);
        console.log(`📦 [ADMIN VRF_CALL] Eligible tokens on-chain: ${eligibleTokens.length}`);
        console.log(`🔄 [ADMIN VRF_CALL] isDrawing flag: ${isDrawing}`);
        if (signerAddress.toLowerCase() !== ownerAddr.toLowerCase()) {
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
            console.error("❌ [ADMIN VRF_CALL] staticCall requestRandomWinner() would revert:", e?.message || e);
            throw e;
        }
        console.log("🎲 [ADMIN VRF_CALL] Triggering VRF draw...");
        const drawTx = await lotteryClient_1.lottery.requestRandomWinner();
        console.log(`🎲 [ADMIN VRF_CALL] VRF draw transaction sent: ${drawTx.hash}`);
        const drawReceipt = await drawTx.wait(2);
        console.log(`✅ [ADMIN VRF_CALL] VRF tx confirmed: ${drawReceipt.hash}`);
        await lotteryQueries_1.lotteryQueries.updateVrfTransactionHash(round.id, drawTx.hash);
        let winnerAddress;
        let winningTokenId;
        console.log("🏁 [ADMIN VRF_CALL] Attempting to mark round as completed...");
        try {
            await new Promise((r) => setTimeout(r, 10000));
            const latestRequestId = await lotteryClient_1.lottery.getLatestRequestId();
            console.log(`🔗 [ADMIN VRF_CALL] Latest VRF requestId: ${latestRequestId}`);
            const drawResult = await lotteryClient_1.lottery.getDrawResult(latestRequestId);
            console.log(`🎯 [ADMIN VRF_CALL] Draw result — Winner: ${drawResult.winner}, Token: ${drawResult.winningTokenId}`);
            if (drawResult.winner !== "0x0000000000000000000000000000000000000000" &&
                drawResult.winningTokenId !== 0n) {
                await lotteryQueries_1.lotteryQueries.completeRound(round.id, drawResult.winner, drawResult.winningTokenId.toString());
                console.log(`🏁 [ADMIN VRF_CALL] Winner stored in database: ${drawResult.winner}`);
                winnerAddress = drawResult.winner;
                winningTokenId = drawResult.winningTokenId.toString();
            }
            else {
                console.log("⏳ [ADMIN VRF_CALL] Winner data not yet available — VRF still fulfilling.");
            }
        }
        catch (err) {
            console.log(`⚠️ [ADMIN VRF_CALL] Could not fetch draw result: ${err.message}`);
        }
        console.log("🎯 [ADMIN VRF_CALL] Creating next round...");
        const nextRound = await lotteryQueries_1.lotteryQueries.createRound(round.round_number + 1);
        console.log(`🎯 [ADMIN VRF_CALL] Next round ${nextRound.round_number} created`);
        const duration = Date.now() - startTime;
        console.log(`✅ [ADMIN VRF_CALL] VRF draw completed successfully in ${duration}ms`);
        if (adminIp || userAgent) {
            (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.DRAW_WINNER, {
                ip: adminIp,
                headers: { "user-agent": userAgent },
                method: "POST",
                path: "/api/admin/manual-vrf-draw",
            }, {
                round_id: round.id,
                round_number: round.round_number,
                tx_hash: drawTx.hash,
                winner_address: winnerAddress,
                winning_token_id: winningTokenId,
                entries_count: entries.length,
                execution_duration: duration,
                success: true,
            });
        }
        return {
            success: true,
            txHash: drawTx.hash,
            winnerAddress,
            winningTokenId,
            roundId: round.id,
            roundNumber: round.round_number,
            message: `VRF draw executed successfully. TX: ${drawTx.hash}`,
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "VRF draw execution failed");
        console.error("❌ [ADMIN VRF_CALL] Error during VRF draw:", logDetails.message);
        console.error("❌ [ADMIN VRF_CALL] Stack trace:", error.stack);
        if (adminIp || userAgent) {
            (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.AUTH_FAILURE, {
                ip: adminIp,
                headers: { "user-agent": userAgent },
                method: "POST",
                path: "/api/admin/manual-vrf-draw",
            }, {
                reason: "vrf_draw_execution_failed",
                error: logDetails.message,
                execution_duration: duration,
                success: false,
            });
        }
        return {
            success: false,
            message: "VRF draw execution failed",
            error: logDetails.message,
        };
    }
}
//# sourceMappingURL=vrfDrawService.js.map