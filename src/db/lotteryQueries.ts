import pool from "./connection";
import {
  LotteryRound,
  LotteryEntry,
  LotteryWinner,
  LotteryStats,
} from "../types/lottery";

export const lotteryQueries = {
  // Lottery Rounds
  async createRound(
    roundNumber: number,
    startTime: Date,
    endTime?: Date
  ): Promise<LotteryRound> {
    const query = `
      INSERT INTO lottery_rounds (round_number, start_time, end_time)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [roundNumber, startTime, endTime];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async getRound(roundId: number): Promise<LotteryRound | null> {
    const query = "SELECT * FROM lottery_rounds WHERE id = $1";
    const result = await pool.query(query, [roundId]);
    return result.rows[0] || null;
  },

  async getRoundByNumber(roundNumber: number): Promise<LotteryRound | null> {
    const query = "SELECT * FROM lottery_rounds WHERE round_number = $1";
    const result = await pool.query(query, [roundNumber]);
    return result.rows[0] || null;
  },

  async getActiveRound(): Promise<LotteryRound | null> {
    const query =
      "SELECT * FROM lottery_rounds WHERE status = $1 ORDER BY round_number DESC LIMIT 1";
    const result = await pool.query(query, ["active"]);
    return result.rows[0] || null;
  },

  async getAllRounds(): Promise<LotteryRound[]> {
    const query = "SELECT * FROM lottery_rounds ORDER BY round_number DESC";
    const result = await pool.query(query);
    return result.rows;
  },

  async updateRoundStatus(
    roundId: number,
    status: string,
    winnerAddress?: string,
    winnerTokenId?: string
  ): Promise<void> {
    const query = `
      UPDATE lottery_rounds 
      SET status = $2, winner_address = $3, winner_token_id = $4, draw_time = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    await pool.query(query, [roundId, status, winnerAddress, winnerTokenId]);
  },

  async getNextRoundNumber(): Promise<number> {
    const query =
      "SELECT COALESCE(MAX(round_number), 0) + 1 as next_round FROM lottery_rounds";
    const result = await pool.query(query);
    return parseInt(result.rows[0].next_round);
  },

  // Lottery Entries
  async addEntry(
    roundId: number,
    walletAddress: string,
    tokenId: string,
    imageUrl: string,
    tweetUrl?: string
  ): Promise<LotteryEntry> {
    const query = `
      INSERT INTO lottery_entries (round_id, wallet_address, token_id, image_url, tweet_url, verified)
      VALUES ($1, $2, $3, $4, $5, true)
      ON CONFLICT (round_id, wallet_address, token_id) DO NOTHING
      RETURNING *
    `;
    const values = [roundId, walletAddress, tokenId, imageUrl, tweetUrl];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async getRoundEntries(roundId: number): Promise<LotteryEntry[]> {
    const query =
      "SELECT * FROM lottery_entries WHERE round_id = $1 ORDER BY created_at ASC";
    const result = await pool.query(query, [roundId]);
    return result.rows;
  },

  async getEntry(
    roundId: number,
    walletAddress: string,
    tokenId: string
  ): Promise<LotteryEntry | null> {
    const query =
      "SELECT * FROM lottery_entries WHERE round_id = $1 AND wallet_address = $2 AND token_id = $3";
    const result = await pool.query(query, [roundId, walletAddress, tokenId]);
    return result.rows[0] || null;
  },

  async removeEntry(
    roundId: number,
    walletAddress: string,
    tokenId: string
  ): Promise<void> {
    const query =
      "DELETE FROM lottery_entries WHERE round_id = $1 AND wallet_address = $2 AND token_id = $3";
    await pool.query(query, [roundId, walletAddress, tokenId]);
  },

  // Lottery Winners
  async addWinner(
    roundId: number,
    walletAddress: string,
    tokenId: string,
    imageUrl: string,
    prizeAmount?: string
  ): Promise<LotteryWinner> {
    const query = `
      INSERT INTO lottery_winners (round_id, wallet_address, token_id, image_url, prize_amount)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [roundId, walletAddress, tokenId, imageUrl, prizeAmount];
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  async getWinners(limit: number = 10): Promise<LotteryWinner[]> {
    const query =
      "SELECT * FROM lottery_winners ORDER BY created_at DESC LIMIT $1";
    const result = await pool.query(query, [limit]);
    return result.rows;
  },

  async getRoundWinner(roundId: number): Promise<LotteryWinner | null> {
    const query = "SELECT * FROM lottery_winners WHERE round_id = $1";
    const result = await pool.query(query, [roundId]);
    return result.rows[0] || null;
  },

  // Lottery Stats
  async getLotteryStats(): Promise<LotteryStats> {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_rounds,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_rounds,
        (SELECT COUNT(*) FROM lottery_winners) as total_winners,
        (SELECT COUNT(*) FROM lottery_entries) as total_entries
      FROM lottery_rounds
    `;

    const currentRoundQuery =
      "SELECT * FROM lottery_rounds WHERE status = $1 ORDER BY round_number DESC LIMIT 1";

    const [statsResult, currentRoundResult] = await Promise.all([
      pool.query(statsQuery),
      pool.query(currentRoundQuery, ["active"]),
    ]);

    return {
      total_rounds: parseInt(statsResult.rows[0].total_rounds),
      active_rounds: parseInt(statsResult.rows[0].active_rounds),
      total_winners: parseInt(statsResult.rows[0].total_winners),
      total_entries: parseInt(statsResult.rows[0].total_entries),
      current_round: currentRoundResult.rows[0] || undefined,
    };
  },

  // Sync entries from current pool
  async syncEntriesFromCurrentPool(roundId: number): Promise<number> {
    // Get all verified entries from the current pool
    const currentPoolQuery = `
      SELECT DISTINCT wallet_address, token_id, image_url, tweet_url
      FROM entries 
      WHERE verified = true
    `;

    const currentPoolResult = await pool.query(currentPoolQuery);
    let syncedCount = 0;

    for (const entry of currentPoolResult.rows) {
      try {
        await this.addEntry(
          roundId,
          entry.wallet_address,
          entry.token_id,
          entry.image_url,
          entry.tweet_url
        );
        syncedCount++;
      } catch (error) {
        console.error(
          `Failed to sync entry: ${entry.wallet_address} - ${entry.token_id}`,
          error
        );
      }
    }

    return syncedCount;
  },
};
