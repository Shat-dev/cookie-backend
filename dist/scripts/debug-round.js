"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const lotteryClient_1 = require("../lotteryClient");
const connection_1 = __importDefault(require("../db/connection"));
async function debugRound() {
    console.log("🔍 Debugging Round Data");
    console.log("=======================");
    try {
        const currentRound = await lotteryClient_1.lottery.s_currentRound();
        console.log(`Current round: ${currentRound}`);
        if (currentRound > 0n) {
            console.log("Calling getRound...");
            const rd = await lotteryClient_1.lottery.getRound(Number(currentRound));
            console.log("Raw round data:", rd);
            console.log("Round data type:", typeof rd);
            console.log("Round properties:");
            console.log("  start:", rd.start, typeof rd.start);
            console.log("  end:", rd.end, typeof rd.end);
            console.log("  isActive:", rd.isActive, typeof rd.isActive);
            console.log("  isCompleted:", rd.isCompleted, typeof rd.isCompleted);
        }
    }
    catch (error) {
        console.error("❌ Debug failed:", error.message || error);
    }
    finally {
        await connection_1.default.end();
    }
}
if (require.main === module) {
    debugRound()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error("Debug script failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=debug-round.js.map