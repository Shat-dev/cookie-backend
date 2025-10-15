import { Router } from "express";
import { winnerController } from "../controllers/winnerController";
import { createWinnerSchema } from "../middleware/validation";
import { entryManagementProtection } from "../middleware/adminProtection";

const router = Router();

// GET /previous-winners - Get recent winners
//router.get("/previous-winners", winnerController.getPreviousWinners);

// POST /create-winner - Create a new winner (ADMIN ONLY)
//router.post("/create-winner", entryManagementProtection(createWinnerSchema), winnerController.createWinner);

export default router;
