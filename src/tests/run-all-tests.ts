/* eslint-disable no-console */
/**
 * Master Test Runner for ERC-404 Lottery Backend
 *
 * Runs all service tests in sequence and provides a comprehensive report.
 * Tests cover the complete lottery automation flow from tweet processing
 * to winner selection.
 */

import "dotenv/config";
import { spawn } from "child_process";
import path from "path";

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  output?: string;
}

const testFiles = [
  {
    file: "test-twitter-poller.ts",
    name: "Twitter Poller",
    description: "Processes mentions and creates entries",
  },
  {
    file: "test-validate-entries.ts",
    name: "Entry Validator",
    description: "Syncs ownership and removes invalid entries",
  },
  {
    file: "test-fast-delete-sweep.ts",
    name: "Fast Delete Sweep",
    description: "Quickly removes deleted tweets",
  },
  {
    file: "test-round-coordinator.ts",
    name: "Round Coordinator",
    description: "Manages round creation and timing",
  },
  {
    file: "test-freeze-coordinator.ts",
    name: "Freeze Coordinator",
    description: "Handles snapshot creation and pushing",
  },
  {
    file: "test-automated-lottery.ts",
    name: "Automated Lottery",
    description: "Orchestrates the complete lottery flow",
  },
];

async function runTest(testFile: string): Promise<TestResult> {
  const startTime = Date.now();
  const testPath = path.join(__dirname, testFile);

  return new Promise((resolve) => {
    const child = spawn("npx", ["ts-node", testPath], {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      const duration = Date.now() - startTime;
      resolve({
        name: testFile,
        passed: code === 0,
        duration,
        output,
      });
    });
  });
}

async function runAllTests() {
  console.log("🚀 ERC-404 Lottery Backend Test Suite\n");
  console.log("=".repeat(60));
  console.log();

  const results: TestResult[] = [];

  for (const test of testFiles) {
    console.log(`\n📋 Running ${test.name} Tests`);
    console.log(`   ${test.description}`);
    console.log("-".repeat(60));

    const result = await runTest(test.file);
    results.push({ ...result, name: test.name });

    if (!result.passed) {
      console.log(`\n❌ ${test.name} tests failed!`);
    }
  }

  // Generate summary report
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY REPORT");
  console.log("=".repeat(60));

  const totalTests = results.length;
  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\nTotal Tests: ${totalTests}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  console.log("\nDetailed Results:");
  console.log("-".repeat(60));

  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    const duration = `${(result.duration / 1000).toFixed(2)}s`;
    console.log(`${status} | ${result.name.padEnd(20)} | ${duration}`);
  }

  if (failedTests > 0) {
    console.log("\n❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n✨ All tests passed!");
    process.exit(0);
  }
}

// Run all tests
runAllTests().catch((error) => {
  console.error("\n💥 Test runner failed:", error);
  process.exit(1);
});
