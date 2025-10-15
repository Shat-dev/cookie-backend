import { Router } from "express";
import { entryController } from "../controllers/entryController";
import { publicDataRateLimit } from "../middleware/rateLimiting";
import { submitEntrySchema, verifyEntrySchema } from "../middleware/validation";
import { entryManagementProtection } from "../middleware/adminProtection";

const router = Router();

// GET /current-pool - Get all verified entries
router.get(
  "/current-pool",
  publicDataRateLimit,
  entryController.getCurrentPool
);

// POST /submit-entry - Submit a new entry (ADMIN ONLY)
//router.post("/submit-entry", entryManagementProtection(submitEntrySchema), entryController.submitEntry);

// POST /verify-entry - Verify an entry with tweet URL (ADMIN ONLY)
//router.post("/verify-entry", entryManagementProtection(verifyEntrySchema), entryController.verifyEntry);

export default router;
