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
  if (ids.length === 0) return;

  const numericIds = ids.filter((id) => /^\d+$/.test(id));
  if (numericIds.length === 0) return;

  console.log(`[fastDeleteSweep] scanning ${numericIds.length} tweet ids…`);

  let alive: Set<string>;
  try {
    alive = await twitter.getTweetsByIds(numericIds);
    if (!(alive instanceof Set)) {
      console.error(
        `[fastDeleteSweep] TwitterService returned invalid data type. Expected Set<string>.`
      );
      return;
    }
  } catch (e: any) {
    const status = e?.response?.status;
    const { logDetails } = sanitizeErrorResponse(e, "Tweet lookup failed");
    console.warn(
      `[fastDeleteSweep] lookup failed${status ? ` [${status}]` : ""}:`,
      logDetails
    );
    return;
  }

  // Detect possibly missing IDs (API may have omitted some valid ones)
  const missingIds = numericIds.filter((id) => !alive.has(id));

  // Re-check missing IDs once to confirm true deletions
  let confirmedDeleted: string[] = [];
  if (missingIds.length > 0) {
    console.log(
      `[fastDeleteSweep] verifying ${missingIds.length} potentially deleted tweets...`
    );
    try {
      const secondCheckAlive = await twitter.getTweetsByIds(missingIds);
      confirmedDeleted = missingIds.filter((id) => !secondCheckAlive.has(id));
    } catch (retryErr: any) {
      console.warn(
        `[fastDeleteSweep] retry check failed — skipping deletions for safety.`,
        retryErr?.message || retryErr
      );
      return;
    }
  }

  if (confirmedDeleted.length === 0) {
    console.log(`[fastDeleteSweep] 0 confirmed deletions after verification`);
    return;
  }

  // 🚨 CRITICAL SAFETY CHECK: Prevent mass deletions
  console.warn(
    `⚠️ [fastDeleteSweep] DELETION ALERT: ${confirmedDeleted.length}/${numericIds.length} tweets confirmed deleted`
  );

  if (confirmedDeleted.length > MAX_DELETIONS_PER_SWEEP) {
    console.error(
      `🚨 [fastDeleteSweep] SAFETY ABORT: Attempted to delete ${confirmedDeleted.length} tweets, but MAX_DELETIONS_PER_SWEEP is ${MAX_DELETIONS_PER_SWEEP}`
    );
    console.error(
      `🚨 Skipping deletions for safety. Potential API inconsistency.`
    );
    console.error(
      `🚨 Would have deleted: ${confirmedDeleted.slice(0, 5).join(", ")}${
        confirmedDeleted.length > 5 ? "..." : ""
      }`
    );
    return;
  }

  // Safe to proceed with deletions (isolated per-tweet try/catch)
  let deletedCount = 0;
  for (const tid of confirmedDeleted) {
    try {
      console.warn(
        `🗑️ [fastDeleteSweep] CONFIRMED DELETION: Removing entries for tweet ${tid}`
      );
      await entryRepository.deleteEntriesByTweetId(tid);
      deletedCount++;
    } catch (dbErr) {
      console.error(`[fastDeleteSweep] DB deletion failed for ${tid}:`);
      // Continue to next ID without aborting the sweep
    }
  }

  console.log(
    `[fastDeleteSweep] Safely purged ${deletedCount} confirmed deleted tweets`
  );
}
