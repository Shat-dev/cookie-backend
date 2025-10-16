import express from "express";
import { lotteryController } from "../controllers/lotteryController";
import { publicDataRateLimit } from "../middleware/rateLimiting";
import {
  validateParams,
  validateBody,
  createRoundSchema,
  drawWinnerSchema,
  roundIdQuerySchema,
  setFundsAdminSchema,
  setDrawIntervalSchema,
} from "../middleware/validation";
import {
  lotteryRoundProtection,
  winnerDrawProtection,
  dataSyncProtection,
} from "../middleware/adminProtection";
import { Request, Response } from "express";
import { lottery, getRound } from "../lotteryClient";
import { rpcCache } from "../utils/rpcCache";

const router = express.Router();

// Prize Pool
router.get("/prize-pool", publicDataRateLimit, lotteryController.getPrizePool);

// Lottery Rounds
router.post(
  "/rounds",
  lotteryRoundProtection(createRoundSchema),
  lotteryController.createRound
);
router.get("/rounds", publicDataRateLimit, lotteryController.getAllRounds);
router.get(
  "/rounds/active",
  publicDataRateLimit,
  lotteryController.getActiveRound
);
router.get(
  "/rounds/:id",
  publicDataRateLimit,
  validateParams(roundIdQuerySchema),
  lotteryController.getRoundById
);

// Funds Admin Management
router.put(
  "/funds-admin",
  lotteryRoundProtection(setFundsAdminSchema),
  lotteryController.setFundsAdmin
);
router.get(
  "/funds-admin",
  publicDataRateLimit,
  lotteryController.getFundsAdmin
);

// Add this new endpoint before the existing routes
router.get("/current-draw", async (req: Request, res: Response) => {
  try {
    // Cache key for current draw info
    const cacheKey = "current_draw_info";

    // Check cache first (30 second TTL)
    const cached = rpcCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const currentRoundBN = await lottery.s_currentRound();
    const currentRound = Number(currentRoundBN);

    let drawNumber: number;
    let roundData: any = null;

    if (currentRound === 0) {
      drawNumber = 1;
    } else {
      try {
        roundData = await getRound(currentRound);
        drawNumber = roundData.isCompleted ? currentRound + 1 : currentRound;
      } catch (error) {
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

    // Cache the response for 30 seconds
    rpcCache.set(cacheKey, response, 30);

    return res.json(response);
  } catch (error: any) {
    console.error("Error fetching current draw:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch current draw information",
      data: {
        drawNumber: 1, // Fallback
        currentRound: 0,
        roundData: null,
      },
    });
  }
});

// Payout History
router.get("/payouts", publicDataRateLimit, lotteryController.getPayoutHistory);
router.get(
  "/payouts/:round_id",
  publicDataRateLimit,
  validateParams(roundIdQuerySchema),
  lotteryController.getPayoutHistory
);

// Contract Balance
router.get(
  "/balance",
  publicDataRateLimit,
  lotteryController.getContractBalance
);

// Lottery Data
router.get("/winners", publicDataRateLimit, lotteryController.getWinners);
router.get("/stats", publicDataRateLimit, lotteryController.getLotteryStats);
router.get(
  "/results",
  publicDataRateLimit,
  lotteryController.getLotteryResults
);

export default router;
