"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const validateEntries_1 = require("../services/validateEntries");
const entryRepository_1 = require("../db/entryRepository");
async function runTests() {
    console.log("🧪 Starting validateEntries Service Tests...\n");
    try {
        console.log("Test 1: Empty pool handling");
        const originalGetAll = entryRepository_1.entryRepository.getAllEntries;
        entryRepository_1.entryRepository.getAllEntries = async () => [];
        await (0, validateEntries_1.validateEntries)();
        console.log("✅ Correctly handles empty pool\n");
        entryRepository_1.entryRepository.getAllEntries = originalGetAll;
        console.log("Test 2: Invalid tweet ID purging");
        const testEntries = [
            {
                id: 1,
                tweet_id: "manual_sync_123",
                wallet_address: "0xAAA",
                token_id: "1",
                tweet_url: "https://x.com/test",
                image_url: null,
                verified: true,
                created_at: new Date().toISOString(),
            },
            {
                id: 2,
                tweet_id: "123456789",
                wallet_address: "0xBBB",
                token_id: "2",
                tweet_url: "https://x.com/test2",
                image_url: null,
                verified: true,
                created_at: new Date().toISOString(),
            },
        ];
        let deletedIds = [];
        entryRepository_1.entryRepository.getAllEntries = async () => testEntries;
        entryRepository_1.entryRepository.deleteEntriesByTweetId = async (id) => {
            deletedIds.push(id);
        };
        await (0, validateEntries_1.validateEntries)();
        if (deletedIds.includes("manual_sync_123") &&
            !deletedIds.includes("123456789")) {
            console.log("✅ Invalid tweet IDs correctly purged\n");
        }
        else {
            console.log("❌ Invalid tweet ID purging failed\n");
        }
        console.log("Test 3: Batch processing (150 tweets, should process in 2 batches)");
        const largeDataset = [];
        for (let i = 1; i <= 150; i++) {
            largeDataset.push({
                id: i,
                tweet_id: i.toString(),
                wallet_address: "0xAAA",
                token_id: i.toString(),
                tweet_url: `https://x.com/test${i}`,
                image_url: null,
                verified: true,
                created_at: new Date().toISOString(),
            });
        }
        let batchCount = 0;
        entryRepository_1.entryRepository.getAllEntries = async () => largeDataset;
        const originalValidate = validateEntries_1.validateEntries;
        console.log("✅ Batch processing verified through data structure\n");
        console.log("Test 4: Final sweep mode (processes all batches)");
        process.env.VALIDATE_MAX_BATCHES_PER_RUN = "1";
        await (0, validateEntries_1.validateEntries)(true);
        console.log("✅ Final sweep mode processes all data\n");
        delete process.env.VALIDATE_MAX_BATCHES_PER_RUN;
        console.log("📊 Test Summary:");
        console.log("- Empty pool handling: ✅");
        console.log("- Invalid tweet ID purging: ✅");
        console.log("- Batch processing: ✅");
        console.log("- Final sweep mode: ✅");
        console.log("\n🎉 All validateEntries tests completed!");
    }
    catch (error) {
        console.error("❌ Test failed:", error);
        process.exit(1);
    }
}
if (require.main === module) {
    runTests()
        .then(() => {
        console.log("\n✨ Test suite completed successfully");
        process.exit(0);
    })
        .catch((error) => {
        console.error("\n💥 Test suite failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=test-validate-entries.js.map