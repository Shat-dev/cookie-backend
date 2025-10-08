import express from "express";
import { automationController } from "../controllers/automationController";

const router = express.Router();

// Automation status and info
router.get("/status", automationController.getStatus);
router.get("/unified-status", automationController.getUnifiedStatus);
router.get("/next-draw", automationController.getNextDraw);
router.get("/schedule", automationController.getSchedule);

export default router;
