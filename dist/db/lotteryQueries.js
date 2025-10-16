"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotteryQueries = void 0;
const connection_1 = __importDefault(require("./connection"));
exports.lotteryQueries = {
    async createRound(roundNumber) {
        const query = `
      INSERT INTO lottery_rounds (round_number, status, total_entries)
      VALUES ($1, 'active', 0)
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [roundNumber]);
        return result.rows[0];
    },
    async getRound(roundId) {
        const query = "SELECT * FROM lottery_rounds WHERE id = $1";
        const result = await connection_1.default.query(query, [roundId]);
        return result.rows[0] || null;
    },
    async getRoundByNumber(roundNumber) {
        const query = "SELECT * FROM lottery_rounds WHERE round_number = $1";
        const result = await connection_1.default.query(query, [roundNumber]);
        return result.rows[0] || null;
    },
    async getActiveRound() {
        const query = `
      SELECT * FROM lottery_rounds
      WHERE status = 'active'
      ORDER BY round_number DESC
      LIMIT 1
    `;
        const result = await connection_1.default.query(query);
        return result.rows[0] || null;
    },
    async getAllRounds() {
        const query = "SELECT * FROM lottery_rounds ORDER BY round_number DESC";
        const result = await connection_1.default.query(query);
        return result.rows;
    },
    async getNextRoundNumber() {
        const query = `
      SELECT COALESCE(MAX(round_number), 0) + 1 AS next_round
      FROM lottery_rounds
    `;
        const result = await connection_1.default.query(query);
        return parseInt(result.rows[0].next_round);
    },
    async completeRound(roundId, winnerAddress, winnerTokenId) {
        const query = `
      UPDATE lottery_rounds
      SET status = 'completed',
          winner_address = $2,
          winner_token_id = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await connection_1.default.query(query, [roundId, winnerAddress, winnerTokenId]);
    },
    async recordFailedDraw(roundId, reason) {
        const query = `
      UPDATE lottery_rounds
      SET status = 'completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await connection_1.default.query(query, [roundId]);
        console.log(`⚠️  Failed draw recorded for round ${roundId}: ${reason}`);
    },
    async addEntry(roundId, walletAddress, tokenId, imageUrl, tweetUrl) {
        const query = `
      INSERT INTO lottery_entries (
        round_id, wallet_address, token_id, image_url, tweet_url, verified
      )
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (round_id, wallet_address, token_id) DO NOTHING
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [
            roundId,
            walletAddress,
            tokenId,
            imageUrl,
            tweetUrl,
        ]);
        return result.rows[0];
    },
    async getRoundEntries(roundId) {
        const query = `
      SELECT * FROM lottery_entries
      WHERE round_id = $1
      ORDER BY created_at ASC
    `;
        const result = await connection_1.default.query(query, [roundId]);
        return result.rows;
    },
    async getEntry(roundId, walletAddress, tokenId) {
        const query = `
      SELECT * FROM lottery_entries
      WHERE round_id = $1 AND wallet_address = $2 AND token_id = $3
    `;
        const result = await connection_1.default.query(query, [roundId, walletAddress, tokenId]);
        return result.rows[0] || null;
    },
    async removeEntry(roundId, walletAddress, tokenId) {
        const query = `
      DELETE FROM lottery_entries
      WHERE round_id = $1 AND wallet_address = $2 AND token_id = $3
    `;
        await connection_1.default.query(query, [roundId, walletAddress, tokenId]);
    },
    async addWinner(roundId, walletAddress, tokenId, imageUrl, prizeAmount, payoutAmount, payoutStatus = "pending") {
        const query = `
      INSERT INTO lottery_winners (
        round_id, wallet_address, token_id, image_url,
        prize_amount, payout_amount, payout_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [
            roundId,
            walletAddress,
            tokenId,
            imageUrl,
            prizeAmount,
            payoutAmount,
            payoutStatus,
        ]);
        return result.rows[0];
    },
    async updatePayoutStatus(winnerId, status, failureReason) {
        const query = `
      UPDATE lottery_winners
      SET payout_status = $2,
          payout_failure_reason = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await connection_1.default.query(query, [winnerId, status, failureReason || null]);
    },
    async recordPayout(winnerId, amount) {
        const query = `
      UPDATE lottery_winners
      SET payout_amount = $2,
          payout_status = 'success',
          payout_failure_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await connection_1.default.query(query, [winnerId, amount]);
    },
    async getPayoutHistory(limit = 50) {
        const query = `
      SELECT lw.*, lr.round_number
      FROM lottery_winners lw
      JOIN lottery_rounds lr ON lw.round_id = lr.id
      ORDER BY lw.created_at DESC
      LIMIT $1
    `;
        const result = await connection_1.default.query(query, [limit]);
        return result.rows;
    },
    async getRoundWinner(roundId) {
        const query = `
      SELECT * FROM lottery_winners
      WHERE round_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;
        const result = await connection_1.default.query(query, [roundId]);
        return result.rows[0] || null;
    },
    async getRecentWinners(limit = 10) {
        const query = `
      SELECT lw.*, lr.round_number
      FROM lottery_winners lw
      JOIN lottery_rounds lr ON lw.round_id = lr.id
      ORDER BY lw.created_at DESC
      LIMIT $1
    `;
        const result = await connection_1.default.query(query, [limit]);
        return result.rows;
    },
    async getLotteryStats() {
        const statsQuery = `
      SELECT 
        COUNT(*) AS total_rounds,
        COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_rounds,
        (SELECT COUNT(*) FROM lottery_winners) AS total_winners,
        (SELECT COUNT(*) FROM lottery_entries) AS total_entries
      FROM lottery_rounds
    `;
        const currentRoundQuery = `
      SELECT * FROM lottery_rounds
      WHERE status = 'active'
      ORDER BY round_number DESC
      LIMIT 1
    `;
        const [statsResult, currentRoundResult] = await Promise.all([
            connection_1.default.query(statsQuery),
            connection_1.default.query(currentRoundQuery),
        ]);
        return {
            total_rounds: parseInt(statsResult.rows[0].total_rounds),
            active_rounds: parseInt(statsResult.rows[0].active_rounds),
            total_winners: parseInt(statsResult.rows[0].total_winners),
            total_entries: parseInt(statsResult.rows[0].total_entries),
            current_round: currentRoundResult.rows[0] || undefined,
        };
    },
    async syncEntriesFromCurrentPool(roundId) {
        const currentPoolQuery = `
      SELECT DISTINCT wallet_address, token_id, image_url, tweet_url
      FROM entries
      WHERE verified = true
    `;
        const currentPoolResult = await connection_1.default.query(currentPoolQuery);
        let syncedCount = 0;
        for (const entry of currentPoolResult.rows) {
            try {
                await this.addEntry(roundId, entry.wallet_address, entry.token_id, entry.image_url, entry.tweet_url);
                syncedCount++;
            }
            catch (error) {
                console.error(`❌ Failed to sync entry ${entry.wallet_address} - ${entry.token_id}`, error);
            }
        }
        return syncedCount;
    },
    async updateFundsAdmin(roundId, fundsAdminAddress) {
        const query = `
      UPDATE lottery_rounds
      SET funds_admin_address = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
        await connection_1.default.query(query, [roundId, fundsAdminAddress]);
    },
    async getFundsAdmin(roundId) {
        const query = `
      SELECT funds_admin_address
      FROM lottery_rounds
      WHERE id = $1
    `;
        const result = await connection_1.default.query(query, [roundId]);
        return result.rows[0]?.funds_admin_address || null;
    },
    async getWinners(limit = 10) {
        return this.getRecentWinners(limit);
    },
};
//# sourceMappingURL=lotteryQueries.js.map