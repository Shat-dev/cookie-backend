#!/usr/bin/env ts-node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validateEntries_1 = require("../services/validateEntries");
const xLimiter_1 = require("../utils/xLimiter");
const schedulerRepository_1 = require("../db/schedulerRepository");
async function testFinalValidation() {
    console.log("🧪 Testing final validation with rate limiting...");
    try {
        console.log("\n📊 Initial X API status:");
        console.log(JSON.stringify((0, xLimiter_1.getXStatus)(), null, 2));
        console.log("\n📊 Scheduler health before validation:");
        const healthBefore = await schedulerRepository_1.schedulerRepository.getHealthStatus();
        console.log(JSON.stringify(healthBefore, null, 2));
        console.log("\n🚀 Starting final validation (finalSweep=true)...");
        const startTime = Date.now();
        await (0, validateEntries_1.validateEntries)(true);
        const duration = Date.now() - startTime;
        console.log(`\n✅ Final validation completed in ${duration}ms`);
        console.log("\n📊 X API status after validation:");
        console.log(JSON.stringify((0, xLimiter_1.getXStatus)(), null, 2));
        console.log("\n📊 Scheduler health after validation:");
        const healthAfter = await schedulerRepository_1.schedulerRepository.getHealthStatus();
        console.log(JSON.stringify(healthAfter, null, 2));
        console.log("\n🎉 Test completed successfully!");
    }
    catch (error) {
        console.error("❌ Test failed:", error?.message || error);
        throw error;
    }
}
if (require.main === module) {
    testFinalValidation()
        .then(() => {
        console.log("\n✨ All tests passed!");
        process.exit(0);
    })
        .catch((error) => {
        console.error("\n💥 Tests failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=test-final-validation-rate-limiting.js.map