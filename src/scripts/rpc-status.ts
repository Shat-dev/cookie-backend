import "dotenv/config";
import { robustRpcProvider } from "../utils/rpcProvider";
import { rpcCache } from "../utils/rpcCache";

async function checkRpcStatus() {
  console.log("🔗 RPC Endpoint Status");
  console.log("=====================\n");

  // Get RPC provider status
  const rpcStatus = robustRpcProvider.getStatus();

  rpcStatus.forEach((endpoint) => {
    const status = endpoint.available ? "✅ Available" : "❌ Rate Limited";
    const usage = `${endpoint.requestsUsed}/${endpoint.maxRequests}`;
    console.log(`${endpoint.name}:`);
    console.log(`   Status: ${status}`);
    console.log(`   Usage: ${usage} requests/minute`);
    console.log();
  });

  // Get cache statistics
  const cacheStats = rpcCache.getStats();
  console.log("📦 Cache Statistics:");
  console.log(`   Total Entries: ${cacheStats.totalEntries}`);
  console.log(`   Valid Entries: ${cacheStats.validEntries}`);
  console.log(`   Expired Entries: ${cacheStats.expiredEntries}`);
  console.log();

  // Test connectivity
  console.log("🔄 Testing Connectivity...");
  try {
    const testResult = await robustRpcProvider.call(async (provider) => {
      return await provider.getBlockNumber();
    });
    console.log(`✅ Connection successful - Block: ${testResult}`);
  } catch (error: any) {
    console.log(`❌ Connection failed: ${error.message}`);
  }
}

// Run if called directly
if (require.main === module) {
  checkRpcStatus();
}

export { checkRpcStatus };
