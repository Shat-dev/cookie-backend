/* eslint-disable no-console */
import pool from "../db/connection";
import { entryRepository } from "../db/entryRepository";
import { getAllDecodedOwnedTokenIds } from "../utils/ownershipUtils";
import { TwitterService } from "./twitterService";
import { schedulerRepository } from "../db/schedulerRepository";
import { budget } from "../utils/xLimiter";

const twitterService = new TwitterService();

// helper: strictly numeric tweet id?
const isNumericId = (s: string) => /^\d+$/.test(s);

/**
 * Validate the live eligibility pool (DB) so it exactly reflects rules *up to freeze*.
 *
 * Modes:
 *  - Regular sweep (default): respects VALIDATE_MAX_BATCHES_PER_RUN (lightweight).
 *  - Final sweep (freeze): set finalSweep=true to process ALL tweets with rate limiting.
 *
 * Rules:
 *  1) Deleted tweets → remove ALL entries for that tweet (current & future).
 *  2) Transfers → prune tokens no longer owned (for that tweet's wallet).
 *  3) New tokens after the tweet → auto-add (no new tweet required) if the tweet still exists.
 */
export async function validateEntries(finalSweep = false): Promise<void> {
  const startTime = Date.now();

  try {
    // 1) Load per-token rows
    const rows = await entryRepository.getAllEntries();
    if (!rows.length) {
      console.log("[validateEntries] no rows to validate.");
      // Update heartbeat even for no-op runs
      const duration = Date.now() - startTime;
      await schedulerRepository.updateHeartbeat("validateEntries", duration);
      return;
    }

    // 2) Group rows by tweet_id
    type Group = {
      tweet_id: string;
      wallet_address: string;
      tweet_url: string;
      tokens: Set<string>;
    };
    const byTweet = new Map<string, Group>();

    for (const row of rows) {
      const tid = row.tweet_id;
      if (!byTweet.has(tid)) {
        byTweet.set(tid, {
          tweet_id: tid,
          wallet_address: row.wallet_address.toLowerCase(),
          tweet_url: row.tweet_url,
          tokens: new Set<string>(),
        });
      }
      byTweet.get(tid)!.tokens.add(String(row.token_id));
    }

    // 2a) PURGE invalid tweet_ids (e.g., "manual_sync_*") to avoid Twitter 400s
    const allTweetIds = Array.from(byTweet.keys());
    const invalidTweetIds = allTweetIds.filter((id) => !isNumericId(id));
    if (invalidTweetIds.length) {
      console.warn(
        `[validateEntries] purging ${invalidTweetIds.length} invalid tweet_id rows (non-numeric). Example(s):`,
        invalidTweetIds.slice(0, 5)
      );
      for (const badId of invalidTweetIds) {
        await entryRepository.deleteEntriesByTweetId(badId);
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

    // 3) Process in batches with rate limiting
    const CHUNK = finalSweep ? 50 : 100; // Smaller chunks for final sweep to respect rate limits
    const maxBatchesEnv = Number(process.env.VALIDATE_MAX_BATCHES_PER_RUN || 3);
    const maxBatchesPerRun = finalSweep
      ? Number.MAX_SAFE_INTEGER
      : maxBatchesEnv;
    let processedBatches = 0;
    let totalProcessed = 0;

    for (let i = 0; i < validTweetIds.length; i += CHUNK) {
      if (!finalSweep && processedBatches >= maxBatchesPerRun) {
        console.log(
          `[validateEntries] reached batch cap (${maxBatchesEnv}); finishing this run.`
        );
        break;
      }

      const slice = validTweetIds.slice(i, i + CHUNK);
      const batchStartTime = Date.now();

      // 3a) Rate-limited batch existence check
      let existingSet: Set<string>;
      try {
        // For final sweeps, use the rate limiter to ensure we don't exceed API budget
        if (finalSweep) {
          existingSet = await budget("tweetLookup", 1, async () => {
            return await twitterService.getTweetsByIds(slice);
          });
        } else {
          existingSet = await twitterService.getTweetsByIds(slice);
        }
      } catch (e: any) {
        // Defensive: if Twitter responds 4xx/5xx, skip this batch but keep the loop going
        const status = e?.response?.status;
        const msg = e?.response?.data || e?.message || e;
        console.error(
          `[validateEntries] getTweetsByIds failed for batch (${slice.length})${
            status ? ` [${status}]` : ""
          }:`,
          msg
        );
        processedBatches++;
        continue;
      }

      const deletedIds = slice.filter((id) => !existingSet.has(id));
      const aliveIds = slice.filter((id) => existingSet.has(id));

      // 3b) DELETED TWEETS: Remove ALL entries for those tweets
      for (const delId of deletedIds) {
        await entryRepository.deleteEntriesByTweetId(delId);
        console.log(`🗑️ Deleted ALL entries for deleted tweet: ${delId}`);
      }

      // 3c) ALIVE TWEETS: Sync to *current ownership* (prune + auto-add)
      for (const tid of aliveIds) {
        const group = byTweet.get(tid)!;
        const wallet = group.wallet_address;
        const tweetUrl = group.tweet_url;

        // Fetch *all* currently owned decoded token IDs for the wallet
        const ownedNow = await getAllDecodedOwnedTokenIds(wallet);
        const ownedSet = new Set(ownedNow.map(String));

        // Current DB tokens for this tweet
        const dbTokens = group.tokens;

        // (A) Prune tokens no longer owned
        const toRemove: string[] = [];
        for (const token of dbTokens) {
          if (!ownedSet.has(token)) toRemove.push(token);
        }

        if (toRemove.length > 0) {
          // Delete only those rows for this tweet_id
          for (const tokenId of toRemove) {
            await pool.query(
              `DELETE FROM entries WHERE tweet_id = $1 AND token_id = $2`,
              [tid, tokenId]
            );
            dbTokens.delete(tokenId);
          }
          console.log(
            `🔄 ${tid}: Removed ${toRemove.length} token(s) no longer owned.`
          );
        }

        // (B) Auto-add newly acquired tokens for this wallet (no new tweet required)
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
          toAdd.forEach((t) => dbTokens.add(t)); // update local view
          console.log(
            `➕ ${tid}: Auto-added ${toAdd.length} newly acquired token(s).`
          );
        }

        // (C) Done for this tweet
        console.log(
          `✅ ${tid}: Synced. Total tokens now: ${dbTokens.size} (wallet ${wallet})`
        );
      }

      processedBatches++;
      totalProcessed += slice.length;

      const batchDuration = Date.now() - batchStartTime;

      // For final sweeps, add progress logging and rate limiting
      if (finalSweep) {
        const progress = (
          ((i + slice.length) / validTweetIds.length) *
          100
        ).toFixed(1);
        console.log(
          `📊 [validateEntries] Final sweep progress: ${progress}% (${
            i + slice.length
          }/${
            validTweetIds.length
          }) - Batch ${processedBatches} completed in ${batchDuration}ms`
        );

        // Add small delay between batches for final sweep to be gentle on rate limits
        if (i + CHUNK < validTweetIds.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
        }
      }
    }

    // Update heartbeat with success
    const duration = Date.now() - startTime;
    await schedulerRepository.updateHeartbeat("validateEntries", duration);

    console.log(
      `[validateEntries] completed in ${duration}ms - Processed ${totalProcessed} tweets in ${processedBatches} batches`
    );
  } catch (error: any) {
    // Record error in heartbeat
    await schedulerRepository.recordError("validateEntries");

    console.error("[validateEntries] failed:", error?.message || error);
    throw error; // Re-throw to let caller handle
  }
}
