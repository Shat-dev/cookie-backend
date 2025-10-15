import pool from "./connection";
import { Winner } from "../types";

export class WinnerRepository {
  constructor(private readonly db = pool) {}

  // ✅ Fetch the most recent winners (default: 10)
  async getRecentWinners(limit: number = 10): Promise<Winner[]> {
    const result = await this.db.query(
      `SELECT * FROM winners ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // ✅ Create a new winner row - Updated to include payout information
  async createWinner(
    drawNumber: number,
    winnerAddress: string,
    prizeAmount: string,
    tokenId: string,
    imageUrl: string,
    payoutAmount?: string,
    payoutStatus: "pending" | "success" | "failed" = "pending",
    payoutFailureReason?: string
  ): Promise<Winner> {
    const result = await this.db.query(
      `
      INSERT INTO winners (draw_number, winner_address, prize_amount, token_id, image_url, 
                          payout_amount, payout_status, payout_failure_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [
        drawNumber,
        winnerAddress,
        prizeAmount,
        tokenId,
        imageUrl,
        payoutAmount,
        payoutStatus,
        payoutFailureReason,
      ]
    );
    return result.rows[0];
  }

  // ✅ Update payout status for a winner
  async updatePayoutStatus(
    winnerId: number,
    status: "pending" | "success" | "failed",
    payoutAmount?: string,
    failureReason?: string
  ): Promise<Winner | null> {
    const result = await this.db.query(
      `
      UPDATE winners 
      SET payout_status = $2, payout_amount = $3, payout_failure_reason = $4
      WHERE id = $1
      RETURNING *
      `,
      [winnerId, status, payoutAmount, failureReason]
    );
    return result.rows[0] || null;
  }

  // ✅ Get payouts by status
  async getPayoutsByStatus(
    status: "pending" | "success" | "failed",
    limit: number = 50
  ): Promise<Winner[]> {
    const result = await this.db.query(
      `SELECT * FROM winners WHERE payout_status = $1 ORDER BY created_at DESC LIMIT $2`,
      [status, limit]
    );
    return result.rows;
  }

  // ✅ Get failed payouts specifically
  async getFailedPayouts(limit: number = 50): Promise<Winner[]> {
    const result = await this.db.query(
      `SELECT * FROM winners WHERE payout_status = 'failed' ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // ✅ (Optional) Get all winners for a specific draw
  async getWinnersByDraw(drawNumber: number): Promise<Winner[]> {
    const result = await this.db.query(
      `SELECT * FROM winners WHERE draw_number = $1 ORDER BY created_at ASC`,
      [drawNumber]
    );
    return result.rows;
  }

  // ✅ (Optional) Delete all winners for a draw — e.g. reset a round
  async deleteWinnersByDraw(drawNumber: number): Promise<void> {
    await this.db.query(`DELETE FROM winners WHERE draw_number = $1`, [
      drawNumber,
    ]);
  }

  // ✅ (Optional) Fetch distinct draw numbers
  async getAllDrawNumbers(): Promise<number[]> {
    const result = await this.db.query(
      `SELECT DISTINCT draw_number FROM winners ORDER BY draw_number DESC`
    );
    return result.rows.map((row) => row.draw_number);
  }
}
