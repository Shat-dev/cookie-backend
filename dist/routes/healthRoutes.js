"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const schedulerRepository_1 = require("../db/schedulerRepository");
const xLimiter_1 = require("../utils/xLimiter");
const router = express_1.default.Router();
router.get("/cron", async (req, res) => {
    try {
        const health = await schedulerRepository_1.schedulerRepository.getHealthStatus();
        const expectedIntervals = {
            twitterPoller: 120000,
            validateEntries: 180000,
            fastDeleteSweep: 180000,
            freezeCoordinator: 300000,
        };
        const stalledServices = await schedulerRepository_1.schedulerRepository.getStalledServices(expectedIntervals);
        const xStatus = (0, xLimiter_1.getXStatus)();
        res.json({
            timestamp: new Date().toISOString(),
            services: health,
            stalled_services: stalledServices,
            x_api_status: xStatus,
            expected_intervals: expectedIntervals,
        });
    }
    catch (error) {
        console.error("Health check failed:", error);
        res.status(500).json({
            error: "Health check failed",
            message: error.message,
        });
    }
});
router.get("/cron/:service", async (req, res) => {
    try {
        const { service } = req.params;
        const health = await schedulerRepository_1.schedulerRepository.getServiceHealth(service);
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
    }
    catch (error) {
        console.error(`Health check for ${req.params.service} failed:`, error);
        return res.status(500).json({
            error: "Health check failed",
            message: error.message,
        });
    }
});
exports.default = router;
//# sourceMappingURL=healthRoutes.js.map