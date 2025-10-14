"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollMentions = pollMentions;
const dotenv_1 = __importDefault(require("dotenv"));
const entryRepository_1 = require("../db/entryRepository");
const connection_1 = __importDefault(require("../db/connection"));
const appStateRepository_1 = require("../db/appStateRepository");
const ownershipUtils_1 = require("../utils/ownershipUtils");
const twitterService_1 = require("./twitterService");
const schedulerRepository_1 = require("../db/schedulerRepository");
dotenv_1.default.config();
const COOKIE_USER_ID = process.env.X_USER_ID;
if (!COOKIE_USER_ID)
    throw new Error("X_USER_ID is missing");
const tw = new twitterService_1.TwitterService();
const contract = (0, ownershipUtils_1.getCookieContract)();
const ID_PREFIX = 1n << 255n;
const encodeId = (n) => (n | ID_PREFIX).toString();
const isEncoded = (n) => n >= ID_PREFIX;
const decodeId = (n) => (isEncoded(n) ? n - ID_PREFIX : n);
const STATE_KEY_LAST_MENTION = "last_processed_mention_id";
const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
async function pollMentions() {
    const startTime = Date.now();
    try {
        const sinceId = await stateRepo.get(STATE_KEY_LAST_MENTION);
        const params = {
            "tweet.fields": "created_at,text",
            max_results: 10,
        };
        if (sinceId)
            params.since_id = sinceId;
        const resp = await tw.getMentions(COOKIE_USER_ID, params);
        const tweets = resp?.data ?? [];
        if (!tweets.length) {
            const duration = Date.now() - startTime;
            await schedulerRepository_1.schedulerRepository.updateHeartbeat("twitterPoller", duration);
            return;
        }
        tweets.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
        let maxId = sinceId ? BigInt(sinceId) : 0n;
        let processed = 0;
        for (const tweet of tweets) {
            const rawText = String(tweet.text ?? "");
            const tweetText = rawText.replace(/\s+/g, " ").trim();
            const tweetId = tweet.id;
            const tweetUrl = `https://x.com/i/web/status/${tweetId}`;
            const tid = BigInt(tweetId);
            if (tid > maxId)
                maxId = tid;
            const tokenMatch = tweetText.match(/\bCookie\s+(\d{1,7})\b/i);
            if (!tokenMatch)
                continue;
            const humanIdStr = tokenMatch[1];
            const humanId = BigInt(humanIdStr);
            let walletAddress = null;
            try {
                walletAddress = await contract.ownerOf(encodeId(humanId));
            }
            catch {
                try {
                    walletAddress = await contract.ownerOf(humanId);
                }
                catch {
                    continue;
                }
            }
            if (!walletAddress)
                continue;
            const normalizedWallet = walletAddress.toLowerCase();
            let encodedOwned;
            try {
                encodedOwned = await contract.owned(normalizedWallet);
            }
            catch {
                continue;
            }
            if (!encodedOwned?.length)
                continue;
            const decodedOwnedStrings = encodedOwned
                .map((raw) => decodeId(raw))
                .map((bi) => bi.toString());
            const uniqueDecoded = Array.from(new Set(decodedOwnedStrings));
            await entryRepository_1.entryRepository.upsertManyTokenEntries({
                tweet_id: tweetId,
                wallet_address: normalizedWallet,
                token_ids: uniqueDecoded,
                tweet_url: tweetUrl,
                verified: true,
            });
            processed++;
        }
        await stateRepo.set(STATE_KEY_LAST_MENTION, maxId.toString());
        const duration = Date.now() - startTime;
        await schedulerRepository_1.schedulerRepository.updateHeartbeat("twitterPoller", duration);
        console.log(`🟢 pollMentions: processed ${processed}/${tweets.length} new mention(s) in ${duration}ms`);
    }
    catch (err) {
        await schedulerRepository_1.schedulerRepository.recordError("twitterPoller");
        console.error("❌ Failed to poll mentions:", err?.response?.data || err?.message || err);
    }
}
if (require.main === module) {
    let isRunning = false;
    const tick = async () => {
        if (isRunning)
            return;
        isRunning = true;
        try {
            await pollMentions();
        }
        catch (e) {
            console.error("❌ pollMentions tick failed:", e?.message || e);
        }
        finally {
            isRunning = false;
        }
    };
    void tick();
    setInterval(tick, 120000);
    console.log("🔄 Standalone twitterPoller started");
}
//# sourceMappingURL=twitterPoller.js.map