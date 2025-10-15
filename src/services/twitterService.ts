/* eslint-disable no-console */
import axios from "axios";
import dotenv from "dotenv";
import { beforeCall, afterCall, record429 } from "./rateLimiter";

dotenv.config();

export class TwitterService {
  private bearerToken: string;

  constructor() {
    const t = process.env.TWITTER_BEARER_TOKEN;
    if (!t) throw new Error("TWITTER_BEARER_TOKEN missing from .env");
    this.bearerToken = t;
  }

  private auth() {
    return { Authorization: `Bearer ${this.bearerToken}` };
  }

  async doesTweetStillExist(tweetId: string): Promise<boolean> {
    try {
      await beforeCall("lookup");
      const res = await axios.get(
        `https://api.twitter.com/2/tweets/${tweetId}`,
        {
          headers: this.auth(),
        }
      );
      afterCall("lookup", res.headers);
      return !!res.data?.data;
    } catch (err: any) {
      const s = err?.response?.status;
      if (s === 429) record429("lookup", err.response?.headers);
      if (s === 404) return false;
      console.error("⚠️ Tweet check error:", err?.message || err);
      return true;
    }
  }

  /**
   * Verify if a tweet still exists with retry logic and backoff.
   * Only returns false (deleted) if we get a confirmed 404 after retries.
   */
  async verifyTweetDeletion(tweetId: string): Promise<boolean> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await beforeCall("lookup");
        const res = await axios.get(
          `https://api.twitter.com/2/tweets/${tweetId}`,
          {
            headers: this.auth(),
          }
        );
        afterCall("lookup", res.headers);

        // Tweet exists
        if (res.data?.data) {
          console.log(
            `✅ Tweet ${tweetId} verified as existing (attempt ${attempt}/${maxRetries})`
          );
          return false; // NOT deleted
        }
      } catch (err: any) {
        const status = err?.response?.status;

        if (status === 429) {
          record429("lookup", err.response?.headers);
          console.warn(
            `⏳ Rate limited verifying tweet ${tweetId} (attempt ${attempt}/${maxRetries})`
          );
        } else if (status === 404) {
          // 404 is a strong signal of deletion, but let's retry once more to be sure
          if (attempt === maxRetries) {
            console.warn(
              `🗑️ Tweet ${tweetId} confirmed as deleted after ${maxRetries} attempts`
            );
            return true; // DELETED
          }
          console.warn(
            `❓ Tweet ${tweetId} returned 404 (attempt ${attempt}/${maxRetries}), retrying...`
          );
        } else {
          console.error(
            `⚠️ Tweet verification error for ${tweetId} (attempt ${attempt}/${maxRetries}):`,
            err?.message || err
          );
        }

        if (attempt < maxRetries) {
          // Exponential backoff: wait 1s, 2s, 4s
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Retrying tweet verification in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // If we get here, we couldn't conclusively verify deletion
    console.warn(
      `⚠️ Could not conclusively verify deletion of tweet ${tweetId} after ${maxRetries} attempts. Treating as NOT deleted for safety.`
    );
    return false; // NOT deleted (safe default)
  }

  async getTweetText(tweetId: string): Promise<string | null> {
    try {
      await beforeCall("lookup");
      const res = await axios.get(
        `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text`,
        { headers: this.auth() }
      );
      afterCall("lookup", res.headers);
      return res.data?.data?.text || null;
    } catch (err: any) {
      const s = err?.response?.status;
      if (s === 429) record429("lookup", err.response?.headers);
      console.error(
        `❌ Failed to fetch tweet ${tweetId}:`,
        err?.message || err
      );
      return null;
    }
  }

  async getTweetsByIds(ids: string[]): Promise<Set<string>> {
    const existing = new Set<string>();
    if (!ids?.length) return existing;

    const unique = Array.from(new Set(ids.map(String)));
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      try {
        await beforeCall("lookup");
        const res = await axios.get("https://api.twitter.com/2/tweets", {
          headers: this.auth(),
          params: { ids: chunk.join(","), "tweet.fields": "id" },
        });
        afterCall("lookup", res.headers);
        const data: Array<{ id: string }> | undefined = res.data?.data;
        if (Array.isArray(data)) for (const t of data) existing.add(t.id);
      } catch (err: any) {
        if (err?.response?.status === 429) {
          record429("lookup", err.response?.headers);
        }
        throw err;
      }
    }
    return existing;
  }

  async getMentions(userId: string, params: Record<string, any>) {
    await beforeCall("mentions");
    try {
      const res = await axios.get(
        `https://api.twitter.com/2/users/${userId}/mentions`,
        { headers: this.auth(), params }
      );
      afterCall("mentions", res.headers);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 429)
        record429("mentions", err.response?.headers);
      throw err;
    }
  }
}
