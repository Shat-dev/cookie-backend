import express from "express";
import { lotteryController } from "../controllers/lotteryController";

const router = express.Router();

// Lottery Rounds
router.post("/rounds", lotteryController.createRound);
router.get("/rounds", lotteryController.getAllRounds);
router.get("/rounds/active", lotteryController.getActiveRound);
router.get("/rounds/:id", lotteryController.getRoundById);

// Lottery Actions
router.post("/draw-winner", lotteryController.drawWinner);
router.post("/sync-entries", lotteryController.syncEntries);

// Lottery Data
router.get("/winners", lotteryController.getWinners);
router.get("/stats", lotteryController.getLotteryStats);
router.get("/results", lotteryController.getLotteryResults);
router.get("/prize-pool", lotteryController.getPrizePool);

export default router;
