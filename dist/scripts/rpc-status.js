"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRpcStatus = checkRpcStatus;
require("dotenv/config");
const rpcProvider_1 = require("../utils/rpcProvider");
const rpcCache_1 = require("../utils/rpcCache");
async function checkRpcStatus() {
    console.log("🔗 RPC Endpoint Status");
    console.log("=====================\n");
    const rpcStatus = rpcProvider_1.robustRpcProvider.getStatus();
    rpcStatus.forEach((endpoint) => {
        const status = endpoint.available ? "✅ Available" : "❌ Rate Limited";
        const usage = `${endpoint.requestsUsed}/${endpoint.maxRequests}`;
        console.log(`${endpoint.name}:`);
        console.log(`   Status: ${status}`);
        console.log(`   Usage: ${usage} requests/minute`);
        console.log();
    });
    const cacheStats = rpcCache_1.rpcCache.getStats();
    console.log("📦 Cache Statistics:");
    console.log(`   Total Entries: ${cacheStats.totalEntries}`);
    console.log(`   Valid Entries: ${cacheStats.validEntries}`);
    console.log(`   Expired Entries: ${cacheStats.expiredEntries}`);
    console.log();
    console.log("🔄 Testing Connectivity...");
    try {
        const testResult = await rpcProvider_1.robustRpcProvider.call(async (provider) => {
            return await provider.getBlockNumber();
        });
        console.log(`✅ Connection successful - Block: ${testResult}`);
    }
    catch (error) {
        console.log(`❌ Connection failed: ${error.message}`);
    }
}
if (require.main === module) {
    checkRpcStatus();
}
//# sourceMappingURL=rpc-status.js.map