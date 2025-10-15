/* eslint-disable no-console */
import dotenv from "dotenv";
import { entryRepository } from "../db/entryRepository";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";
import { getCookieContract } from "../utils/ownershipUtils";
import { TwitterService } from "./twitterService";

dotenv.config();

const COOKIE_USER_ID = process.env.X_USER_ID!;
const tw = new TwitterService();
const contract = getCookieContract();

// ---------- ERC-404 helpers ----------
const ID_PREFIX = 1n << 255n;
const encodeId = (n: bigint) => (n | ID_PREFIX).toString();
const isEncoded = (n: bigint) => n >= ID_PREFIX;
const decodeId = (n: bigint) => (isEncoded(n) ? n - ID_PREFIX : n);

// ---------- App state (since_id) ----------
const STATE_KEY_LAST_MENTION = "last_processed_mention_id";
const stateRepo = new AppStateRepository(pool);

/**
 * Core poller: updates DB only (no on-chain actions).
 * Safe to call on a schedule or manually.
 */
export async function pollMentions() {
  console.log(`🐦 [twitterPoller] Starting pollMentions...`);

  try {
    const sinceId = await stateRepo.get(STATE_KEY_LAST_MENTION);
    console.log(`🐦 [twitterPoller] sinceId: ${sinceId || "none"}`);

    const params: Record<string, any> = {
      "tweet.fields": "created_at,text",
      max_results: 10,
    };
    if (sinceId) params.since_id = sinceId;

    const resp = await tw.getMentions(COOKIE_USER_ID, params);
    const tweets: Array<{ id: string; text: string }> = resp?.data ?? [];
    if (!tweets.length) {
      console.log(
        `🐦 [twitterPoller] No new mentions since ${sinceId || "beginning"}`
      );
      return;
    }

    tweets.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    let maxId = sinceId ? BigInt(sinceId) : 0n;
    let processed = 0;

    for (const tweet of tweets) {
      const tweetText = String(tweet.text ?? "")
        .replace(/\s+/g, " ")
        .trim();
      const tweetId = tweet.id;
      const tweetUrl = `https://x.com/i/web/status/${tweetId}`;

      const tid = BigInt(tweetId);
      if (tid > maxId) maxId = tid;

      const tokenMatch = tweetText.match(/\bCookie\s+(\d{1,7})\b/i);
      if (!tokenMatch) continue;

      const humanId = BigInt(tokenMatch[1]);

      let walletAddress: string | null = null;
      try {
        walletAddress = await contract.ownerOf(encodeId(humanId));
      } catch {
        try {
          walletAddress = await contract.ownerOf(humanId);
        } catch {
          continue;
        }
      }
      if (!walletAddress) continue;

      const normalizedWallet = walletAddress.toLowerCase();

      let encodedOwned: bigint[];
      try {
        encodedOwned = await contract.owned(normalizedWallet);
      } catch {
        continue;
      }
      if (!encodedOwned?.length) continue;

      const decodedOwnedStrings = encodedOwned.map((raw: bigint) =>
        decodeId(raw).toString()
      );
      const uniqueDecoded = Array.from(new Set(decodedOwnedStrings));

      await entryRepository.upsertManyTokenEntries({
        tweet_id: tweetId,
        wallet_address: normalizedWallet,
        token_ids: uniqueDecoded,
        tweet_url: tweetUrl,
        verified: true,
      });

      processed++;
    }

    await stateRepo.set(STATE_KEY_LAST_MENTION, maxId.toString());
    console.log(`🟢 pollMentions: processed ${processed}/${tweets.length}`);
  } catch (err: any) {
    console.error(
      "❌ Failed to poll mentions:",
      err?.response?.data || err?.message || err
    );
  }
}

// --------- Standalone runner (optional local debug) ---------
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
  setInterval(tick, 15_000);
}
