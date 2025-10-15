/* eslint-disable no-console */
import pool from "../db/connection";
import { entryRepository } from "../db/entryRepository";
import { getAllDecodedOwnedTokenIds } from "../utils/ownershipUtils";
import { TwitterService } from "./twitterService";
import { sanitizeErrorResponse } from "../utils/auditLogger";

const twitterService = new TwitterService();

// ⚠️ Safety limits
const MAX_DELETIONS_PER_RUN = Number(process.env.MAX_DELETIONS_PER_RUN || 10); // max tweets removed in a run
const MASS_DELETION_THRESHOLD = Number(
  process.env.MASS_DELETION_THRESHOLD || 0.5
); // >50% of tweets → stop
const DELETION_SAFETY_THRESHOLD = Number(
  process.env.VALIDATE_DELETION_THRESHOLD || 0.8
); // >80% of entry rows → stop

// helper: strictly numeric tweet id?
const isNumericId = (s: string) => /^\d+$/.test(s);

type Group = {
  tweet_id: string;
  wallet_address: string;
  tweet_url: string;
  tokens: Set<string>; // represents entry rows for this tweet
};

/**
 * Validate pool up to freeze.
 * - Regular sweep respects VALIDATE_MAX_BATCHES_PER_RUN.
 * - finalSweep=true processes all tweets.
 */
