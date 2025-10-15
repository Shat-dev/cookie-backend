"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.winnerController = void 0;
const winnerRepository_1 = require("../db/winnerRepository");
const auditLogger_1 = require("../utils/auditLogger");
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
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch previous winners");
            console.error("Error fetching previous winners:", logDetails);
            const response = (0, auditLogger_1.createErrorResponse)(error, "Failed to fetch previous winners");
            res.status(500).json(response);
        }
    },
    async createWinner(req, res) {
        const startTime = auditLogger_1.auditLogger.startTimer();
        try {
            const { drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl } = req.body;
            (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.CREATE_WINNER, req, {
                drawNumber,
                winnerAddress,
                prizeAmount,
                tokenId,
                imageUrl,
            });
            if (!drawNumber ||
                !winnerAddress ||
                !prizeAmount ||
                !tokenId ||
                !imageUrl) {
                const errorMsg = "All fields are required: drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl";
                (0, auditLogger_1.auditFailure)(auditLogger_1.AuditActionType.CREATE_WINNER, req, errorMsg, {
                    drawNumber: !!drawNumber,
                    winnerAddress: !!winnerAddress,
                    prizeAmount: !!prizeAmount,
                    tokenId: !!tokenId,
                    imageUrl: !!imageUrl,
                }, startTime);
                const response = {
                    success: false,
                    error: errorMsg,
                };
                res.status(400).json(response);
                return;
            }
            const newWinner = await winnerRepo.createWinner(drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl);
            (0, auditLogger_1.auditSuccess)(auditLogger_1.AuditActionType.CREATE_WINNER, req, {
                winnerId: newWinner.id,
                drawNumber,
                winnerAddress,
                prizeAmount,
                tokenId,
                created: true,
            }, startTime);
            const response = {
                success: true,
                data: newWinner,
            };
            res.status(201).json(response);
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to create winner");
            console.error("Error creating winner:", logDetails);
            (0, auditLogger_1.auditFailure)(auditLogger_1.AuditActionType.CREATE_WINNER, req, logDetails.message || "Unknown error", {
                error: logDetails.message,
                stack: logDetails.stack?.split("\n")?.[0],
            }, startTime);
            const response = (0, auditLogger_1.createErrorResponse)(error, "Failed to create winner");
            res.status(500).json(response);
        }
    },
};
//# sourceMappingURL=winnerController.js.map