"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disableAutomation = disableAutomation;
require("dotenv/config");
const lotteryClient_1 = require("../lotteryClient");
async function disableAutomation() {
    console.log("🤖 Disabling Smart Contract Automation...");
    console.log("(Replacing with database-driven automation)");
    try {
        const isEnabled = await lotteryClient_1.lottery.s_automationEnabled();
        if (!isEnabled) {
            console.log("✅ Smart contract automation is already disabled");
            return;
        }
        console.log("📝 Sending setAutomationEnabled(false) transaction...");
        const tx = await lotteryClient_1.lottery.setAutomationEnabled(false);
        const receipt = await tx.wait();
        console.log(`✅ Smart contract automation disabled in tx: ${receipt.hash}`);
        console.log("ℹ️  Database-driven automation will now handle lottery execution");
    }
    catch (error) {
        console.error("❌ Failed to disable automation:", error.message || error);
        process.exit(1);
    }
}
if (require.main === module) {
    disableAutomation();
}
//# sourceMappingURL=disable-automation.js.map