import { Router } from "express";
import { entryController } from "../controllers/entryController";

const router = Router();

// GET /current-pool - Get all verified entries
router.get("/current-pool", entryController.getCurrentPool);

// POST /submit-entry - Submit a new entry
//router.post("/submit-entry", entryController.submitEntry);

// POST /verify-entry - Verify an entry with tweet URL
//router.post("/verify-entry", entryController.verifyEntry);

export default router;
