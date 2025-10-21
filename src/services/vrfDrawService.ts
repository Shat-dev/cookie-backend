import pool from "../db/connection";
import { lotteryQueries } from "../db/lotteryQueries";
import { freezeCoordinator } from "./freezeCoordinator";
import { lottery, signer } from "../lotteryClient";
import {
  auditAction,
  AuditActionType,
  sanitizeErrorResponse,
} from "../utils/auditLogger";

interface EntryRow {
  wallet_address: string;
  token_id: string;
}

interface VrfDrawResult {
  success: boolean;
  txHash?: string;
  winnerAddress?: string;
  winningTokenId?: string;
  roundId?: number;
  roundNumber?: number;
  message: string;
  error?: string;
}

/**
 * Execute VRF draw process with full authentication and audit logging
 * This function contains the core VRF logic extracted from manual-vrf-draw.ts
 */
export async function executeVrfDraw(
  adminIp?: string,
  userAgent?: string
): Promise<VrfDrawResult> {
  const startTime = Date.now();

  try {
    console.log(
      "🎲 [ADMIN VRF_CALL] Starting authenticated VRF draw process..."
    );

    // Validate signer configuration
    if (!signer) {
      throw new Error("Private key required for VRF draw operations");
    }

    const signerAddress = await signer.getAddress();
    console.log("🔑 [ADMIN VRF_CALL] Signer configured:", signerAddress);

    // Test database connection
    console.log("🔌 [ADMIN VRF_CALL] Connecting to database...");
    await pool.query("SELECT NOW()");
    console.log("✅ [ADMIN VRF_CALL] Database connection successful");

    // Fetch active round
    console.log("🔍 [ADMIN VRF_CALL] Fetching active round...");
    const round = await lotteryQueries.getActiveRound();
    if (!round) throw new Error("No active round exists");
    console.log(
      `✅ [ADMIN VRF_CALL] Found active round ${round.round_number} (ID: ${round.id})`
    );

    // Fetch verified entries
    console.log("📊 [ADMIN VRF_CALL] Fetching verified entries...");
    const { rows } = await pool.query(
      "SELECT wallet_address, token_id FROM entries WHERE verified = true"
    );

    const entries: EntryRow[] = rows;
    console.log(`📊 [ADMIN VRF_CALL] Found ${entries.length} verified entries`);
    if (entries.length === 0) throw new Error("No verified entries");

    const snapshotEntries = entries.map((e) => ({
      wallet_address: e.wallet_address,
      token_id: e.token_id,
    }));

    // Push snapshot to coordinator
    console.log("📦 [ADMIN VRF_CALL] Pushing snapshot...");
    const snapshotTxHash = await freezeCoordinator.pushSnapshot(
      round.round_number,
      snapshotEntries
    );
    if (!snapshotTxHash) throw new Error("Snapshot push failed");

    console.log(`📦 [ADMIN VRF_CALL] Snapshot pushed - TX: ${snapshotTxHash}`);
    const snapshotReceipt = await signer.provider!.waitForTransaction(
      snapshotTxHash,
      3
    );
    if (!snapshotReceipt)
      throw new Error("Snapshot transaction not yet confirmed");
    console.log(
      `✅ [ADMIN VRF_CALL] Snapshot tx confirmed in block ${snapshotReceipt.blockNumber}`
    );

    // Wait for on-chain state sync
    console.log(
      "⏳ [ADMIN VRF_CALL] Waiting 15s for on-chain state sync after snapshot..."
    );
    await new Promise((r) => setTimeout(r, 15000));

    const eligibleTokensCheck = await lottery.getEligibleTokens();
    console.log(
      `📦 [ADMIN VRF_CALL] Contract now reports ${eligibleTokensCheck.length} eligible tokens`
    );

    // Preflight checks before VRF
    const [ownerAddr, isDrawing, eligibleTokens] = await Promise.all([
      lottery.owner(),
      lottery.isDrawing(),
      lottery.getEligibleTokens(),
    ]);

    console.log(`👤 [ADMIN VRF_CALL] Owner:  ${ownerAddr}`);
    console.log(`👤 [ADMIN VRF_CALL] Signer: ${signerAddress}`);
    console.log(
      `📦 [ADMIN VRF_CALL] Eligible tokens on-chain: ${eligibleTokens.length}`
    );
    console.log(`🔄 [ADMIN VRF_CALL] isDrawing flag: ${isDrawing}`);

    if (signerAddress.toLowerCase() !== ownerAddr.toLowerCase()) {
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

    // Dry-run to catch revert reasons
    try {
      await lottery.requestRandomWinner.staticCall();
    } catch (e: any) {
      console.error(
        "❌ [ADMIN VRF_CALL] staticCall requestRandomWinner() would revert:",
        e?.message || e
      );
      throw e;
    }

    // Execute VRF draw
    console.log("🎲 [ADMIN VRF_CALL] Triggering VRF draw...");
    const drawTx = await lottery.requestRandomWinner();
    console.log(
      `🎲 [ADMIN VRF_CALL] VRF draw transaction sent: ${drawTx.hash}`
    );

    const drawReceipt = await drawTx.wait(2);
    console.log(`✅ [ADMIN VRF_CALL] VRF tx confirmed: ${drawReceipt.hash}`);

    // Store VRF transaction hash in database
    await lotteryQueries.updateVrfTransactionHash(round.id, drawTx.hash);

    // Attempt to get draw result
    let winnerAddress: string | undefined;
    let winningTokenId: string | undefined;

    console.log("🏁 [ADMIN VRF_CALL] Attempting to mark round as completed...");
    try {
      // Wait for VRF fulfillment
      await new Promise((r) => setTimeout(r, 10_000));

      // Get the latest Chainlink requestId
      const latestRequestId = await lottery.getLatestRequestId();
      console.log(
        `🔗 [ADMIN VRF_CALL] Latest VRF requestId: ${latestRequestId}`
      );

      // Fetch draw result
      const drawResult = await lottery.getDrawResult(latestRequestId);
      console.log(
        `🎯 [ADMIN VRF_CALL] Draw result — Winner: ${drawResult.winner}, Token: ${drawResult.winningTokenId}`
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
        console.log(
          `🏁 [ADMIN VRF_CALL] Winner stored in database: ${drawResult.winner}`
        );

        winnerAddress = drawResult.winner;
        winningTokenId = drawResult.winningTokenId.toString();
      } else {
        console.log(
          "⏳ [ADMIN VRF_CALL] Winner data not yet available — VRF still fulfilling."
        );
      }
    } catch (err: any) {
      console.log(
        `⚠️ [ADMIN VRF_CALL] Could not fetch draw result: ${err.message}`
      );
    }

    // Create next round
    console.log("🎯 [ADMIN VRF_CALL] Creating next round...");
    const nextRound = await lotteryQueries.createRound(round.round_number + 1);
    console.log(
      `🎯 [ADMIN VRF_CALL] Next round ${nextRound.round_number} created`
    );

    const duration = Date.now() - startTime;
    console.log(
      `✅ [ADMIN VRF_CALL] VRF draw completed successfully in ${duration}ms`
    );

    // Audit log successful VRF execution
    if (adminIp || userAgent) {
      auditAction(
        AuditActionType.DRAW_WINNER,
        {
          ip: adminIp,
          headers: { "user-agent": userAgent },
          method: "POST",
          path: "/api/admin/manual-vrf-draw",
        } as any,
        {
          round_id: round.id,
          round_number: round.round_number,
          tx_hash: drawTx.hash,
          winner_address: winnerAddress,
          winning_token_id: winningTokenId,
          entries_count: entries.length,
          execution_duration: duration,
          success: true,
        }
      );
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
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const { logDetails } = sanitizeErrorResponse(
      error,
      "VRF draw execution failed"
    );

    console.error(
      "❌ [ADMIN VRF_CALL] Error during VRF draw:",
      logDetails.message
    );
    console.error("❌ [ADMIN VRF_CALL] Stack trace:", error.stack);

    // Audit log failed VRF execution
    if (adminIp || userAgent) {
      auditAction(
        AuditActionType.AUTH_FAILURE,
        {
          ip: adminIp,
          headers: { "user-agent": userAgent },
          method: "POST",
          path: "/api/admin/manual-vrf-draw",
        } as any,
        {
          reason: "vrf_draw_execution_failed",
          error: logDetails.message,
          execution_duration: duration,
          success: false,
        }
      );
    }

    return {
      success: false,
      message: "VRF draw execution failed",
      error: logDetails.message,
    };
  }
}
