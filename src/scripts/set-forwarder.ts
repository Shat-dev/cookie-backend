import "dotenv/config";
import { lottery } from "../lotteryClient";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

async function setForwarder() {
  console.log("🤖 Setting Automation Forwarder...");

  try {
    const forwarderAddress = requireEnv("FORWARDER_ADDRESS");

    // Check current forwarder
    const currentForwarder = await lottery.s_automationForwarder();
    console.log(`📍 Current forwarder: ${currentForwarder}`);
    console.log(`📍 Target forwarder: ${forwarderAddress}`);

    if (currentForwarder.toLowerCase() === forwarderAddress.toLowerCase()) {
      console.log("✅ Forwarder is already set correctly");
      return;
    }

    // Set the forwarder
    console.log("📝 Sending setAutomationForwarder transaction...");
    const tx = await lottery.setAutomationForwarder(forwarderAddress);
    const receipt = await tx.wait();

    console.log(`✅ Forwarder set in tx: ${receipt.hash}`);
    console.log("ℹ️  Chainlink Automation can now call your contract");
  } catch (error: any) {
    console.error("❌ Failed to set forwarder:", error.message || error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setForwarder();
}

export { setForwarder };
