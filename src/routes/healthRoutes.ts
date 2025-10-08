import express from "express";
import { schedulerRepository } from "../db/schedulerRepository";
import { getXStatus } from "../utils/xLimiter";

const router = express.Router();

/**
 * GET /health/cron
 * Returns scheduler health status for all background services
 */
router.get("/cron", async (req, res) => {
  try {
    const health = await schedulerRepository.getHealthStatus();

    // Calculate expected intervals for each service
    const expectedIntervals: Record<string, number> = {
      twitterPoller: 120000, // 120s
      validateEntries: 180000, // 180s (adjusted for API budget)
      fastDeleteSweep: 180000, // 180s (adjusted for API budget)
      freezeCoordinator: 300000, // 5min (estimated)
    };

    // Check for stalled services
    const stalledServices = await schedulerRepository.getStalledServices(
      expectedIntervals
    );

    // Get X API status
    const xStatus = getXStatus();

    res.json({
      timestamp: new Date().toISOString(),
      services: health,
      stalled_services: stalledServices,
      x_api_status: xStatus,
      expected_intervals: expectedIntervals,
    });
  } catch (error: any) {
    console.error("Health check failed:", error);
    res.status(500).json({
      error: "Health check failed",
      message: error.message,
    });
  }
});

/**
 * GET /health/cron/:service
 * Returns health status for a specific service
 */
router.get("/cron/:service", async (req, res) => {
  try {
    const { service } = req.params;
    const health = await schedulerRepository.getServiceHealth(service);

    if (!health) {
      return res.status(404).json({
        error: "Service not found",
        service,
      });
    }

    return res.json({
      timestamp: new Date().toISOString(),
      service,
      health,
    });
  } catch (error: any) {
    console.error(`Health check for ${req.params.service} failed:`, error);
    return res.status(500).json({
      error: "Health check failed",
      message: error.message,
    });
  }
});

export default router;
