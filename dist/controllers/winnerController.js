"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.winnerController = void 0;
const winnerRepository_1 = require("../db/winnerRepository");
const winnerRepo = new winnerRepository_1.WinnerRepository();
exports.winnerController = {
    async getPreviousWinners(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const winners = await winnerRepo.getRecentWinners(limit);
            const response = {
                success: true,
                data: winners,
            };
            res.json(response);
        }
        catch (error) {
            console.error("Error fetching previous winners:", error);
            const response = {
                success: false,
                error: "Failed to fetch previous winners",
            };
            res.status(500).json(response);
        }
    },
    async createWinner(req, res) {
        try {
            const { drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl } = req.body;
            if (!drawNumber ||
                !winnerAddress ||
                !prizeAmount ||
                !tokenId ||
                !imageUrl) {
                const response = {
                    success: false,
                    error: "All fields are required: drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl",
                };
                res.status(400).json(response);
                return;
            }
            const newWinner = await winnerRepo.createWinner(drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl);
            const response = {
                success: true,
                data: newWinner,
            };
            res.status(201).json(response);
        }
        catch (error) {
            console.error("Error creating winner:", error);
            const response = {
                success: false,
                error: "Failed to create winner",
            };
            res.status(500).json(response);
        }
    },
};
//# sourceMappingURL=winnerController.js.map