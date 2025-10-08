import { Router } from "express";
import { winnerController } from "../controllers/winnerController";

const router = Router();

// GET /previous-winners - Get recent winners
//router.get("/previous-winners", winnerController.getPreviousWinners);

// POST /create-winner - Create a new winner (admin/internal use)
//router.post("/create-winner", winnerController.createWinner);

export default router;
