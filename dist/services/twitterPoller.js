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
dotenv_1.default.config();
const COOKIE_USER_ID = process.env.X_USER_ID;
const tw = new twitterService_1.TwitterService();
const contract = (0, ownershipUtils_1.getCookieContract)();
const ID_PREFIX = 1n << 255n;
const encodeId = (n) => (n | ID_PREFIX).toString();
const isEncoded = (n) => n >= ID_PREFIX;
const decodeId = (n) => (isEncoded(n) ? n - ID_PREFIX : n);
const STATE_KEY_LAST_MENTION = "last_processed_mention_id";
const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
async function pollMentions() {
    console.log(`🐦 [twitterPoller] Starting pollMentions...`);
    try {
        const sinceId = await stateRepo.get(STATE_KEY_LAST_MENTION);
        console.log(`🐦 [twitterPoller] sinceId: ${sinceId || "none"}`);
        const params = {
            "tweet.fields": "created_at,text",
            max_results: 10,
        };
        if (sinceId)
            params.since_id = sinceId;
        const resp = await tw.getMentions(COOKIE_USER_ID, params);
        const tweets = resp?.data ?? [];
        if (!tweets.length) {
            console.log(`🐦 [twitterPoller] No new mentions since ${sinceId || "beginning"}`);
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
            if (tid > maxId)
                maxId = tid;
            const tokenMatch = tweetText.match(/\bCookie\s+(\d{1,7})\b/i);
            if (!tokenMatch)
                continue;
            const humanId = BigInt(tokenMatch[1]);
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
            const decodedOwnedStrings = encodedOwned.map((raw) => decodeId(raw).toString());
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
        console.log(`🟢 pollMentions: processed ${processed}/${tweets.length}`);
    }
    catch (err) {
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
    setInterval(tick, 15000);
}
//# sourceMappingURL=twitterPoller.js.map