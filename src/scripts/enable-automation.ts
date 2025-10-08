import "dotenv/config";
import { lottery } from "../lotteryClient";

async function enableAutomation() {
  console.log("🤖 Enabling Chainlink Automation...");

  try {
    // Check current status
    const isEnabled = await lottery.s_automationEnabled();

    if (isEnabled) {
      console.log("✅ Automation is already enabled");
      return;
    }

    // Enable automation
    console.log("📝 Sending setAutomationEnabled(true) transaction...");
    const tx = await lottery.setAutomationEnabled(true);
    const receipt = await tx.wait();

    console.log(`✅ Automation enabled in tx: ${receipt.hash}`);
    console.log(
      "ℹ️  Rounds will be created automatically when the first entry arrives"
    );
  } catch (error: any) {
    console.error("❌ Failed to enable automation:", error.message || error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  enableAutomation()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("❌ Script failed:", error);
      process.exit(1);
    });
}
