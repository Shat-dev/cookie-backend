/* eslint-disable no-console */
import dotenv from "dotenv";
import { entryRepository } from "../db/entryRepository";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import { getGachaContract } from "../utils/ownershipUtils";
import { TwitterService } from "./twitterService";
import { schedulerRepository } from "../db/schedulerRepository";

dotenv.config();

const GACHA_USER_ID = process.env.X_USER_ID!;
if (!GACHA_USER_ID) throw new Error("X_USER_ID is missing");

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
  const startTime = Date.now();

  try {
    const sinceId = await stateRepo.get(STATE_KEY_LAST_MENTION);

    const params: Record<string, any> = {
      "tweet.fields": "created_at,text",
      max_results: 10,
    };
    if (sinceId) params.since_id = sinceId;

    // Use TwitterService so calls are rate-limited + header-aware
    const resp = await tw.getMentions(GACHA_USER_ID, params);
    const tweets: Array<{ id: string; text: string }> = resp?.data ?? [];
    if (!tweets.length) {
      // Update heartbeat even for no-op runs
      const duration = Date.now() - startTime;
      await schedulerRepository.updateHeartbeat("twitterPoller", duration);
      return; // nothing new
    }

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

    // Update heartbeat with success
    const duration = Date.now() - startTime;
    await schedulerRepository.updateHeartbeat("twitterPoller", duration);

    // One concise line per cycle
    console.log(
      `🟢 pollMentions: processed ${processed}/${tweets.length} new mention(s) in ${duration}ms`
    );

    // Note: Round creation is handled by AutomatedLotteryService, not here
  } catch (err: any) {
    // Record error in heartbeat
    await schedulerRepository.recordError("twitterPoller");

    console.error(
      "❌ Failed to poll mentions:",
      err?.response?.data || err?.message || err
    );
  }
}

// --------- Standalone runner (only when invoked directly) ---------
if (require.main === module) {
  // Simple standalone runner for testing
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
  setInterval(tick, 120000); // 2 minutes
  console.log("🔄 Standalone twitterPoller started");
}