export async function validateEntries(finalSweep = false): Promise<void> {
  // 1) Load per-token rows
  const rows = await entryRepository.getAllEntries();
  if (!rows.length) {
    console.log("[validateEntries] no rows to validate.");
    return;
  }

  // Global counters for safety
  const initialEntryCount = rows.length;
  const counters = {
    entryDeletions: 0, // number of entry rows deleted this run
    tweetsDeleted: 0, // number of tweets deleted this run
  };

  // 2) Group rows by tweet_id
  const byTweet = new Map<string, Group>();
  for (const row of rows) {
    const tid = row.tweet_id as string;
    let g = byTweet.get(tid);
    if (!g) {
      g = {
        tweet_id: tid,
        wallet_address: (row.wallet_address as string).toLowerCase(),
        tweet_url: row.tweet_url as string,
        tokens: new Set<string>(),
      };
      byTweet.set(tid, g);
    }
    g.tokens.add(String(row.token_id));
  }

  // 2a) Purge non-numeric tweet_ids proactively
  const allTweetIds = Array.from(byTweet.keys());
  const invalidTweetIds = allTweetIds.filter((id) => !isNumericId(id));
  if (invalidTweetIds.length) {
    console.warn(
      `[validateEntries] purging ${invalidTweetIds.length} invalid tweet_id rows (non-numeric). Example(s):`,
      invalidTweetIds.slice(0, 5)
    );
    for (const badId of invalidTweetIds) {
      const g = byTweet.get(badId);
      const rowsForBad = g ? g.tokens.size : 0;
      // Safety check against entry-row cap
      if (
        wouldExceedEntryCap(
          counters.entryDeletions + rowsForBad,
          initialEntryCount
        )
      ) {
        console.error(
          capMsg(
            "purge-invalid",
            counters.entryDeletions + rowsForBad,
            initialEntryCount
          )
        );
        return;
      }
      await entryRepository.deleteEntriesByTweetId(badId);
      counters.entryDeletions += rowsForBad;
      byTweet.delete(badId);
    }
  }

  const validTweetIds = Array.from(byTweet.keys());
  if (!validTweetIds.length) {
    console.log("[validateEntries] no valid tweet_ids after purge.");
    return;
  }

  console.log(
    `[validateEntries] checking ${validTweetIds.length} tweets... (finalSweep=${finalSweep})`
  );

  // 3) Process in batches (rate-limited inside TwitterService)
  const CHUNK = 100;
  const maxBatchesEnv = Number(process.env.VALIDATE_MAX_BATCHES_PER_RUN || 3);
  const maxBatchesPerRun = finalSweep ? Number.MAX_SAFE_INTEGER : maxBatchesEnv;
  let processedBatches = 0;

  for (let i = 0; i < validTweetIds.length; i += CHUNK) {
    if (!finalSweep && processedBatches >= maxBatchesPerRun) {
      console.log(
        `[validateEntries] reached batch cap (${maxBatchesPerRun}); finishing this run.`
      );
      break;
    }

    const slice = validTweetIds.slice(i, i + CHUNK);

    // 3a) Batch existence check
    let existingSet: Set<string>;
    try {
      existingSet = await twitterService.getTweetsByIds(slice);
    } catch (e: any) {
      const status = e?.response?.status;
      const { logDetails } = sanitizeErrorResponse(
        e,
        "Tweet validation failed"
      );
      console.error(
        `[validateEntries] getTweetsByIds failed for batch (${slice.length})${
          status ? ` [${status}]` : ""
        }:`,
        logDetails
      );
      processedBatches++;
      continue;
    }

    // Guard 0: suspicious empty result for non-empty slice
    if (existingSet.size === 0 && slice.length > 0) {
      console.warn(
        `⚠️  [validateEntries] SUSPICIOUS: 0/${slice.length} tweets returned. Skipping deletions for this batch.`
      );
      // no alive processing because we don't know which are alive; move on
      processedBatches++;
      continue;
    }

    // Guard 1: partial batch → treat as non-authoritative if >25% missing
    if (existingSet.size < slice.length) {
      const missingCount = slice.length - existingSet.size;
      const missingPct = (missingCount / slice.length) * 100;
      console.warn(
        `⚠️  [validateEntries] PARTIAL RESULT ${existingSet.size}/${
          slice.length
        } (${missingPct.toFixed(1)}% missing)`
      );
      if (missingPct > 25) {
        console.warn(
          `🚫 [validateEntries] Skipping deletions for this batch due to incompleteness`
        );
        // Still sync alive
        const aliveIds = slice.filter((id) => existingSet.has(id));
        await processTweetOwnershipSync(
          aliveIds,
          byTweet,
          counters,
          initialEntryCount
        );
        processedBatches++;
        continue;
      }
    }

    const potentiallyDeletedIds = slice.filter((id) => !existingSet.has(id));
    const aliveIds = slice.filter((id) => existingSet.has(id));

    // 3b) Individually verify potential deletions with caps
    if (potentiallyDeletedIds.length > 0) {
      console.log(
        `🔍 [validateEntries] Verifying ${potentiallyDeletedIds.length} potentially deleted tweets...`
      );

      for (const tweetId of potentiallyDeletedIds) {
        // Per-run tweet deletion cap
        if (counters.tweetsDeleted >= MAX_DELETIONS_PER_RUN) {
          console.error(
            `⛔ [validateEntries] MAX_DELETIONS_PER_RUN (${MAX_DELETIONS_PER_RUN}) reached. Aborting further deletions.`
          );
          // Still sync remaining alive IDs in this batch, then stop outer loop cleanly
          await processTweetOwnershipSync(
            aliveIds,
            byTweet,
            counters,
            initialEntryCount
          );
          processedBatches++;
          return;
        }

        // Mass deletion by tweet count threshold
        const projectedTweetDeletionRatio =
          (counters.tweetsDeleted + 1) / validTweetIds.length;
        if (projectedTweetDeletionRatio > MASS_DELETION_THRESHOLD) {
          console.error(
            `⛔ [validateEntries] MASS_DELETION_THRESHOLD (${
              MASS_DELETION_THRESHOLD * 100
            }%) would be exceeded by deleting tweet ${tweetId}. Aborting run.`
          );
          return;
        }

        const isDeleted = await twitterService.verifyTweetDeletion(tweetId);

        if (isDeleted) {
          // Count how many entry rows this tweet represents
          const group = byTweet.get(tweetId);
          const rowsForTweet = group ? group.tokens.size : 0;

          // Global entry-row cap check
          const projectedEntryDeletions =
            counters.entryDeletions + rowsForTweet;
          if (wouldExceedEntryCap(projectedEntryDeletions, initialEntryCount)) {
            console.error(
              capMsg("tweet-delete", projectedEntryDeletions, initialEntryCount)
            );
            return; // Abort entire validation to be safe
          }

          await entryRepository.deleteEntriesByTweetId(tweetId);
          counters.entryDeletions += rowsForTweet;
          counters.tweetsDeleted += 1;

          console.warn(
            `🗑️  [validateEntries] CONFIRMED DELETION of tweet ${tweetId} → removed ${rowsForTweet} entries (totals: entries=${counters.entryDeletions}, tweets=${counters.tweetsDeleted})`
          );
          // Keep map coherent
          byTweet.delete(tweetId);
        } else {
          // False alarm → treat as alive
          aliveIds.push(tweetId);
          console.log(`✅ [validateEntries] Tweet ${tweetId} exists.`);
        }

        // Gentle spacing for API
        await sleep(100);
      }
    }

    // 3c) Alive: prune/add by current ownership with entry-row cap checks
    await processTweetOwnershipSync(
      aliveIds,
      byTweet,
      counters,
      initialEntryCount
    );

    processedBatches++;
  }
}

