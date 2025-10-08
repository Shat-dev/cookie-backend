/* eslint-disable no-console */
import "dotenv/config";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import { lottery, getRound } from "../lotteryClient";
import { entryRepository } from "../db/entryRepository";
import { pollMentions } from "./twitterPoller";
import { validateEntries } from "./validateEntries";
// ❌ remove: import { roundCoordinator } from "./roundCoordinator";
import { freezeCoordinator, type SnapshotRow } from "./freezeCoordinator";

const stateRepo = new AppStateRepository(pool);

// Freeze timing
const FREEZE_SEC = Number(process.env.FREEZE_SEC || 180); // 3 minutes
const SAFETY_SEC = Number(process.env.FREEZE_SAFETY_SEC || 15); // guard to avoid pushing too close to end

function freezeFlagKey(round: number) {
  return `round_${round}_frozen`;
}
function snapshotTxKey(round: number) {
  return `round_${round}_snapshot_tx`;
}

async function isFrozen(round: number): Promise<boolean> {
  return (await stateRepo.get(freezeFlagKey(round))) === "true";
}
async function markFrozen(round: number): Promise<void> {
  await stateRepo.set(freezeFlagKey(round), "true");
}
async function setSnapshotTx(round: number, tx: string): Promise<void> {
  await stateRepo.set(snapshotTxKey(round), tx);
}
async function getSnapshotTx(round: number): Promise<string | null> {
  return (await stateRepo.get(snapshotTxKey(round))) || null;
}

export class AutomatedLotteryService {
  private isRunning = false;
  private isTicking = false;
  private timer: NodeJS.Timeout | null = null;
  private checkInterval = Number(process.env.AUTOMATION_CHECK_MS) || 10_000; // 10s default
  private lastRemainingMinutes: number | null = null;

