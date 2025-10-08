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
    async createWinner(drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl) {
        const result = await this.db.query(`
      INSERT INTO winners (draw_number, winner_address, prize_amount, token_id, image_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `, [drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl]);
        return result.rows[0];
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