"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const entryController_1 = require("../controllers/entryController");
const router = (0, express_1.Router)();
router.get("/current-pool", entryController_1.entryController.getCurrentPool);
exports.default = router;
//# sourceMappingURL=entryRoutes.js.map