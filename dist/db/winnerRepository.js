"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WinnerRepository = void 0;
const connection_1 = __importDefault(require("./connection"));
class WinnerRepository {
    constructor(db = connection_1.default) {
        this.db = db;
    }
    async getRecentWinners(limit = 10) {
        const result = await this.db.query(`SELECT * FROM winners ORDER BY created_at DESC LIMIT $1`, [limit]);
        return result.rows;
    }
    async createWinner(drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl, payoutAmount, payoutStatus = "pending", payoutFailureReason) {
        const result = await this.db.query(`
      INSERT INTO winners (draw_number, winner_address, prize_amount, token_id, image_url, 
                          payout_amount, payout_status, payout_failure_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `, [
            drawNumber,
            winnerAddress,
            prizeAmount,
            tokenId,
            imageUrl,
            payoutAmount,
            payoutStatus,
            payoutFailureReason,
        ]);
        return result.rows[0];
    }
    async updatePayoutStatus(winnerId, status, payoutAmount, failureReason) {
        const result = await this.db.query(`
      UPDATE winners 
      SET payout_status = $2, payout_amount = $3, payout_failure_reason = $4
      WHERE id = $1
      RETURNING *
      `, [winnerId, status, payoutAmount, failureReason]);
        return result.rows[0] || null;
    }
    async getPayoutsByStatus(status, limit = 50) {
        const result = await this.db.query(`SELECT * FROM winners WHERE payout_status = $1 ORDER BY created_at DESC LIMIT $2`, [status, limit]);
        return result.rows;
    }
    async getFailedPayouts(limit = 50) {
        const result = await this.db.query(`SELECT * FROM winners WHERE payout_status = 'failed' ORDER BY created_at DESC LIMIT $1`, [limit]);
        return result.rows;
    }
    async getWinnersByDraw(drawNumber) {
        const result = await this.db.query(`SELECT * FROM winners WHERE draw_number = $1 ORDER BY created_at ASC`, [drawNumber]);
        return result.rows;
    }
    async deleteWinnersByDraw(drawNumber) {
        await this.db.query(`DELETE FROM winners WHERE draw_number = $1`, [
            drawNumber,
        ]);
    }
    async getAllDrawNumbers() {
        const result = await this.db.query(`SELECT DISTINCT draw_number FROM winners ORDER BY draw_number DESC`);
        return result.rows.map((row) => row.draw_number);
    }
}
exports.WinnerRepository = WinnerRepository;
//# sourceMappingURL=winnerRepository.js.map