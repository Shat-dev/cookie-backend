"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitterService = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const rateLimiter_1 = require("./rateLimiter");
dotenv_1.default.config();
class TwitterService {
    constructor() {
        const t = process.env.TWITTER_BEARER_TOKEN;
        if (!t)
            throw new Error("TWITTER_BEARER_TOKEN missing from .env");
        this.bearerToken = t;
    }
    auth() {
        return { Authorization: `Bearer ${this.bearerToken}` };
    }
    async doesTweetStillExist(tweetId) {
        try {
            await (0, rateLimiter_1.beforeCall)("lookup");
            const res = await axios_1.default.get(`https://api.twitter.com/2/tweets/${tweetId}`, {
                headers: this.auth(),
            });
            (0, rateLimiter_1.afterCall)("lookup", res.headers);
            return !!res.data?.data;
        }
        catch (err) {
            const s = err?.response?.status;
            if (s === 429)
                (0, rateLimiter_1.record429)("lookup", err.response?.headers);
            if (s === 404)
                return false;
            console.error("⚠️ Tweet check error:", err?.message || err);
            return true;
        }
    }
    async verifyTweetDeletion(tweetId) {
        const maxRetries = 3;
        const baseDelay = 1000;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await (0, rateLimiter_1.beforeCall)("lookup");
                const res = await axios_1.default.get(`https://api.twitter.com/2/tweets/${tweetId}`, {
                    headers: this.auth(),
                });
                (0, rateLimiter_1.afterCall)("lookup", res.headers);
                if (res.data?.data) {
                    console.log(`✅ Tweet ${tweetId} verified as existing (attempt ${attempt}/${maxRetries})`);
                    return false;
                }
            }
            catch (err) {
                const status = err?.response?.status;
                if (status === 429) {
                    (0, rateLimiter_1.record429)("lookup", err.response?.headers);
                    console.warn(`⏳ Rate limited verifying tweet ${tweetId} (attempt ${attempt}/${maxRetries})`);
                }
                else if (status === 404) {
                    if (attempt === maxRetries) {
                        console.warn(`🗑️ Tweet ${tweetId} confirmed as deleted after ${maxRetries} attempts`);
                        return true;
                    }
                    console.warn(`❓ Tweet ${tweetId} returned 404 (attempt ${attempt}/${maxRetries}), retrying...`);
                }
                else {
                    console.error(`⚠️ Tweet verification error for ${tweetId} (attempt ${attempt}/${maxRetries}):`, err?.message || err);
                }
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    console.log(`⏳ Retrying tweet verification in ${delay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        console.warn(`⚠️ Could not conclusively verify deletion of tweet ${tweetId} after ${maxRetries} attempts. Treating as NOT deleted for safety.`);
        return false;
    }
    async getTweetText(tweetId) {
        try {
            await (0, rateLimiter_1.beforeCall)("lookup");
            const res = await axios_1.default.get(`https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text`, { headers: this.auth() });
            (0, rateLimiter_1.afterCall)("lookup", res.headers);
            return res.data?.data?.text || null;
        }
        catch (err) {
            const s = err?.response?.status;
            if (s === 429)
                (0, rateLimiter_1.record429)("lookup", err.response?.headers);
            console.error(`❌ Failed to fetch tweet ${tweetId}:`, err?.message || err);
            return null;
        }
    }
    async getTweetsByIds(ids) {
        const existing = new Set();
        if (!ids?.length)
            return existing;
        const unique = Array.from(new Set(ids.map(String)));
        for (let i = 0; i < unique.length; i += 100) {
            const chunk = unique.slice(i, i + 100);
            try {
                await (0, rateLimiter_1.beforeCall)("lookup");
                const res = await axios_1.default.get("https://api.twitter.com/2/tweets", {
                    headers: this.auth(),
                    params: { ids: chunk.join(","), "tweet.fields": "id" },
                });
                (0, rateLimiter_1.afterCall)("lookup", res.headers);
                const data = res.data?.data;
                if (Array.isArray(data))
                    for (const t of data)
                        existing.add(t.id);
            }
            catch (err) {
                if (err?.response?.status === 429) {
                    (0, rateLimiter_1.record429)("lookup", err.response?.headers);
                }
                throw err;
            }
        }
        return existing;
    }
    async getMentions(userId, params) {
        await (0, rateLimiter_1.beforeCall)("mentions");
        try {
            const res = await axios_1.default.get(`https://api.twitter.com/2/users/${userId}/mentions`, { headers: this.auth(), params });
            (0, rateLimiter_1.afterCall)("mentions", res.headers);
            return res.data;
        }
        catch (err) {
            if (err?.response?.status === 429)
                (0, rateLimiter_1.record429)("mentions", err.response?.headers);
            throw err;
        }
    }
}
exports.TwitterService = TwitterService;
//# sourceMappingURL=twitterService.js.map