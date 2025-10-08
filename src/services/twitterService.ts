/* eslint-disable no-console */
import dotenv from "dotenv";
import { budget } from "../utils/xLimiter";
import { fetchWithRetry } from "../utils/fetchWithRetry";

dotenv.config();

export class TwitterService {
  private bearerToken: string;

  constructor() {
    if (!process.env.TWITTER_BEARER_TOKEN) {
      throw new Error("TWITTER_BEARER_TOKEN missing from .env");
    }
    this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
  }

  async doesTweetStillExist(tweetId: string): Promise<boolean> {
    try {
      return await budget("tweetLookup", 1, async () => {
        const res = await fetchWithRetry.get(
          `https://api.twitter.com/2/tweets/${tweetId}`,
          {
            headers: { Authorization: `Bearer ${this.bearerToken}` },
          }
        );
        return !!res.data?.data;
      });
    } catch (err: any) {
      if (err?.response?.status === 404) return false;
      console.error("⚠️ Tweet check error:", err?.message || err);
      return true;
    }
  }

  async getTweetText(tweetId: string): Promise<string | null> {
    try {
      return await budget("tweetLookup", 1, async () => {
        const res = await fetchWithRetry.get(
          `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text`,
          { headers: { Authorization: `Bearer ${this.bearerToken}` } }
        );
        return res.data?.data?.text || null;
      });
    } catch (err: any) {
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

    // Process in smaller chunks to respect rate limits
    for (let i = 0; i < unique.length; i += 50) {
      // Reduced from 100 to 50
      const chunk = unique.slice(i, i + 50);
      try {
        await budget("tweetLookup", 1, async () => {
          const res = await fetchWithRetry.get(
            "https://api.twitter.com/2/tweets",
            {
              headers: { Authorization: `Bearer ${this.bearerToken}` },
              params: { ids: chunk.join(","), "tweet.fields": "id" },
            }
          );

          const data: Array<{ id: string }> | undefined = res.data?.data;
          if (Array.isArray(data)) {
            for (const t of data) existing.add(t.id);
          }

          // Log rate limit info
          const h = res.headers || {};
          const remaining = Number(h["x-rate-limit-remaining"]);
          const resetAt = Number(h["x-rate-limit-reset"]);
          if (!Number.isNaN(remaining) && !Number.isNaN(resetAt)) {
            console.log(
              `[TwitterService] batch lookup: remaining=${remaining}, resetsIn=${Math.max(
                0,
                Math.floor(resetAt * 1000 - Date.now()) / 1000
              )}s`
            );
          }
        });
      } catch (err: any) {
        console.error(
          `[TwitterService] Failed to fetch chunk ${i}-${i + chunk.length}:`,
          err?.message || err
        );
        // Continue with next chunk instead of failing completely
      }
    }

    return existing;
  }

  async getMentions(userId: string, params: Record<string, any>) {
    return await budget("mentions", 1, async () => {
      const res = await fetchWithRetry.get(
        `https://api.twitter.com/2/users/${userId}/mentions`,
        { headers: { Authorization: `Bearer ${this.bearerToken}` }, params }
      );
      return res.data;
    });
  }
}
