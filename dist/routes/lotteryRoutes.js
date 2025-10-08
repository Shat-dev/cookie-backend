"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const lotteryController_1 = require("../controllers/lotteryController");
const router = express_1.default.Router();
router.post("/rounds", lotteryController_1.lotteryController.createRound);
router.get("/rounds", lotteryController_1.lotteryController.getAllRounds);
router.get("/rounds/active", lotteryController_1.lotteryController.getActiveRound);
router.get("/rounds/:id", lotteryController_1.lotteryController.getRoundById);
router.post("/draw-winner", lotteryController_1.lotteryController.drawWinner);
router.post("/sync-entries", lotteryController_1.lotteryController.syncEntries);
router.get("/winners", lotteryController_1.lotteryController.getWinners);
router.get("/stats", lotteryController_1.lotteryController.getLotteryStats);
router.get("/results", lotteryController_1.lotteryController.getLotteryResults);
router.get("/prize-pool", lotteryController_1.lotteryController.getPrizePool);
exports.default = router;
//# sourceMappingURL=lotteryRoutes.js.map