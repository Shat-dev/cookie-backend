"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.entryRepository = exports.EntryRepository = void 0;
const connection_1 = __importDefault(require("./connection"));
const ethers_1 = require("ethers");
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const contract_address_json_1 = __importDefault(require("../constants/contract-address.json"));
const rpcProvider_1 = require("../utils/rpcProvider");
dotenv_1.default.config();
const provider = rpcProvider_1.robustRpcProvider.getProvider();
const cookieABI = require("../constants/CookieABI.json");
const contract = new ethers_1.ethers.Contract(contract_address_json_1.default.Cookie, Array.isArray(cookieABI) ? cookieABI : cookieABI?.abi ?? cookieABI?.default, provider);
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
class EntryRepository {
    constructor(db = connection_1.default) {
        this.db = db;
    }
    async getAllEntries() {
        const result = await this.db.query(`SELECT id, tweet_id, LOWER(wallet_address) AS wallet_address, token_id, image_url, verified, tweet_url,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
       FROM entries
       ORDER BY created_at DESC`);
        return result.rows;
    }
    async upsertTokenEntry(entry) {
        const { tweet_id, wallet_address, token_id, tweet_url, image_url = null, verified = true, } = entry;
        await this.db.query(`
      INSERT INTO entries (tweet_id, wallet_address, token_id, image_url, verified, tweet_url)
      VALUES ($1, LOWER($2), $3, $4, $5, $6)
      ON CONFLICT (tweet_id, token_id)
      DO UPDATE SET
        wallet_address = EXCLUDED.wallet_address,
        image_url      = COALESCE(EXCLUDED.image_url, entries.image_url),
        verified       = COALESCE(EXCLUDED.verified, entries.verified),
        tweet_url      = EXCLUDED.tweet_url
      `, [tweet_id, wallet_address, token_id, image_url, verified, tweet_url]);
    }
    async upsertManyTokenEntries(args) {
        const { tweet_id, wallet_address, token_ids, tweet_url, imageUrlForToken, verified = true, } = args;
        for (const token_id of token_ids) {
            const image_url = imageUrlForToken ? imageUrlForToken(token_id) : null;
            await this.upsertTokenEntry({
                tweet_id,
                wallet_address,
                token_id,
                tweet_url,
                image_url,
                verified,
            });
        }
    }
    async deleteEntriesByTweetId(tweetId) {
        console.warn(`🔍 [DELETION AUDIT] Attempting to delete ALL entries for tweet_id: ${tweetId}`);
        const countResult = await this.db.query("SELECT COUNT(*) as count FROM entries WHERE tweet_id = $1", [tweetId]);
        const entriesToDelete = parseInt(countResult.rows[0].count);
        if (entriesToDelete === 0) {
            console.log(`[DELETION AUDIT] No entries found for tweet_id: ${tweetId}`);
            return;
        }
        console.warn(`🚨 [DELETION AUDIT] About to delete ${entriesToDelete} entries for tweet_id: ${tweetId}`);
        const result = await this.db.query("DELETE FROM entries WHERE tweet_id = $1 RETURNING pushed_round", [tweetId]);
        const pushedRounds = result.rows
            .map((row) => row.pushed_round)
            .filter((round) => round !== null);
        const uniqueRounds = Array.from(new Set(pushedRounds));
        console.warn(`🗑️  [DELETION AUDIT] COMPLETED: Deleted ${result.rowCount} entries for tweet_id: ${tweetId}`);
        if (uniqueRounds.length > 0) {
            console.warn(`📊 [DELETION AUDIT] Affected pushed rounds: ${uniqueRounds.join(", ")}`);
        }
        if (uniqueRounds.length > 0) {
            console.log(`⚠️ Deleted entries were already pushed to rounds: ${uniqueRounds.join(", ")}. This may affect on-chain state consistency.`);
        }
    }
    async doesTweetStillExist(tweetId) {
        try {
            const res = await axios_1.default.get(`https://api.twitter.com/2/tweets/${tweetId}`, { headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` } });
            return !!res.data?.data;
        }
        catch (err) {
            if (err.response?.status === 404)
                return false;
            console.error("⚠️ Tweet check failed:", err.message);
            return true;
        }
    }
    async getTokenIdsOwnedBy(walletAddress) {
        const transferTopic = ethers_1.ethers.id("Transfer(address,address,uint256)");
        const topicWallet = ethers_1.ethers.zeroPadValue(walletAddress, 32);
        const logs = await provider.getLogs({
            address: contract.target,
            fromBlock: 0,
            toBlock: "latest",
            topics: [transferTopic, null, topicWallet],
        });
        const tokenIds = logs.map((log) => ethers_1.ethers.AbiCoder.defaultAbiCoder()
            .decode(["address", "address", "uint256"], log.data)[2]
            .toString());
        const ownedTokenIds = [];
        for (const tokenId of tokenIds) {
            try {
                const owner = await contract.ownerOf(tokenId);
                if (owner.toLowerCase() === walletAddress.toLowerCase()) {
                    ownedTokenIds.push(tokenId);
                }
            }
            catch { }
        }
        return [...new Set(ownedTokenIds)];
    }
    async selectUnpushed(limit) {
        let query = `
      SELECT id, tweet_id, LOWER(wallet_address) AS wallet_address, token_id, image_url, verified, tweet_url,
             to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
             pushed_round, pushed_tx, 
             to_char(pushed_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as pushed_at
      FROM entries
      WHERE pushed_round IS NULL AND verified = true
      ORDER BY created_at ASC
    `;
        if (limit && limit > 0)
            query += ` LIMIT ${limit}`;
        const result = await this.db.query(query);
        return result.rows;
    }
    async markPushed(entryIds, round, txHash) {
        if (entryIds.length === 0)
            return;
        const placeholders = entryIds.map((_, i) => `$${i + 4}`).join(", ");
        const query = `
      UPDATE entries
      SET pushed_round = $1, pushed_tx = $2, pushed_at = $3
      WHERE id IN (${placeholders})
    `;
        await this.db.query(query, [round, txHash, new Date(), ...entryIds]);
    }
    async countUnpushed() {
        const result = await this.db.query(`SELECT COUNT(*) as count FROM entries WHERE pushed_round IS NULL AND verified = true`);
        return parseInt(result.rows[0].count, 10);
    }
    async clearAllEntries() {
        const result = await this.db.query(`UPDATE entries 
       SET pushed_round = NULL, pushed_tx = NULL, pushed_at = NULL 
       WHERE verified = true AND pushed_round IS NOT NULL
       RETURNING id`);
        const resetCount = result.rows.length;
        console.log(`🔄 Reset ${resetCount} entries to unpushed status for next round`);
        return resetCount;
    }
    async selectEligiblePool() {
        const result = await this.db.query(`
      SELECT
        LOWER(wallet_address) AS wallet_address,
        token_id,
        tweet_id,
        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
        tweet_url
      FROM entries
      WHERE verified = true
      ORDER BY
        created_at ASC,
        CASE WHEN tweet_id ~ '^[0-9]+$' THEN tweet_id::numeric END ASC NULLS LAST,
        CASE WHEN token_id ~ '^[0-9]+$' THEN token_id::numeric END ASC NULLS LAST
      `);
        return result.rows;
    }
    async getDistinctTweetIds(limit = 100) {
        const { rows } = await this.db.query(`
      SELECT tweet_id
      FROM (
        SELECT tweet_id, MAX(created_at) AS latest
        FROM entries
        GROUP BY tweet_id
      ) t
      ORDER BY latest DESC
      LIMIT $1
      `, [limit]);
        return rows.map((r) => r.tweet_id);
    }
    async countDistinctTweetIds() {
        const { rows } = await this.db.query(`SELECT COUNT(DISTINCT tweet_id) AS n FROM entries`);
        return Number(rows[0]?.n ?? 0);
    }
    async poolIsNonEmpty() {
        const q = await this.db.query(`SELECT EXISTS (SELECT 1 FROM entries WHERE verified = true) AS ok`);
        return Boolean(q.rows?.[0]?.ok);
    }
    async upsertMissingTokensForTweet(args) {
        const { tweet_id, wallet_address, tweet_url, token_ids, imageUrlForToken, verified = true, } = args;
        if (!token_ids?.length)
            return 0;
        let inserted = 0;
        for (const token_id of token_ids) {
            const image_url = imageUrlForToken ? imageUrlForToken(token_id) : null;
            const res = await this.db.query(`
        INSERT INTO entries (tweet_id, wallet_address, token_id, image_url, verified, tweet_url)
        VALUES ($1, LOWER($2), $3, $4, $5, $6)
        ON CONFLICT (tweet_id, token_id) DO NOTHING
        RETURNING id
        `, [tweet_id, wallet_address, token_id, image_url, verified, tweet_url]);
            if (res.rowCount && res.rowCount > 0)
                inserted += res.rowCount;
        }
        return inserted;
    }
}
exports.EntryRepository = EntryRepository;
exports.entryRepository = new EntryRepository();
//# sourceMappingURL=entryRepository.js.map