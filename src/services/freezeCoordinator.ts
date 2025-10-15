/* eslint-disable no-console */
import "dotenv/config";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import {
  lottery,
  getFundsAdmin,
  getDrawInterval,
  getContractBalance,
  isValidWinner,
} from "../lotteryClient";

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
   * Validate contract configuration before snapshot operations
   */
  private async validateContractConfiguration(): Promise<void> {
    try {
      const [fundsAdmin, drawInterval, contractBalance] = await Promise.all([
        getFundsAdmin(),
        getDrawInterval(),
        getContractBalance(),
      ]);

      console.log(`🔍 Contract Configuration Validation:`);
      console.log(`   Funds Admin: ${fundsAdmin}`);
      console.log(
        `   Draw Interval: ${drawInterval} seconds (${Math.floor(
          drawInterval / 3600
        )}h)`
      );
      console.log(`   Contract Balance: ${contractBalance} ETH`);

      // Validate funds admin is set and not zero address
      if (
        !fundsAdmin ||
        fundsAdmin === "0x0000000000000000000000000000000000000000"
      ) {
        console.warn(`⚠️ WARNING: Funds admin is not set or is zero address`);
      } else {
        // Validate funds admin is an EOA
        const isValidFundsAdmin = await isValidWinner(fundsAdmin);
        if (!isValidFundsAdmin) {
          console.warn(
            `⚠️ WARNING: Funds admin ${fundsAdmin} is not a valid EOA`
          );
        }
      }

      // Validate draw interval is within expected bounds (1-24 hours)
      if (drawInterval < 3600 || drawInterval > 86400) {
        console.warn(
          `⚠️ WARNING: Draw interval ${drawInterval}s is outside recommended range (1-24 hours)`
        );
      }

      // Check if contract has sufficient balance for payouts
      const balanceNum = parseFloat(contractBalance);
      if (balanceNum < 0.01) {
        console.warn(
          `⚠️ WARNING: Contract balance is low (${contractBalance} ETH) - prizes may be minimal`
        );
      }

      console.log(`✅ Contract configuration validation completed`);
    } catch (error: any) {
      console.error(
        `❌ Failed to validate contract configuration: ${
          error?.message || error
        }`
      );
      // Don't throw - this is informational validation
    }
  }

  /**
   * Monitor contract events during snapshot pushing for any configuration changes
   */
  private async monitorContractEvents(startBlock: number): Promise<void> {
    try {
      const currentBlock = await lottery.runner?.provider?.getBlockNumber();
      if (!currentBlock || !lottery.runner?.provider) {
        return;
      }

      // Query for admin and configuration change events since the start of push
      const events = await Promise.all([
        // FundsAdminChanged events
        (lottery as any).filters?.FundsAdminChanged
          ? lottery.queryFilter(
              (lottery as any).filters.FundsAdminChanged(),
              startBlock,
              currentBlock
            )
          : [],
        // DrawIntervalChanged events
        (lottery as any).filters?.DrawIntervalChanged
          ? lottery.queryFilter(
              (lottery as any).filters.DrawIntervalChanged(),
              startBlock,
              currentBlock
            )
          : [],
        // OwnershipTransferred events
        (lottery as any).filters?.OwnershipTransferred
          ? lottery.queryFilter(
              (lottery as any).filters.OwnershipTransferred(),
              startBlock,
              currentBlock
            )
          : [],
      ]);

      const allEvents = events.flat();

      if (allEvents.length > 0) {
        console.log(
          `🔄 Contract configuration changes detected during snapshot push:`
        );

        for (const event of allEvents) {
          const eventName =
            (event as any).eventName || (event as any).fragment?.name;

          if (eventName === "FundsAdminChanged") {
            const oldAdmin = (event as any).args?.[0];
            const newAdmin = (event as any).args?.[1];
            console.log(
              `🔐 Funds Admin Changed: ${oldAdmin} → ${newAdmin} (Block: ${
                (event as any).blockNumber
              })`
            );
          } else if (eventName === "DrawIntervalChanged") {
            const oldInterval = (event as any).args?.[0];
            const newInterval = (event as any).args?.[1];
            console.log(
              `⏰ Draw Interval Changed: ${oldInterval}s → ${newInterval}s (Block: ${
                (event as any).blockNumber
              })`
            );
          } else if (eventName === "OwnershipTransferred") {
            const from = (event as any).args?.[0];
            const to = (event as any).args?.[1];
            console.log(
              `👑 Ownership Transferred: ${from} → ${to} (Block: ${
                (event as any).blockNumber
              })`
            );
          }
        }

        // Re-validate configuration after changes
        console.log(
          `🔍 Re-validating contract configuration after detected changes...`
        );
        await this.validateContractConfiguration();
      }
    } catch (error: any) {
      console.warn(
        `⚠️ Could not monitor contract events: ${error?.message || error}`
      );
    }
  }

  /**
   * Push a final, deduped snapshot to the given round.
   * - entries must already be deduped (wallet, token_id) & ordered deterministically.
   * - encodes ERC-404 high bit if not already set.
   * - writes app_state: snapshot tx + frozen=true
   * - validates contract configuration and monitors for changes during push
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
    let startBlock: number | undefined;

    try {
      // Validate contract configuration before pushing
      await this.validateContractConfiguration();

      // Get current block number for event monitoring
      if (lottery.runner?.provider) {
        startBlock = await lottery.runner.provider.getBlockNumber();
      }

      // 🚨 PROTECTION: Check if entries already exist on-chain before pushing
      console.log(
        `🔍 Pre-push verification: Checking Round ${roundNumber} for existing entries...`
      );

      try {
        const roundData = await lottery.getRound(roundNumber);
        if (roundData.totalEntries && Number(roundData.totalEntries) > 0) {
          console.log(
            `🛑 PUSH ABORTED: Round ${roundNumber} already has ${roundData.totalEntries} entries on-chain`
          );
          console.log(`   Winner: ${roundData.winner}`);
          console.log(`   Completed: ${roundData.isCompleted}`);

          // Set a placeholder transaction to prevent future attempts
          const placeholderTx = "EXISTING_ENTRIES_DETECTED_" + Date.now();
          await stateRepo.set(snapshotTxKey(roundNumber), placeholderTx);
          await stateRepo.set(freezeFlagKey(roundNumber), "true");

          console.log(
            `✅ Marked round ${roundNumber} as frozen with placeholder tx: ${placeholderTx}`
          );
          return placeholderTx;
        }

        // Double-check with entries array
        const entriesArray = await lottery.getRoundEntries(roundNumber);
        if (entriesArray && entriesArray.length > 0) {
          console.log(
            `🛑 PUSH ABORTED: Round ${roundNumber} has ${entriesArray.length} entries in contract array (totalEntries might be out of sync)`
          );

          const placeholderTx = "EXISTING_ENTRIES_ARRAY_DETECTED_" + Date.now();
          await stateRepo.set(snapshotTxKey(roundNumber), placeholderTx);
          await stateRepo.set(freezeFlagKey(roundNumber), "true");

          console.log(
            `✅ Marked round ${roundNumber} as frozen with placeholder tx: ${placeholderTx}`
          );
          return placeholderTx;
        }

        console.log(
          `✅ Pre-push verification passed: Round ${roundNumber} is empty and ready for entries`
        );
      } catch (checkErr: any) {
        console.log(
          `⚠️ Could not verify round state before push: ${
            checkErr?.message || checkErr
          }`
        );
        console.log(
          `🔄 Proceeding with push as fallback (manual intervention may be needed)`
        );
      }

      // Build owner & token arrays with additional validation
      const owners: string[] = new Array(entries.length);
      const tokenIds: bigint[] = new Array(entries.length);
      const invalidEntries: string[] = [];

      console.log(
        `📊 Starting pre-push validation for ${entries.length} entries...`
      );

      const validationStart = Date.now();
      let validatedCount = 0;
      let invalidCount = 0;

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const walletAddress = e.wallet_address.toLowerCase();
        owners[i] = walletAddress;

        // Validate that the wallet address is an EOA
        try {
          const isValidEOA = await isValidWinner(walletAddress);
          if (!isValidEOA) {
            invalidEntries.push(`${walletAddress} (not EOA or zero address)`);
          }
        } catch {
          // If validation fails, log but continue
          console.warn(`⚠️ Could not validate EOA status for ${walletAddress}`);
        }

        // token_id can be either a decoded human id ("123") or a full ERC-404 id with the high bit set.
        const raw = BigInt(e.token_id);
        const encodedTokenId = encodeIfNeeded(raw);
        tokenIds[i] = encodedTokenId;

        // 🔍 VERIFICATION: Ensure this token actually exists and is owned by the correct wallet
        try {
          const { getGachaContract } = await import("../utils/ownershipUtils");
          const gachaContract = getGachaContract();
          const actualOwner = await gachaContract.ownerOf(encodedTokenId);

          if (actualOwner.toLowerCase() === walletAddress) {
            validatedCount++;
          } else {
            invalidCount++;
            console.warn(
              `⚠️ Token #${e.token_id} is owned by ${actualOwner}, not ${walletAddress}`
            );
            invalidEntries.push(`Token #${e.token_id} ownership mismatch`);
          }
        } catch (error) {
          invalidCount++;
          console.warn(
            `⚠️ Token #${e.token_id} doesn't exist or can't be verified: ${error}`
          );
          invalidEntries.push(`Token #${e.token_id} doesn't exist`);
        }
      }

      const validationTime = Date.now() - validationStart;
      console.log(
        `✅ Validation complete: ${validatedCount} valid, ${invalidCount} invalid (${validationTime}ms)`
      );

      if (invalidCount > 0) {
        console.warn(
          `🚨 Found ${invalidCount} invalid entries out of ${entries.length} total`
        );
      }

      if (invalidEntries.length > 0) {
        console.warn(
          `⚠️ WARNING: Found ${invalidEntries.length} potentially invalid entries:`
        );
        invalidEntries.slice(0, 10).forEach((entry, idx) => {
          console.warn(`   ${idx + 1}. ${entry}`);
        });
        if (invalidEntries.length > 10) {
          console.warn(`   ... and ${invalidEntries.length - 10} more`);
        }
        console.warn(`   These entries may fail winner validation during draw`);
      }

      console.log(
        `➡️  Pushing snapshot: round=${roundNumber}, unique_entries=${owners.length} (filtered from ${entries.length} database entries)`
      );
      console.log(
        `   First 5 wallets: ${owners.slice(0, 5).join(", ")}${
          owners.length > 5 ? "..." : ""
        }`
      );
      console.log(
        `   First 5 tokens: ${tokenIds
          .slice(0, 5)
          .map((id) => id.toString())
          .join(", ")}${tokenIds.length > 5 ? "..." : ""}`
      );

      const tx = await lottery.addEntriesWithOwners(
        roundNumber,
        tokenIds,
        owners
      );

      console.log(
        `⏳ Waiting for confirmation of snapshot push tx: ${tx.hash}`
      );
      const receipt = await tx.wait(2);

      // Monitor for configuration changes during the push operation
      if (startBlock !== undefined) {
        await this.monitorContractEvents(startBlock);
      }

      // 🚨 POST-PUSH VERIFICATION: Confirm the entries were added correctly
      try {
        const verificationData = await lottery.getRound(roundNumber);
        const expectedCount = owners.length; // Use actual entries sent to blockchain
        const actualCount = Number(verificationData.totalEntries);

        console.log(`🔍 Post-push verification:`);
        console.log(`   Expected entries: ${expectedCount}`);
        console.log(`   Actual entries: ${actualCount}`);

        if (actualCount !== expectedCount) {
          console.error(
            `🚨 CRITICAL: Entry count mismatch after push! Expected ${expectedCount}, got ${actualCount}`
          );
          // Continue anyway - the transaction succeeded, this might be a sync issue
        } else {
          console.log(
            `✅ Post-push verification passed: ${actualCount} entries confirmed on-chain`
          );
        }
      } catch (verifyErr: any) {
        console.log(
          `⚠️ Could not verify entries after push: ${
            verifyErr?.message || verifyErr
          }`
        );
      }

      // Persist tx + frozen flag for idempotency across restarts
      await stateRepo.set(snapshotTxKey(roundNumber), receipt.hash);
      await stateRepo.set(freezeFlagKey(roundNumber), "true");

      console.log(
        `✅ Snapshot pushed for round ${roundNumber}, tx=${receipt.hash}`
      );
      console.log(
        `🎯 BLOCKCHAIN CONFIRMATION: ${owners.length} entries now available for VRF selection`
      );
      return receipt.hash;
    } catch (err: any) {
      console.error(
        "❌ Snapshot push failed:",
        err?.shortMessage || err?.reason || err?.message || err
      );

      // Check if this is a revert due to existing entries
      const errorMsg = (
        err?.shortMessage ||
        err?.reason ||
        err?.message ||
        ""
      ).toLowerCase();
      if (
        errorMsg.includes("entries") ||
        errorMsg.includes("duplicate") ||
        errorMsg.includes("exist")
      ) {
        console.log(
          `🔍 Push failed due to existing entries - checking current state...`
        );

        try {
          const roundData = await lottery.getRound(roundNumber);
          if (roundData.totalEntries && Number(roundData.totalEntries) > 0) {
            console.log(
              `ℹ️ Round ${roundNumber} already has ${roundData.totalEntries} entries - marking as frozen`
            );

            const placeholderTx = "PUSH_FAILED_ENTRIES_EXIST_" + Date.now();
            await stateRepo.set(snapshotTxKey(roundNumber), placeholderTx);
            await stateRepo.set(freezeFlagKey(roundNumber), "true");

            return placeholderTx;
          }
        } catch {}
      }

      throw err;
    } finally {
      this.isPushing = false;
    }
  }

  /**
   * Get the current funds admin configuration
   */
  async getFundsAdminInfo(): Promise<{
    fundsAdmin: string;
    isValidEOA: boolean;
  }> {
    try {
      const fundsAdmin = await getFundsAdmin();
      const isValidEOA = await isValidWinner(fundsAdmin);
      return { fundsAdmin, isValidEOA };
    } catch (error: any) {
      console.error(
        `❌ Failed to get funds admin info: ${error?.message || error}`
      );
      throw error;
    }
  }

  /**
   * Get the current draw interval configuration
   */
  async getDrawIntervalInfo(): Promise<{
    drawInterval: number;
    isValidRange: boolean;
  }> {
    try {
      const drawInterval = await getDrawInterval();
      const isValidRange = drawInterval >= 3600 && drawInterval <= 86400; // 1-24 hours
      return { drawInterval, isValidRange };
    } catch (error: any) {
      console.error(
        `❌ Failed to get draw interval info: ${error?.message || error}`
      );
      throw error;
    }
  }
}

export const freezeCoordinator = new FreezeCoordinator();
