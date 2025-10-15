/* eslint-disable no-console */
import { entryRepository } from "../db/entryRepository";
import { TwitterService } from "./twitterService";
import { sanitizeErrorResponse } from "../utils/auditLogger";

const FAST_DELETE_LIMIT = Number(process.env.FAST_DELETE_LIMIT || 100);
// 🚨 CRITICAL SAFETY LIMITS to prevent database clearing
const MAX_DELETIONS_PER_SWEEP = Number(
  process.env.MAX_DELETIONS_PER_SWEEP || 5
); // Max tweets to delete per sweep
const twitter = new TwitterService();

/** Quickly purge deleted tweets from the pool. Safe to run often. */
export async function fastDeleteSweep(): Promise<void> {
  const ids = await entryRepository.getDistinctTweetIds(FAST_DELETE_LIMIT);
  if (ids.length === 0) {
    // optional: silent to avoid noise
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
    const { logDetails } = sanitizeErrorResponse(e, "Tweet lookup failed");
    console.warn(
      `[fastDeleteSweep] lookup failed${status ? ` [${status}]` : ""}:`,
      logDetails
    );
    return;
  }

  const deleted = numericIds.filter((id) => !alive.has(id));
  if (deleted.length === 0) {
    console.log(`[fastDeleteSweep] 0 deletions`);
    return;
  }

  // 🚨 CRITICAL SAFETY CHECK: Prevent mass deletions
  console.warn(
    `⚠️  [fastDeleteSweep] DELETION ALERT: ${deleted.length}/${numericIds.length} tweets reported as deleted by Twitter API`
  );

  if (deleted.length > MAX_DELETIONS_PER_SWEEP) {
    console.error(
      `🚨 [fastDeleteSweep] SAFETY ABORT: Attempted to delete ${deleted.length} tweets, but MAX_DELETIONS_PER_SWEEP is ${MAX_DELETIONS_PER_SWEEP}`
    );
    console.error(
      `🚨 This could be a Twitter API issue. Skipping deletions for safety.`
    );
    console.error(
      `🚨 Would have deleted: ${deleted.slice(0, 5).join(", ")}${
        deleted.length > 5 ? "..." : ""
      }`
    );
    return;
  }

  // Safe to proceed with deletions
  for (const tid of deleted) {
    console.warn(
      `🗑️  [fastDeleteSweep] CONFIRMED DELETION: Removing entries for tweet ${tid} (verified deleted by Twitter)`
    );
    await entryRepository.deleteEntriesByTweetId(tid);
  }
  console.log(
    `[fastDeleteSweep] Safely purged ${deleted.length} confirmed deleted tweets`
  );
}
