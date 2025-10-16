/* eslint-disable no-console */
import "dotenv/config";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import {
  lottery,
  getFundsAdmin,
  getContractBalance,
  isValidWinner,
} from "../lotteryClient";
import { Contract } from "ethers";

const stateRepo = new AppStateRepository(pool);

// ---------- config ----------
const SNAPSHOT_MAX_BATCH = Number(process.env.SNAPSHOT_MAX_BATCH || 1000);

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

// ---------- utils ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SnapshotRow = {
  wallet_address: string; // 0x-prefixed EOA
  token_id: string; // decimal numeric string
};

export class FreezeCoordinator {
  private isPushing = false;

  /** Validate contract configuration before snapshot operations */
  private async validateContractConfiguration(): Promise<void> {
    try {
      const [fundsAdmin, contractBalance] = await Promise.all([
        getFundsAdmin(),
        getContractBalance(),
      ]);

      console.log(`🔍 Contract Configuration Validation:`);
      console.log(`   Funds Admin: ${fundsAdmin}`);
      console.log(`   Contract Balance: ${contractBalance} ETH`);

      if (
        !fundsAdmin ||
        fundsAdmin === "0x0000000000000000000000000000000000000000"
      ) {
        console.warn(`⚠️ WARNING: Funds admin is not set or zero address`);
      } else {
        const isValidFundsAdmin = await isValidWinner(fundsAdmin);
        if (!isValidFundsAdmin) {
          console.warn(
            `⚠️ WARNING: Funds admin ${fundsAdmin} is not a valid EOA`
          );
        }
      }

      const balanceNum = parseFloat(contractBalance);
      if (!Number.isFinite(balanceNum) || balanceNum < 0.01) {
        console.warn(
          `⚠️ WARNING: Low contract balance (${contractBalance} ETH)`
        );
      }

      console.log(`✅ Contract configuration validation completed`);
    } catch (error: any) {
      console.error(
        `❌ Failed to validate contract configuration: ${
          error?.message || error
        }`
      );
    }
  }

  /** Monitor contract events for admin or ownership changes */
  private async monitorContractEvents(startBlock: number): Promise<void> {
    try {
      const currentBlock = await lottery.runner?.provider?.getBlockNumber();
      if (!currentBlock || !lottery.runner?.provider) return;

      const events = await Promise.all([
        (lottery as any).filters?.FundsAdminChanged
          ? lottery.queryFilter(
              (lottery as any).filters.FundsAdminChanged(),
              startBlock,
              currentBlock
            )
          : [],
        (lottery as any).filters?.OwnershipTransferred
          ? lottery.queryFilter(
              (lottery as any).filters.OwnershipTransferred(),
              startBlock,
              currentBlock
            )
          : [],
      ]);

      const allEvents = events.flat();
      if (allEvents.length === 0) return;

      console.log(`🔄 Contract configuration changes detected:`);
      for (const event of allEvents) {
        const name = (event as any).eventName || (event as any).fragment?.name;
        if (name === "FundsAdminChanged") {
          const [oldAdmin, newAdmin] = (event as any).args || [];
          console.log(
            `🔐 Funds Admin Changed: ${oldAdmin} → ${newAdmin} (Block ${event.blockNumber})`
          );
        } else if (name === "OwnershipTransferred") {
          const [from, to] = (event as any).args || [];
          console.log(
            `👑 Ownership Transferred: ${from} → ${to} (Block ${event.blockNumber})`
          );
        }
      }

      await this.validateContractConfiguration();
    } catch (error: any) {
      console.warn(
        `⚠️ Could not monitor contract events: ${error?.message || error}`
      );
    }
  }

