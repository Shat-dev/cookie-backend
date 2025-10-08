"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterService = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const xLimiter_1 = require("../utils/xLimiter");
const fetchWithRetry_1 = require("../utils/fetchWithRetry");
dotenv_1.default.config();
class TwitterService {
    constructor() {
        if (!process.env.TWITTER_BEARER_TOKEN) {
            throw new Error("TWITTER_BEARER_TOKEN missing from .env");
        }
        this.bearerToken = process.env.TWITTER_BEARER_TOKEN;
    }
    async doesTweetStillExist(tweetId) {
        try {
            return await (0, xLimiter_1.budget)("tweetLookup", 1, async () => {
                const res = await fetchWithRetry_1.fetchWithRetry.get(`https://api.twitter.com/2/tweets/${tweetId}`, {
                    headers: { Authorization: `Bearer ${this.bearerToken}` },
                });
                return !!res.data?.data;
            });
        }
        catch (err) {
            if (err?.response?.status === 404)
                return false;
            console.error("⚠️ Tweet check error:", err?.message || err);
            return true;
        }
    }
    async getTweetText(tweetId) {
        try {
            return await (0, xLimiter_1.budget)("tweetLookup", 1, async () => {
                const res = await fetchWithRetry_1.fetchWithRetry.get(`https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text`, { headers: { Authorization: `Bearer ${this.bearerToken}` } });
                return res.data?.data?.text || null;
            });
        }
        catch (err) {
            console.error(`❌ Failed to fetch tweet ${tweetId}:`, err?.message || err);
            return null;
        }
    }
    async getTweetsByIds(ids) {
        const existing = new Set();
        if (!ids?.length)
            return existing;
        const unique = Array.from(new Set(ids.map(String)));
        for (let i = 0; i < unique.length; i += 50) {
            const chunk = unique.slice(i, i + 50);
            try {
                await (0, xLimiter_1.budget)("tweetLookup", 1, async () => {
                    const res = await fetchWithRetry_1.fetchWithRetry.get("https://api.twitter.com/2/tweets", {
                        headers: { Authorization: `Bearer ${this.bearerToken}` },
                        params: { ids: chunk.join(","), "tweet.fields": "id" },
                    });
                    const data = res.data?.data;
                    if (Array.isArray(data)) {
                        for (const t of data)
                            existing.add(t.id);
                    }
                    const h = res.headers || {};
                    const remaining = Number(h["x-rate-limit-remaining"]);
                    const resetAt = Number(h["x-rate-limit-reset"]);
                    if (!Number.isNaN(remaining) && !Number.isNaN(resetAt)) {
                        console.log(`[TwitterService] batch lookup: remaining=${remaining}, resetsIn=${Math.max(0, Math.floor(resetAt * 1000 - Date.now()) / 1000)}s`);
                    }
                });
            }
            catch (err) {
                console.error(`[TwitterService] Failed to fetch chunk ${i}-${i + chunk.length}:`, err?.message || err);
            }
        }
        return existing;
    }
    async getMentions(userId, params) {
        return await (0, xLimiter_1.budget)("mentions", 1, async () => {
            const res = await fetchWithRetry_1.fetchWithRetry.get(`https://api.twitter.com/2/users/${userId}/mentions`, { headers: { Authorization: `Bearer ${this.bearerToken}` }, params });
            return res.data;
        });
    }
}
exports.TwitterService = TwitterService;
//# sourceMappingURL=twitterService.js.map