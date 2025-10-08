#!/usr/bin/env ts-node

/**
 * Test script to verify final validation works with rate limiting
 * This simulates what happens during a freeze round
 */

import { validateEntries } from "../services/validateEntries";
import { getXStatus } from "../utils/xLimiter";
import { schedulerRepository } from "../db/schedulerRepository";

async function testFinalValidation() {
  console.log("🧪 Testing final validation with rate limiting...");

  try {
    // Check initial X API status
    console.log("\n📊 Initial X API status:");
    console.log(JSON.stringify(getXStatus(), null, 2));

    // Check scheduler health before
    console.log("\n📊 Scheduler health before validation:");
    const healthBefore = await schedulerRepository.getHealthStatus();
    console.log(JSON.stringify(healthBefore, null, 2));

    console.log("\n🚀 Starting final validation (finalSweep=true)...");
    const startTime = Date.now();

    // Run final validation - this should process ALL tweets with rate limiting
    await validateEntries(true);

    const duration = Date.now() - startTime;
    console.log(`\n✅ Final validation completed in ${duration}ms`);

    // Check X API status after
    console.log("\n📊 X API status after validation:");
    console.log(JSON.stringify(getXStatus(), null, 2));

    // Check scheduler health after
    console.log("\n📊 Scheduler health after validation:");
    const healthAfter = await schedulerRepository.getHealthStatus();
    console.log(JSON.stringify(healthAfter, null, 2));

    console.log("\n🎉 Test completed successfully!");
  } catch (error: any) {
    console.error("❌ Test failed:", error?.message || error);
    throw error;
  }
}

// Run if called directly
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