  /** Push a final, deduped snapshot to the given round. */
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
      return null;
    }
    if (entries.length > SNAPSHOT_MAX_BATCH) {
      throw new Error(
        `Too many entries (${entries.length}). Max per push is ${SNAPSHOT_MAX_BATCH}. Split into batches.`
      );
    }
    if (!lottery.runner?.provider) {
      throw new Error("No provider available — aborting snapshot push");
    }

    this.isPushing = true;
    let startBlock: number | undefined;

    try {
      await this.validateContractConfiguration();
      startBlock = await lottery.runner.provider.getBlockNumber();

      console.log(`🔍 Checking Round ${roundNumber} for existing entries...`);
      try {
        const rd = await lottery.getRound(roundNumber);
        if (rd.totalEntries && Number(rd.totalEntries) > 0) {
          console.log(
            `🛑 Round ${roundNumber} already has ${rd.totalEntries} entries`
          );
          const placeholderTx = "EXISTING_ENTRIES_" + Date.now();
          await Promise.all([
            stateRepo.set(snapshotTxKey(roundNumber), placeholderTx),
            stateRepo.set(freezeFlagKey(roundNumber), "true"),
          ]);
          return placeholderTx;
        }
      } catch {
        console.log(`⚠️ Could not verify round state; continuing anyway`);
      }

      let cookieContract: Contract | null = null;
      try {
        const { getCookieContract } = await import("../utils/ownershipUtils");
        cookieContract = getCookieContract();
      } catch {
        console.warn("⚠️ Could not initialize cookie contract...");
      }

      const owners: string[] = [];
      const tokenIds: bigint[] = [];
      let invalidCount = 0;

      for (const e of entries) {
        // Basic input validation
        if (!/^0x[a-fA-F0-9]{40}$/.test(e.wallet_address)) {
          console.warn(
            `⚠️ Skipping invalid wallet address: ${e.wallet_address}`
          );
          invalidCount++;
          continue;
        }
        if (!/^\d+$/.test(e.token_id)) {
          console.warn(`⚠️ Skipping invalid token id: ${e.token_id}`);
          invalidCount++;
          continue;
        }

        const wallet = e.wallet_address.toLowerCase();
        const encoded = encodeIfNeeded(BigInt(e.token_id));

        // Optional ownership verification
        if (cookieContract) {
          try {
            const actualOwner = (
              await cookieContract.ownerOf(encoded)
            ).toLowerCase();
            if (actualOwner !== wallet) {
              console.warn(
                `⚠️ Token #${e.token_id} owner mismatch: chain=${actualOwner} provided=${wallet}`
              );
            }
          } catch (ownErr) {
            console.warn(
              `⚠️ Could not verify ownerOf(${encoded.toString()}): ${ownErr}`
            );
          }
        }

        owners.push(wallet);
        tokenIds.push(encoded);
      }

      if (owners.length === 0) {
        console.warn("⚠️ No valid entries after validation. Abort.");
        return null;
      }
      if (invalidCount > 0) {
        console.warn(`⚠️ ${invalidCount} invalid entries skipped`);
      }

      console.log(`➡️ Pushing snapshot: ${owners.length} entries`);
      const tx = await lottery.addEntriesWithOwners(
        roundNumber,
        tokenIds,
        owners
      );
      console.log(`⏳ Awaiting tx confirmation: ${tx.hash}`);
      const receipt = await tx.wait(2);

      if (startBlock !== undefined)
        await this.monitorContractEvents(startBlock);

      // Post-tx verification: poll a few times for count to reflect
      const expectedCount = owners.length;
      let ok = false;
      for (let i = 0; i < 5; i++) {
        try {
          const rd = await lottery.getRound(roundNumber);
          const actual = Number(rd.totalEntries || 0);
          if (actual === expectedCount) {
            ok = true;
            break;
          }
        } catch {}
        await sleep(1500);
      }
      if (!ok) {
        console.error(
          "🚨 Post-push verification did not observe expected entry count. Proceeding anyway."
        );
      }

      // Atomic-ish state writes
      try {
        await Promise.all([
          stateRepo.set(snapshotTxKey(roundNumber), receipt.hash),
          stateRepo.set(freezeFlagKey(roundNumber), "true"),
        ]);
      } catch (dbErr) {
        console.error("⚠️ Failed to persist snapshot state:", dbErr);
      }

      console.log(
        `✅ Snapshot pushed (round ${roundNumber}) tx=${receipt.hash}`
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

  /** Get funds admin info */
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
}

export const freezeCoordinator = new FreezeCoordinator();
