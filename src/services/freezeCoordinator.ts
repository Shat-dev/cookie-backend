/* eslint-disable no-console */
import "dotenv/config";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import { lottery } from "../lotteryClient";
import { validateEntries } from "./validateEntries";
import { schedulerRepository } from "../db/schedulerRepository";

const stateRepo = new AppStateRepository(pool);

// ---------- app_state keys ----------
function freezeFlagKey(round: number) {
  return `round_${round}_frozen`;
}
function snapshotTxKey(round: number) {
  return `round_${round}_snapshot_tx`;
}

// ---------- ERC-404 high-bit helpers ----------
const ID_PREFIX = 1n << 255n;
const isEncoded = (n: bigint) => n >= ID_PREFIX;
const encodeIfNeeded = (n: bigint) => (isEncoded(n) ? n : n | ID_PREFIX);

export type SnapshotRow = {
  wallet_address: string;
  token_id: string; // decoded numeric string or already-high-bit id as string
};

export class FreezeCoordinator {
  private isPushing = false;

  /**
   * Perform final validation of all entries before freeze.
   * This ensures the database is clean and up-to-date before creating the snapshot.
   */
  async performFinalValidation(): Promise<void> {
    console.log("🔍 Starting final validation before freeze...");

    try {
      // Run validateEntries with finalSweep=true to process ALL tweets
      // This will use rate limiting to respect API budgets
      await validateEntries(true);

      console.log("✅ Final validation completed successfully");
    } catch (error: any) {
      console.error("❌ Final validation failed:", error?.message || error);
      throw new Error(`Final validation failed: ${error?.message || error}`);
    }
  }

  /**
   * Push a final, deduped snapshot to the given round.
   * - entries must already be deduped (wallet, token_id) & ordered deterministically.
   * - encodes ERC-404 high bit if not already set.
   * - writes app_state: snapshot tx + frozen=true
   */
  async pushSnapshot(
    roundNumber: number,
    entries: SnapshotRow[]
  ): Promise<string | null> {
    if (this.isPushing) {
      console.log("⏳ Snapshot push already in progress");
      return null;
    }
    if (!entries?.length) {
      console.log("🪶 Empty snapshot; nothing to push");
      // Caller should still mark frozen on its side for idempotency
      return null;
    }

    this.isPushing = true;
    try {
      // Build owner & token arrays
      const owners: string[] = new Array(entries.length);
      const tokenIds: bigint[] = new Array(entries.length);

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        owners[i] = e.wallet_address.toLowerCase();

        // token_id can be either a decoded human id ("123") or a full ERC-404 id with the high bit set.
        const raw = BigInt(e.token_id);
        tokenIds[i] = encodeIfNeeded(raw);
      }

      console.log(
        `➡️  Pushing snapshot: round=${roundNumber}, entries=${entries.length}`
      );

      const tx = await lottery.addEntriesWithOwners(
        roundNumber,
        tokenIds,
        owners
      );
      const receipt = await tx.wait(2);

      // Persist tx + frozen flag for idempotency across restarts
      await stateRepo.set(snapshotTxKey(roundNumber), receipt.hash);
      await stateRepo.set(freezeFlagKey(roundNumber), "true");

      console.log(
        `✅ Snapshot pushed for round ${roundNumber}, tx=${receipt.hash}`
      );
      return receipt.hash;
    } catch (err: any) {
      console.error(
        "❌ Snapshot push failed:",
        err?.shortMessage || err?.reason || err?.message || err
      );
      throw err;
    } finally {
      this.isPushing = false;
    }
  }

  /**
   * Complete freeze process: validate entries, create snapshot, and push to blockchain.
   * This is the main method to call when freezing a round.
   */
  async freezeRound(
    roundNumber: number,
    entries: SnapshotRow[]
  ): Promise<string | null> {
    console.log(`🧊 Starting freeze process for round ${roundNumber}...`);

    try {
      // Step 1: Final validation
      await this.performFinalValidation();

      // Step 2: Push snapshot
      const txHash = await this.pushSnapshot(roundNumber, entries);

      console.log(`🎉 Round ${roundNumber} frozen successfully!`);
      return txHash;
    } catch (error: any) {
      console.error(
        `💥 Freeze process failed for round ${roundNumber}:`,
        error?.message || error
      );
      throw error;
    }
  }
}

export const freezeCoordinator = new FreezeCoordinator();