/**
 * Sync ownership for alive tweets with deletion caps applied to row-level removals.
 */
async function processTweetOwnershipSync(
  aliveIds: string[],
  byTweet: Map<string, Group>,
  counters: { entryDeletions: number; tweetsDeleted: number },
  initialEntryCount: number
): Promise<void> {
  for (const tid of aliveIds) {
    const group = byTweet.get(tid);
    if (!group) continue;

    const wallet = group.wallet_address;
    const tweetUrl = group.tweet_url;

    // Fetch *all* currently owned decoded token IDs for the wallet
    const ownedNow = await getAllDecodedOwnedTokenIds(wallet);
    const ownedSet = new Set(ownedNow.map(String));

    // Current DB tokens for this tweet
    const dbTokens = group.tokens;

    // Guard: if DB has tokens but RPC returns empty, recheck once then skip
    if (dbTokens.size > 0 && ownedNow.length === 0) {
      console.warn(
        `⚠️  [validateEntries] Wallet ${wallet} has ${dbTokens.size} DB tokens but ownership returned empty. Rechecking...`
      );
      await sleep(2000);
      const ownedRecheck = await getAllDecodedOwnedTokenIds(wallet);
      if (ownedRecheck.length === 0) {
        console.warn(
          `🚫 [validateEntries] Skipping pruning for wallet ${wallet} (still empty).`
        );
        continue;
      }
      ownedRecheck.forEach((t) => ownedSet.add(String(t)));
    }

    // (A) Prune tokens no longer owned, with entry-row cap
    const toRemove: string[] = [];
    for (const token of dbTokens) {
      if (!ownedSet.has(token)) toRemove.push(token);
    }

    if (toRemove.length > 0) {
      const projected = counters.entryDeletions + toRemove.length;
      if (wouldExceedEntryCap(projected, initialEntryCount)) {
        console.error(capMsg("token-prune", projected, initialEntryCount));
        return; // Abort entire validation to be safe
      }

      for (const tokenId of toRemove) {
        await pool.query(
          `DELETE FROM entries WHERE tweet_id = $1 AND token_id = $2`,
          [tid, tokenId]
        );
        dbTokens.delete(tokenId);
      }
      counters.entryDeletions += toRemove.length;
      console.log(
        `🔄 ${tid}: Removed ${toRemove.length} token(s) no longer owned.`
      );
    }

    // (B) Auto-add newly acquired tokens
    const toAdd: string[] = [];
    for (const token of ownedSet) {
      if (!dbTokens.has(token)) toAdd.push(token);
    }

    if (toAdd.length > 0) {
      await entryRepository.upsertManyTokenEntries({
        tweet_id: tid,
        wallet_address: wallet,
        token_ids: toAdd,
        tweet_url: tweetUrl,
        verified: true,
      });
      toAdd.forEach((t) => dbTokens.add(t));
      console.log(
        `➕ ${tid}: Auto-added ${toAdd.length} newly acquired token(s).`
      );
    }

    console.log(
      `✅ ${tid}: Synced. Total tokens now: ${dbTokens.size} (wallet ${wallet})`
    );
  }
}

/* ----------------- helpers ----------------- */

function wouldExceedEntryCap(
  projectedDeletions: number,
  initialTotal: number
): boolean {
  return projectedDeletions > initialTotal * DELETION_SAFETY_THRESHOLD;
}

function capMsg(
  context: string,
  projected: number,
  initialTotal: number
): string {
  return (
    `⛔ [validateEntries] SAFEGUARD (${context}): deleting ${projected}/${initialTotal} ` +
    `(${((projected / initialTotal) * 100).toFixed(1)}%) would exceed cap of ${
      DELETION_SAFETY_THRESHOLD * 100
    }%. Aborting.`
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
