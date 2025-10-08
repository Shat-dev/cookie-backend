import "dotenv/config";
import { lottery } from "../lotteryClient";

async function disableAutomation() {
  console.log("🤖 Disabling Smart Contract Automation...");
  console.log("(Replacing with database-driven automation)");

  try {
    // Check current status
    const isEnabled = await lottery.s_automationEnabled();

    if (!isEnabled) {
      console.log("✅ Smart contract automation is already disabled");
      return;
    }

    // Disable automation
    console.log("📝 Sending setAutomationEnabled(false) transaction...");
    const tx = await lottery.setAutomationEnabled(false);
    const receipt = await tx.wait();

    console.log(`✅ Smart contract automation disabled in tx: ${receipt.hash}`);
    console.log(
      "ℹ️  Database-driven automation will now handle lottery execution"
    );
  } catch (error: any) {
    console.error("❌ Failed to disable automation:", error.message || error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  disableAutomation();
}

export { disableAutomation };
