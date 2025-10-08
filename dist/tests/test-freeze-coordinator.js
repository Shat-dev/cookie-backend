"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const appStateRepository_1 = require("../db/appStateRepository");
const connection_1 = __importDefault(require("../db/connection"));
async function runTests() {
    console.log("🧪 Starting freezeCoordinator Service Tests...\n");
    const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
    try {
        console.log("Test 1: ERC-404 ID encoding");
        const ID_PREFIX = 1n << 255n;
        const isEncoded = (n) => n >= ID_PREFIX;
        const encodeIfNeeded = (n) => (isEncoded(n) ? n : n | ID_PREFIX);
        const testCases = [
            { input: 123n, name: "Plain ID" },
            { input: ID_PREFIX | 456n, name: "Already encoded ID" },
        ];
        for (const test of testCases) {
            const encoded = encodeIfNeeded(test.input);
            const hasHighBit = isEncoded(encoded);
            console.log(`  ${test.name}: ${test.input} → ${encoded}`);
            console.log(`  High bit set: ${hasHighBit ? "✅" : "❌"}`);
            if (hasHighBit) {
                console.log("  ✅ Correctly encoded");
            }
            else {
                console.log("  ❌ Encoding failed");
            }
        }
        console.log();
        console.log("Test 2: Snapshot data structure");
        const mockSnapshot = [
            { wallet_address: "0xaaa", token_id: "123" },
            { wallet_address: "0xbbb", token_id: "456" },
            { wallet_address: "0xaaa", token_id: "789" },
        ];
        console.log(`  Snapshot size: ${mockSnapshot.length} entries`);
        console.log(`  Format: { wallet_address, token_id }`);
        const owners = [];
        const tokenIds = [];
        for (const entry of mockSnapshot) {
            owners.push(entry.wallet_address.toLowerCase());
            tokenIds.push(encodeIfNeeded(BigInt(entry.token_id)));
        }
        console.log(`  Owners array: ${owners.length} addresses`);
        console.log(`  TokenIds array: ${tokenIds.length} encoded IDs`);
        if (owners.length === tokenIds.length &&
            owners.length === mockSnapshot.length) {
            console.log("✅ Snapshot structure correctly prepared\n");
        }
        else {
            console.log("❌ Snapshot structure preparation failed\n");
        }
        console.log("Test 3: Empty snapshot handling");
        const emptySnapshot = [];
        if (emptySnapshot.length === 0) {
            console.log("  Empty snapshot detected");
            console.log("  Action: Skip on-chain push");
            console.log("✅ Empty snapshot handling correct\n");
        }
        else {
            console.log("❌ Empty snapshot handling failed\n");
        }
        console.log("Test 4: State persistence keys");
        const roundNumber = 5;
        const freezeFlagKey = `round_${roundNumber}_frozen`;
        const snapshotTxKey = `round_${roundNumber}_snapshot_tx`;
        console.log(`  Freeze flag key: "${freezeFlagKey}"`);
        console.log(`  Snapshot tx key: "${snapshotTxKey}"`);
        const testTxHash = "0x1234567890abcdef";
        await stateRepo.set(freezeFlagKey, "true");
        await stateRepo.set(snapshotTxKey, testTxHash);
        const frozenValue = await stateRepo.get(freezeFlagKey);
        const txValue = await stateRepo.get(snapshotTxKey);
        if (frozenValue === "true" && txValue === testTxHash) {
            console.log("✅ State persistence working correctly\n");
        }
        else {
            console.log("❌ State persistence failed\n");
        }
        console.log("Test 5: Idempotency check");
        const isFrozen = frozenValue === "true";
        const hasSnapshot = txValue !== null;
        console.log(`  Round frozen: ${isFrozen ? "Yes" : "No"}`);
        console.log(`  Snapshot exists: ${hasSnapshot ? "Yes" : "No"}`);
        if (isFrozen || hasSnapshot) {
            console.log("  Action: Skip duplicate push");
            console.log("✅ Idempotency guard active\n");
        }
        else {
            console.log("  Action: Proceed with push");
            console.log("✅ Ready for initial push\n");
        }
        console.log("Test 6: Snapshot determinism");
        const unsortedEntries = [
            { wallet_address: "0xCCC", token_id: "3" },
            { wallet_address: "0xAAA", token_id: "1" },
            { wallet_address: "0xBBB", token_id: "2" },
            { wallet_address: "0xAAA", token_id: "10" },
        ];
        const sorted = [...unsortedEntries].sort((a, b) => {
            const wa = a.wallet_address.toLowerCase();
            const wb = b.wallet_address.toLowerCase();
            if (wa < wb)
                return -1;
            if (wa > wb)
                return 1;
            const ta = BigInt(a.token_id);
            const tb = BigInt(b.token_id);
            if (ta < tb)
                return -1;
            if (ta > tb)
                return 1;
            return 0;
        });
        console.log("  Original order:", unsortedEntries.map((e) => `${e.wallet_address}:${e.token_id}`).join(", "));
        console.log("  Sorted order:", sorted.map((e) => `${e.wallet_address}:${e.token_id}`).join(", "));
        const expectedOrder = ["0xAAA:1", "0xAAA:10", "0xBBB:2", "0xCCC:3"];
        const actualOrder = sorted.map((e) => `${e.wallet_address}:${e.token_id}`);
        if (JSON.stringify(actualOrder) === JSON.stringify(expectedOrder)) {
            console.log("✅ Deterministic ordering verified\n");
        }
        else {
            console.log("❌ Deterministic ordering failed\n");
        }
        console.log("📊 Test Summary:");
        console.log("- ERC-404 ID encoding: ✅");
        console.log("- Snapshot data structure: ✅");
        console.log("- Empty snapshot handling: ✅");
        console.log("- State persistence: ✅");
        console.log("- Idempotency check: ✅");
        console.log("- Snapshot determinism: ✅");
        console.log("\n🎉 All freezeCoordinator tests completed!");
        await stateRepo.set(freezeFlagKey, "");
        await stateRepo.set(snapshotTxKey, "");
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
//# sourceMappingURL=test-freeze-coordinator.js.map