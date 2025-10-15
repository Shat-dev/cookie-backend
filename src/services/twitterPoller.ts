/* eslint-disable no-console */
import dotenv from "dotenv";
import { entryRepository } from "../db/entryRepository";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import { getGachaContract } from "../utils/ownershipUtils";
import { TwitterService } from "./twitterService";
import { roundCoordinator } from "./roundCoordinator"; // ✅ NEW: start round after intake

dotenv.config();

const GACHA_USER_ID = process.env.X_USER_ID!;

const tw = new TwitterService();
const contract = getGachaContract();

// ---------- ERC-404 helpers ----------
const ID_PREFIX = 1n << 255n;
const encodeId = (n: bigint) => (n | ID_PREFIX).toString();
const isEncoded = (n: bigint) => n >= ID_PREFIX;
const decodeId = (n: bigint) => (isEncoded(n) ? n - ID_PREFIX : n);

// ---------- App state (since_id) ----------
const STATE_KEY_LAST_MENTION = "last_processed_mention_id";
const stateRepo = new AppStateRepository(pool);

/**
 * Core poller: updates DB only (no on-chain pushes).
 * Safe to call on a schedule AND as a one-off right before freeze.
 */
export async function pollMentions() {
  // Add debug logging for environment variables and database connection
  console.log(`🐦 [twitterPoller] Starting pollMentions...`);
  try {
    console.log(
      `🐦 [twitterPoller] Attempting to get sinceId from database...`
    );
    const sinceId = await stateRepo.get(STATE_KEY_LAST_MENTION);
    console.log(
      `🐦 [twitterPoller] Successfully got sinceId: ${sinceId || "null"}`
    );

    const params: Record<string, any> = {
      "tweet.fields": "created_at,text",
      max_results: 10,
    };
    if (sinceId) params.since_id = sinceId;

    // Use TwitterService so calls are rate-limited + header-aware
    const resp = await tw.getMentions(GACHA_USER_ID, params);
    const tweets: Array<{ id: string; text: string }> = resp?.data ?? [];
    if (!tweets.length) {
      console.log(
        `🐦 [twitterPoller] No new mentions found since ID: ${
          sinceId || "beginning"
        }`
      );
      return; // nothing new
    }

    console.log(
      `🐦 [twitterPoller] Found ${tweets.length} new mention(s) to process`
    );

    // Process oldest -> newest so maxId is correct
    tweets.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    let maxId = sinceId ? BigInt(sinceId) : 0n;

    let processed = 0;

    for (const tweet of tweets) {
      const rawText = String(tweet.text ?? "");
      const tweetText = rawText.replace(/\s+/g, " ").trim();
      const tweetId = tweet.id;
      const tweetUrl = `https://x.com/i/web/status/${tweetId}`;

      const tid = BigInt(tweetId);
      if (tid > maxId) maxId = tid;

      // Extract first "Gacha <number>"
      const tokenMatch = tweetText.match(/\bGacha\s+(\d{1,7})\b/i);
      if (!tokenMatch) continue;

      const humanIdStr = tokenMatch[1];
      const humanId = BigInt(humanIdStr);

      // Resolve owner via encoded ownerOf; fallback to plain
      let walletAddress: string | null = null;
      try {
        walletAddress = await contract.ownerOf(encodeId(humanId));
      } catch {
        try {
          walletAddress = await contract.ownerOf(humanId);
        } catch {
          // not materialized as ERC-721; skip
          continue;
        }
      }
      if (!walletAddress) continue;

      const normalizedWallet = walletAddress.toLowerCase();

      // Get ALL encoded ids owned by wallet, then decode → dedupe
      let encodedOwned: bigint[];
      try {
        encodedOwned = await contract.owned(normalizedWallet);
      } catch {
        // owned() not available or failed; skip this tweet
        continue;
      }
      if (!encodedOwned?.length) continue;

      const decodedOwnedStrings = encodedOwned
        .map((raw: bigint) => decodeId(raw))
        .map((bi: bigint) => bi.toString());

      const uniqueDecoded = Array.from(new Set(decodedOwnedStrings));

      // Upsert per-token rows (UNIQUE (tweet_id, token_id) handles dedupe)
      await entryRepository.upsertManyTokenEntries({
        tweet_id: tweetId,
        wallet_address: normalizedWallet,
        token_ids: uniqueDecoded,
        tweet_url: tweetUrl,
        verified: true,
      });

      processed++;
    }

    // Save high-water mark so we only get newer tweets next run
    await stateRepo.set(STATE_KEY_LAST_MENTION, maxId.toString());

    // One concise line per cycle
    console.log(
      `🟢 pollMentions: processed ${processed}/${tweets.length} new mention(s)`
    );

    // ✅ If we ingested anything, make sure a round exists so the timer can start
    if (processed > 0) {
      await roundCoordinator.createRoundIfNeeded();
    }
  } catch (err: any) {
    console.error(
      "❌ Failed to poll mentions:",
      err?.response?.data || err?.message || err
    );
    console.error("❌ [twitterPoller] Full error details:", {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      stack: err?.stack?.split("\n").slice(0, 3).join("\n"), // First 3 lines of stack
    });
  }
}

// --------- Standalone runner (only when invoked directly) ---------
if (require.main === module) {
  let isRunning = false;
  const tick = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      await pollMentions();
    } catch (e) {
      console.error("❌ pollMentions tick failed:", (e as any)?.message || e);
    } finally {
      isRunning = false;
    }
  };
  void tick();
  // keep a conservative local interval; in server.ts we already schedule with jitter/backoff
  setInterval(tick, 15_000);
}
