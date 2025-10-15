"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const lotteryController_1 = require("../controllers/lotteryController");
const rateLimiting_1 = require("../middleware/rateLimiting");
const validation_1 = require("../middleware/validation");
const adminProtection_1 = require("../middleware/adminProtection");
const lotteryClient_1 = require("../lotteryClient");
const rpcCache_1 = require("../utils/rpcCache");
const router = express_1.default.Router();
router.get("/prize-pool", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getPrizePool);
router.post("/rounds", (0, adminProtection_1.lotteryRoundProtection)(validation_1.createRoundSchema), lotteryController_1.lotteryController.createRound);
router.get("/rounds", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getAllRounds);
router.get("/rounds/active", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getActiveRound);
router.get("/rounds/:id", rateLimiting_1.publicDataRateLimit, (0, validation_1.validateParams)(validation_1.roundIdQuerySchema), lotteryController_1.lotteryController.getRoundById);
router.put("/funds-admin", (0, adminProtection_1.lotteryRoundProtection)(validation_1.setFundsAdminSchema), lotteryController_1.lotteryController.setFundsAdmin);
router.get("/funds-admin", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getFundsAdmin);
router.put("/draw-interval", (0, adminProtection_1.lotteryRoundProtection)(validation_1.setDrawIntervalSchema), lotteryController_1.lotteryController.setDrawInterval);
router.get("/draw-interval", rateLimiting_1.publicDataRateLimit, async (req, res) => {
    try {
        const { lotteryQueries } = await Promise.resolve().then(() => __importStar(require("../db/lotteryQueries")));
        const activeRound = await lotteryQueries.getActiveRound();
        if (!activeRound) {
            return res.status(404).json({
                success: false,
                message: "No active lottery round found",
            });
        }
        const drawInterval = await lotteryQueries.getDrawInterval(activeRound.id);
        return res.json({
            success: true,
            data: {
                round_id: activeRound.id,
                draw_interval_hours: drawInterval,
            },
        });
    }
    catch (error) {
        console.error("Error getting draw interval:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get draw interval",
        });
    }
});
router.get("/current-draw", async (req, res) => {
    try {
        const cacheKey = "current_draw_info";
        const cached = rpcCache_1.rpcCache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }
        const currentRoundBN = await lotteryClient_1.lottery.s_currentRound();
        const currentRound = Number(currentRoundBN);
        let drawNumber;
        let roundData = null;
        if (currentRound === 0) {
            drawNumber = 1;
        }
        else {
            try {
                roundData = await (0, lotteryClient_1.getRound)(currentRound);
                drawNumber = roundData.isCompleted ? currentRound + 1 : currentRound;
            }
            catch (error) {
                console.warn("Could not fetch round data, using fallback:", error);
                drawNumber = currentRound;
            }
        }
        const response = {
            success: true,
            data: {
                drawNumber,
                currentRound,
                roundData: roundData
                    ? {
                        isActive: roundData.isActive,
                        isCompleted: roundData.isCompleted,
                        start: roundData.start,
                        end: roundData.end,
                        winner: roundData.winner,
                        winningTokenId: roundData.winningTokenId,
                    }
                    : null,
            },
        };
        rpcCache_1.rpcCache.set(cacheKey, response, 30);
        return res.json(response);
    }
    catch (error) {
        console.error("Error fetching current draw:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to fetch current draw information",
            data: {
                drawNumber: 1,
                currentRound: 0,
                roundData: null,
            },
        });
    }
});
router.get("/payouts", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getPayoutHistory);
router.get("/payouts/:round_id", rateLimiting_1.publicDataRateLimit, (0, validation_1.validateParams)(validation_1.roundIdQuerySchema), lotteryController_1.lotteryController.getPayoutHistory);
router.get("/balance", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getContractBalance);
router.get("/winners", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getWinners);
router.get("/stats", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getLotteryStats);
router.get("/results", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getLotteryResults);
exports.default = router;
//# sourceMappingURL=lotteryRoutes.js.map