  start() {
    if (this.isRunning) {
      console.log("🤖 Automated lottery service already running");
      return;
    }
    this.isRunning = true;
    console.log(
      `🚀 Starting automated lottery orchestrator (interval=${this.checkInterval}ms, FREEZE_SEC=${FREEZE_SEC})`
    );

    // Startup probe: if the last round already ended and has no snapshot, flag recovery
    void (async () => {
      try {
        const currentRoundBN = await lottery.s_currentRound();
        if (currentRoundBN > 0n) {
          const currentRound = Number(currentRoundBN);
          const rd = await getRound(currentRound);
          const now = Math.floor(Date.now() / 1000);
          const end = Number(rd.end);
          if (now >= end && rd.isActive) {
            const snap = await getSnapshotTx(currentRound);
            if (!snap) {
              console.log(
                `🧹 Startup: round ${currentRound} ended without snapshot. Recovery will attempt on first tick.`
              );
            }
          }
        }
      } catch (e: any) {
        console.warn(
          "⚠️ Startup probe skipped:",
          e?.shortMessage || e?.message || String(e)
        );
      }
    })();

    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.checkInterval);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastRemainingMinutes = null;
    console.log("⏹️ Stopped automated lottery orchestrator");
  }

  private async tick() {
    if (!this.isRunning || this.isTicking) return;
    this.isTicking = true;

    try {
      const currentRoundBN = await lottery.s_currentRound();
      if (currentRoundBN === 0n) {
        console.log("⏸ No round yet — waiting for first valid entry.");
        return;
      }
      const currentRound = Number(currentRoundBN);

      const rd = await getRound(currentRound);
      const now = Math.floor(Date.now() / 1000);
      const end = Number(rd.end);
      const start = Number(rd.start);

      if (!rd.isActive && !rd.isCompleted) {
        console.log(`⚪ Round ${currentRound} exists but is not active yet.`);
        return;
      }

      // ⏳ Active window
      if (rd.isActive && now < end) {
        const remaining = end - now;
        const mins = Math.floor(remaining / 60);
        if (this.lastRemainingMinutes !== mins) {
          console.log(
            `⏳ Round ${currentRound} active — ${mins}m ${
              remaining % 60
            }s left (window ${start}→${end})`
          );
          this.lastRemainingMinutes = mins;
        }
      } else {
        this.lastRemainingMinutes = null;
      }

      // 🧊 Freeze step before VRF
      if (rd.isActive && now >= end - FREEZE_SEC && now + SAFETY_SEC < end) {
        const alreadyFrozen = await isFrozen(currentRound);
        if (!alreadyFrozen) {
          console.log(
            `🧊 Entering freeze for round ${currentRound} (final 3 min window before VRF)`
          );
          await this.performFreeze(currentRound);
          console.log(
            `📡 Freeze complete for round ${currentRound}. Awaiting VRF…`
          );
        }
        return;
      }

      // 🎯 End of round — only proceed if snapshot exists, else attempt recovery
      if (now >= end && rd.isActive) {
        // Optional entriesCount gate if your getRound() returns it
        const hasEntriesField =
          (rd as any)?.entriesCount !== undefined &&
          (rd as any)?.entriesCount !== null;
        const entriesCount = hasEntriesField
          ? Number((rd as any).entriesCount)
          : null;

        let snapTx = await getSnapshotTx(currentRound);
        if (!snapTx) {
          await this.recoverSnapshotAfterEnd(currentRound);
          snapTx = await getSnapshotTx(currentRound);
        }

        if (!snapTx) {
          if (entriesCount !== null && entriesCount === 0) {
            console.log(
              `🪶 Round ${currentRound} ended with zero entries. No snapshot. Automation will not run.`
            );
          } else {
            console.log(
              `🪶 Round ${currentRound} ended without snapshot on-chain. Automation cannot run. Waiting or creating next round if pool persists.`
            );
          }
          return;
        }

        if (entriesCount !== null && entriesCount === 0) {
          console.log(
            `🪶 Round ${currentRound} snapshot present but entriesCount=0. Nothing for VRF.`
          );
          return;
        }

        console.log(
          `🎲 Round ${currentRound} ended — snapshot present — Chainlink Automation should now perform VRF.`
        );
        return; // wait for performUpkeep() + fulfillRandomWords()
      }

      // ✅ Completed round — show VRF result and consider next round
      if (rd.isCompleted) {
        console.log(`🏆 Round ${currentRound} is completed! VRF fulfilled.`);
        try {
          // Primary: read from Round struct
          const r: any = await (lottery as any)["getRound(uint256)"](
            currentRound
          );
          let winner: string | undefined = r.winner ?? r[4];
          let tokenId: bigint | undefined = (r.winningTokenId ??
            r[5]) as bigint;

          // Fallback: event
          if (
            (!winner || tokenId === undefined) &&
            (lottery as any).filters?.RoundCompleted
          ) {
            const evs = await lottery.queryFilter(
              (lottery as any).filters.RoundCompleted(currentRound),
              -5000
            );
            const last: any = evs.at(-1);
            const ew = last?.args?.winner ?? last?.args?.[1];
            const et = (last?.args?.winningTokenId ?? last?.args?.[2]) as
              | bigint
              | undefined;
            if (ew) winner = ew;
            if (et !== undefined) tokenId = et;
          }

          // Console-friendly token number
          const ZERO = "0x0000000000000000000000000000000000000000";
          const SUPPLY = BigInt(process.env.NFT_SUPPLY || 10000);
          let displayId = tokenId;
          if (
            displayId !== undefined &&
            (displayId > SUPPLY || displayId <= 0n)
          ) {
            displayId = (displayId % SUPPLY) + 1n;
          }

          if (winner && winner !== ZERO && displayId !== undefined) {
            console.log(`🥇 Winner: ${winner}, Token #${displayId.toString()}`);
          } else {
            console.log("ℹ️ Winner info not exposed by this ABI.");
          }
        } catch (err: any) {
          console.warn(
            "⚠️ Could not fetch winner from contract:",
            err?.message || err
          );
        }

        await validateEntries(false);
        const remainingPool = await entryRepository.getAllEntries();
        if (remainingPool.length > 0) {
          console.log(
            `🔄 Pool still has ${remainingPool.length} entry rows; creating next 3h round (pool-based)`
          );
          try {
            const nowTs = Math.floor(Date.now() / 1000);
            const startTs = nowTs - 5;
            const endTs = startTs + 10800; // 3 hours = 3600 * 3 = 10800 seconds
            const tx = await lottery.createRound(startTs, endTs);
            const receipt = await tx.wait(2);
            console.log(
              `✅ Next round created (3h). tx=${receipt.hash}, window ${startTs}→${endTs}`
            );
          } catch (e: any) {
            console.error("❌ Failed to create next round:", e?.message || e);
          }
        }
        return;
      }
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || String(e);
      console.error("❌ Orchestrator tick failed:", msg);
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Freeze step:
   *  1) pollMentions()
   *  2) validateEntries(true)
   *  3) deterministic snapshot
   *  4) push once via freezeCoordinator.pushSnapshot(...)
   */
  private async performFreeze(roundNumber: number) {
    const rd = await getRound(roundNumber);
    const now = Math.floor(Date.now() / 1000);
    const end = Number(rd.end);
    if (!(now + SAFETY_SEC < end)) {
      console.warn(
        `⚠️ Skip freeze: too close to end (now=${now}, end=${end}, SAFETY_SEC=${SAFETY_SEC})`
      );
      await markFrozen(roundNumber);
      return;
    }

    console.log("🛰️ Final pollMentions() before snapshot…");
    await pollMentions();

    console.log("🔍 Final validateEntries(true) before snapshot…");
    await validateEntries(true);

    const rows = await entryRepository.getAllEntries();
    if (rows.length === 0) {
      console.log(
        `🪶 Empty snapshot for round ${roundNumber} — skipping on-chain push`
      );
      await markFrozen(roundNumber);
      return;
    }

    rows.sort((a, b) => {
      const wa = a.wallet_address.toLowerCase();
      const wb = b.wallet_address.toLowerCase();
      if (wa < wb) return -1;
      if (wa > wb) return 1;
      try {
        const ta = BigInt(a.token_id);
        const tb = BigInt(b.token_id);
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return 0;
      } catch {
        if (a.token_id < b.token_id) return -1;
        if (a.token_id > b.token_id) return 1;
        return 0;
      }
    });

    const dedup = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const key = `${r.wallet_address.toLowerCase()}-${r.token_id}`;
      if (!dedup.has(key)) dedup.set(key, r);
    }
    const snapshot = Array.from(dedup.values());

    console.log(
      `📦 Snapshot for round ${roundNumber}: ${snapshot.length} unique pairs`
    );

    try {
      const payload: SnapshotRow[] = snapshot.map((r) => ({
        wallet_address: r.wallet_address.toLowerCase(),
        token_id: r.token_id,
      }));
      const txHash = await freezeCoordinator.pushSnapshot(roundNumber, payload);
      if (txHash) {
        await setSnapshotTx(roundNumber, txHash);
        console.log(`✅ Snapshot pushed: ${txHash}`);
      } else {
        console.log("ℹ️ No tx emitted (empty input?).");
      }
      await markFrozen(roundNumber);
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      console.error("❌ Freeze push failed:", msg);
      // don’t mark frozen on failure; we may retry if still within window
    }
  }

  /**
   * Recovery path when server was down during freeze window.
   * Attempt to build and push a snapshot after end, once.
   */
  private async recoverSnapshotAfterEnd(roundNumber: number) {
    const existing = await getSnapshotTx(roundNumber);
    if (existing) return;

    console.log(
      `🧯 Recovery: round ${roundNumber} ended with no snapshot. Building and pushing now…`
    );

    try {
      try {
        await pollMentions();
      } catch {}
      try {
        await validateEntries(true);
      } catch {}

      const rows = await entryRepository.getAllEntries();
      if (rows.length === 0) {
        console.log(
          `🪶 Recovery found empty pool for round ${roundNumber}. Cannot proceed.`
        );
        return;
      }

      rows.sort((a, b) => {
        const wa = a.wallet_address.toLowerCase();
        const wb = b.wallet_address.toLowerCase();
        if (wa < wb) return -1;
        if (wa > wb) return 1;
        try {
          const ta = BigInt(a.token_id);
          const tb = BigInt(b.token_id);
          if (ta < tb) return -1;
          if (ta > tb) return 1;
          return 0;
        } catch {
          if (a.token_id < b.token_id) return -1;
          if (a.token_id > b.token_id) return 1;
          return 0;
        }
      });

      const seen = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = `${r.wallet_address.toLowerCase()}-${r.token_id}`;
        if (!seen.has(key)) seen.set(key, r);
      }
      const payload: SnapshotRow[] = Array.from(seen.values()).map((r) => ({
        wallet_address: r.wallet_address.toLowerCase(),
        token_id: r.token_id,
      }));

      console.log(
        `📦 Recovery snapshot for round ${roundNumber}: ${payload.length} unique pairs`
      );

      const txHash = await freezeCoordinator.pushSnapshot(roundNumber, payload);
      if (txHash) {
        await setSnapshotTx(roundNumber, txHash);
        console.log(`✅ Recovery snapshot pushed: ${txHash}`);
      } else {
        console.log("ℹ️ Recovery: coordinator returned no tx.");
      }

      await markFrozen(roundNumber); // avoid repeated attempts
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || String(err);
      console.error(`❌ Recovery snapshot failed: ${msg}`);
    }
  }
}

export const automatedLotteryService = new AutomatedLotteryService();
