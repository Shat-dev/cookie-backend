"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
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
async function runTest(testFile) {
    const startTime = Date.now();
    const testPath = path_1.default.join(__dirname, testFile);
    return new Promise((resolve) => {
        const child = (0, child_process_1.spawn)("npx", ["ts-node", testPath], {
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
    const results = [];
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
    }
    else {
        console.log("\n✨ All tests passed!");
        process.exit(0);
    }
}
runAllTests().catch((error) => {
    console.error("\n💥 Test runner failed:", error);
    process.exit(1);
});
//# sourceMappingURL=run-all-tests.js.map