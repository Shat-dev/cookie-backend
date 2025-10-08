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

  // ✅ Create a new winner row
  async createWinner(
    drawNumber: number,
    winnerAddress: string,
    prizeAmount: string,
    tokenId: string,
    imageUrl: string
  ): Promise<Winner> {
    const result = await this.db.query(
      `
      INSERT INTO winners (draw_number, winner_address, prize_amount, token_id, image_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl]
    );
    return result.rows[0];
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
