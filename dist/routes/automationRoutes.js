"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const automationController_1 = require("../controllers/automationController");
const router = express_1.default.Router();
router.get("/status", automationController_1.automationController.getStatus);
router.get("/unified-status", automationController_1.automationController.getUnifiedStatus);
router.get("/next-draw", automationController_1.automationController.getNextDraw);
router.get("/schedule", automationController_1.automationController.getSchedule);
exports.default = router;
//# sourceMappingURL=automationRoutes.js.map