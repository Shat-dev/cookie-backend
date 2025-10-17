"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const lotteryController_1 = require("../controllers/lotteryController");
const rateLimiting_1 = require("../middleware/rateLimiting");
const validation_1 = require("../middleware/validation");
const adminProtection_1 = require("../middleware/adminProtection");
const manualCountdownController_1 = require("../scripts/manualCountdownController");
const router = express_1.default.Router();
router.get("/countdown", rateLimiting_1.publicDataRateLimit, manualCountdownController_1.getCountdownStatus);
router.get("/prize-pool", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getPrizePool);
router.post("/rounds", (0, adminProtection_1.lotteryRoundProtection)(validation_1.createRoundSchema), lotteryController_1.lotteryController.createRound);
router.get("/rounds", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getAllRounds);
router.get("/rounds/active", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getActiveRound);
router.get("/rounds/:id", rateLimiting_1.publicDataRateLimit, (0, validation_1.validateParams)(validation_1.roundIdQuerySchema), lotteryController_1.lotteryController.getRoundById);
router.put("/funds-admin", (0, adminProtection_1.lotteryRoundProtection)(validation_1.setFundsAdminSchema), lotteryController_1.lotteryController.setFundsAdmin);
router.get("/funds-admin", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getFundsAdmin);
router.get("/payouts", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getPayoutHistory);
router.get("/payouts/:round_id", rateLimiting_1.publicDataRateLimit, (0, validation_1.validateParams)(validation_1.roundIdQuerySchema), lotteryController_1.lotteryController.getPayoutHistory);
router.get("/balance", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getContractBalance);
router.get("/winners", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getWinners);
router.get("/stats", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getLotteryStats);
router.get("/results", rateLimiting_1.publicDataRateLimit, lotteryController_1.lotteryController.getLotteryResults);
exports.default = router;
//# sourceMappingURL=lotteryRoutes.js.map