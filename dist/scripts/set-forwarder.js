"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setForwarder = setForwarder;
require("dotenv/config");
const lotteryClient_1 = require("../lotteryClient");
function requireEnv(name) {
    const v = process.env[name];
    if (!v || !v.trim())
        throw new Error(`Missing required env: ${name}`);
    return v.trim();
}
async function setForwarder() {
    console.log("🤖 Setting Automation Forwarder...");
    try {
        const forwarderAddress = requireEnv("FORWARDER_ADDRESS");
        const currentForwarder = await lotteryClient_1.lottery.s_automationForwarder();
        console.log(`📍 Current forwarder: ${currentForwarder}`);
        console.log(`📍 Target forwarder: ${forwarderAddress}`);
        if (currentForwarder.toLowerCase() === forwarderAddress.toLowerCase()) {
            console.log("✅ Forwarder is already set correctly");
            return;
        }
        console.log("📝 Sending setAutomationForwarder transaction...");
        const tx = await lotteryClient_1.lottery.setAutomationForwarder(forwarderAddress);
        const receipt = await tx.wait();
        console.log(`✅ Forwarder set in tx: ${receipt.hash}`);
        console.log("ℹ️  Chainlink Automation can now call your contract");
    }
    catch (error) {
        console.error("❌ Failed to set forwarder:", error.message || error);
        process.exit(1);
    }
}
if (require.main === module) {
    setForwarder();
}
//# sourceMappingURL=set-forwarder.js.map