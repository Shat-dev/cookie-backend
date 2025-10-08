/* eslint-disable no-console */
import { entryRepository } from "../db/entryRepository";
import { TwitterService } from "./twitterService";
import { schedulerRepository } from "../db/schedulerRepository";

const FAST_DELETE_LIMIT = Number(process.env.FAST_DELETE_LIMIT || 100);
const twitter = new TwitterService();

/** Quickly purge deleted tweets from the pool. Safe to run often. */
export async function fastDeleteSweep(): Promise<void> {
  const startTime = Date.now();

  try {
    const ids = await entryRepository.getDistinctTweetIds(FAST_DELETE_LIMIT);
    if (ids.length === 0) {
      // optional: silent to avoid noise
      // Update heartbeat even for no-op runs
      const duration = Date.now() - startTime;
      await schedulerRepository.updateHeartbeat("fastDeleteSweep", duration);
      return;
    }

    const numericIds = ids.filter((id) => /^\d+$/.test(id));
    if (numericIds.length === 0) return;

    console.log(`[fastDeleteSweep] scanning ${numericIds.length} tweet ids…`);

    let alive: Set<string>;
    try {
      alive = await twitter.getTweetsByIds(numericIds);
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data || e?.message || e;
      console.warn(
        `[fastDeleteSweep] lookup failed${status ? ` [${status}]` : ""}:`,
        msg
      );
      return;
    }

    const deleted = numericIds.filter((id) => !alive.has(id));
    if (deleted.length === 0) {
      console.log(`[fastDeleteSweep] 0 deletions`);
      return;
    }

    for (const tid of deleted) {
      await entryRepository.deleteEntriesByTweetId(tid);
      console.log(`🗑️ [fastDeleteSweep] purged tweet ${tid}`);
    }
    console.log(`[fastDeleteSweep] purged ${deleted.length} deleted tweets`);

    // Update heartbeat with success
    const duration = Date.now() - startTime;
    await schedulerRepository.updateHeartbeat("fastDeleteSweep", duration);
  } catch (error: any) {
    // Record error in heartbeat
    await schedulerRepository.recordError("fastDeleteSweep");

    console.error("[fastDeleteSweep] failed:", error?.message || error);
    throw error; // Re-throw to let caller handle
  }
}
