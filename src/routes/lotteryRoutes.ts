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
import {
  getCountdownStatus,
  startCountdownRound,
  resetCountdown,
} from "../scripts/manualCountdownController";

const router = express.Router();

// Manual Countdown System
router.get("/countdown", publicDataRateLimit, getCountdownStatus);

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
