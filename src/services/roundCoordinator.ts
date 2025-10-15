/* eslint-disable no-console */
import "dotenv/config";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import { lottery, getRound } from "../lotteryClient";
import { freezeCoordinator, type SnapshotRow } from "./freezeCoordinator";

const stateRepo = new AppStateRepository(pool);

// --------- config ---------
const FREEZE_SEC = Number(process.env.FREEZE_SEC || 180); // default 3m (keep at 3 minutes)

// --------- app_state keys ----------
const FIRST_ROUND_KEY = "first_round_created";
function freezeFlagKey(round: number) {
  return `round_${round}_frozen`;
}

async function isFrozen(round: number): Promise<boolean> {
  return (await stateRepo.get(freezeFlagKey(round))) === "true";
}

export class RoundCoordinator {
  private creatingRound = false;

  /**
   * Create a round with 10-minute duration for testing:
   *  - All rounds: 10 minutes
   *
   * Notes:
   *  - Call this when you detect the first valid X post for a new cycle.
   *  - If a valid active round exists, it returns null.
   */
  async createRoundIfNeeded(): Promise<number | null> {
    // If an active round already exists, do nothing.
    const currentRoundBN = await lottery.s_currentRound();
    if (currentRoundBN > 0n) {
      try {
        const rd = await getRound(Number(currentRoundBN));
        const now = Math.floor(Date.now() / 1000);
        if (
          rd.isActive &&
          BigInt(rd.start) <= BigInt(now) &&
          BigInt(rd.end) > BigInt(now) &&
          !rd.isCompleted
        ) {
          console.log(`ℹ️ Round ${currentRoundBN} already active`);
          return null;
        }
      } catch (e) {
        console.warn(
          "⚠️ Could not read current round; proceeding to create a new one:",
          e
        );
      }
    }

    if (this.creatingRound) {
      console.log("⏳ Round creation already in progress");
      return null;
    }

    this.creatingRound = true;
    try {
      // lock to avoid multiple creators
      const { rows } = await pool.query("SELECT pg_try_advisory_lock($1)", [
        12345,
      ]);
      if (!rows?.[0]?.pg_try_advisory_lock) {
        console.log("🔒 Another process is creating a round; skipping");
        return null;
      }

      try {
        // Re-check after acquiring the lock
        const currentAfter = await lottery.s_currentRound();
        if (currentAfter > 0n) {
          const rd = await getRound(Number(currentAfter));
          const now = Math.floor(Date.now() / 1000);
          if (
            rd.isActive &&
            BigInt(rd.start) <= BigInt(now) &&
            BigInt(rd.end) > BigInt(now) &&
            !rd.isCompleted
          ) {
            console.log(
              `ℹ️ Round ${currentAfter} became active while waiting for lock`
            );
            return null;
          }
        }

        const isFirstRound = (await stateRepo.get(FIRST_ROUND_KEY)) === null;
        const durationMinutes = 180; // minutes of each round
        const durationSeconds = durationMinutes * 60;

        const now = Math.floor(Date.now() / 1000);
        const startTs = now - 5; // already open
        const endTs = startTs + durationSeconds; // 10 minutes

        console.log(
          `🛠️ Creating ${
            isFirstRound ? "first" : "new"
          } round: ${durationMinutes}m window (${startTs}→${endTs})`
        );
        const tx = await lottery.createRound(startTs, endTs);
        const receipt = await tx.wait(2);

        // Try to extract the created round id from logs; fall back to s_currentRound
        let createdRound: number | undefined;
        try {
          for (const log of receipt.logs) {
            try {
              const parsed = lottery.interface.parseLog(log);
              if (parsed?.name === "RoundCreated") {
                createdRound = Number(parsed.args.round);
                break;
              }
            } catch {}
          }
        } catch {}

        if (!createdRound) {
          const curr = await lottery.s_currentRound();
          if (curr > 0n) createdRound = Number(curr);
        }

        if (!createdRound || createdRound === 0) {
          throw new Error("Could not determine created round id");
        }

        if (isFirstRound) {
          await stateRepo.set(FIRST_ROUND_KEY, "true");
        }

        console.log(`✅ Created round ${createdRound}`);
        return createdRound;
      } finally {
        await pool.query("SELECT pg_advisory_unlock($1)", [12345]);
      }
    } finally {
      this.creatingRound = false;
    }
  }

  /** Compute the start of the freeze window (read-only). */
  async getFreezeTime(round: number): Promise<number> {
    const rd = await getRound(round);
    return Number(rd.end) - FREEZE_SEC;
  }

  /**
   * Check if we *should* freeze (read-only helper).
   * This does not mutate chain state or DB.
   */
  async freezeIfNeeded(round: number): Promise<{
    shouldFreeze: boolean;
    reason?: string;
    now: number;
    start: number;
    end: number;
    freezeAt: number;
    alreadyFrozen: boolean;
  }> {
    const rd = await getRound(round);
    const now = Math.floor(Date.now() / 1000);
    const start = Number(rd.start);
    const end = Number(rd.end);
    const freezeAt = end - FREEZE_SEC;
    const alreadyFrozen = await isFrozen(round);

    if (!rd.isActive) {
      return {
        shouldFreeze: false,
        reason: "not-active",
        now,
        start,
        end,
        freezeAt,
        alreadyFrozen,
      };
    }
    if (rd.isCompleted) {
      return {
        shouldFreeze: false,
        reason: "completed",
        now,
        start,
        end,
        freezeAt,
        alreadyFrozen,
      };
    }
    if (alreadyFrozen) {
      return {
        shouldFreeze: false,
        reason: "already-frozen",
        now,
        start,
        end,
        freezeAt,
        alreadyFrozen,
      };
    }
    if (now < freezeAt) {
      return {
        shouldFreeze: false,
        reason: "before-freeze",
        now,
        start,
        end,
        freezeAt,
        alreadyFrozen,
      };
    }
    if (now >= end) {
      return {
        shouldFreeze: false,
        reason: "after-end",
        now,
        start,
        end,
        freezeAt,
        alreadyFrozen,
      };
    }

    // In the freeze window
    return { shouldFreeze: true, now, start, end, freezeAt, alreadyFrozen };
  }

  /**
   * Push the final snapshot via the freeze coordinator.
   * - `entries` must be deduped and in your desired order (you’ll move DB-side ordering later).
   * - State flags are written inside freezeCoordinator.
   */
  async pushSnapshot(
    round: number,
    entries: SnapshotRow[]
  ): Promise<string | null> {
    return freezeCoordinator.pushSnapshot(round, entries);
  }
}

export const roundCoordinator = new RoundCoordinator();
