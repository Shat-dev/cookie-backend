"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const lotteryClient_1 = require("../lotteryClient");
async function enableAutomation() {
    console.log("🤖 Enabling Chainlink Automation...");
    try {
        const isEnabled = await lotteryClient_1.lottery.s_automationEnabled();
        if (isEnabled) {
            console.log("✅ Automation is already enabled");
            return;
        }
        console.log("📝 Sending setAutomationEnabled(true) transaction...");
        const tx = await lotteryClient_1.lottery.setAutomationEnabled(true);
        const receipt = await tx.wait();
        console.log(`✅ Automation enabled in tx: ${receipt.hash}`);
        console.log("ℹ️  Rounds will be created automatically when the first entry arrives");
    }
    catch (error) {
        console.error("❌ Failed to enable automation:", error.message || error);
        process.exit(1);
    }
}
if (require.main === module) {
    enableAutomation()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=enable-automation.js.map