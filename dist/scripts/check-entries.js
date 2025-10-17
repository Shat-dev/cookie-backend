"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkEntries = checkEntries;
require("dotenv/config");
const connection_1 = __importDefault(require("../db/connection"));
async function checkEntries() {
    try {
        console.log("📊 Checking Current Database Entries...\n");
        console.log("🔌 Testing database connection...");
        const connectionTest = await connection_1.default.query("SELECT NOW()");
        console.log("✅ Database connection successful\n");
        console.log("1. 📋 Checking entries table...");
        try {
            const entriesResult = await connection_1.default.query(`
        SELECT 
          COUNT(*) as total_entries,
          COUNT(*) FILTER (WHERE verified = true) as verified_entries,
          COUNT(*) FILTER (WHERE verified = false) as unverified_entries
        FROM entries
      `);
            const entryStats = entriesResult.rows[0];
            console.log(`   Total entries: ${entryStats.total_entries}`);
            console.log(`   Verified entries: ${entryStats.verified_entries}`);
            console.log(`   Unverified entries: ${entryStats.unverified_entries}`);
        }
        catch (error) {
            console.log("   ⚠️  entries table not found or empty");
        }
        console.log("\n2. 🎲 Checking lottery_entries table...");
        try {
            const lotteryEntriesResult = await connection_1.default.query(`
        SELECT 
          COUNT(*) as total_lottery_entries,
          COUNT(*) FILTER (WHERE verified = true) as verified_lottery_entries
        FROM lottery_entries
      `);
            const lotteryStats = {
                ...lotteryEntriesResult.rows[0],
                current_round_entries: 0,
                active_round_number: null,
            };
            console.log(`   Total lottery entries: ${lotteryStats.total_lottery_entries}`);
            console.log(`   Verified lottery entries: ${lotteryStats.verified_lottery_entries}`);
            const activeRoundResult = await connection_1.default.query(`
        SELECT id, round_number, total_entries, status
        FROM lottery_rounds 
        WHERE status = 'active'
        ORDER BY round_number DESC
        LIMIT 1
      `);
            if (activeRoundResult.rows.length > 0) {
                const activeRound = activeRoundResult.rows[0];
                lotteryStats.active_round_number = activeRound.round_number;
                lotteryStats.current_round_entries = activeRound.total_entries;
                console.log(`   Active round: ${activeRound.round_number} (${activeRound.status})`);
                console.log(`   Current round entries: ${activeRound.total_entries}`);
            }
            else {
                console.log("   No active round found");
            }
        }
        catch (error) {
            console.log("   ⚠️  lottery_entries table not found or empty");
        }
        console.log("\n3. 🏆 Checking lottery rounds summary...");
        try {
            const roundsResult = await connection_1.default.query(`
        SELECT 
          COUNT(*) as total_rounds,
          COUNT(*) FILTER (WHERE status = 'active') as active_rounds,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_rounds,
          COUNT(*) FILTER (WHERE status = 'drawing') as drawing_rounds,
          SUM(total_entries) as total_entries_all_rounds
        FROM lottery_rounds
      `);
            const roundStats = roundsResult.rows[0];
            console.log(`   Total rounds: ${roundStats.total_rounds}`);
            console.log(`   Active rounds: ${roundStats.active_rounds}`);
            console.log(`   Completed rounds: ${roundStats.completed_rounds}`);
            console.log(`   Drawing rounds: ${roundStats.drawing_rounds}`);
            console.log(`   Total entries across all rounds: ${roundStats.total_entries_all_rounds || 0}`);
        }
        catch (error) {
            console.log("   ⚠️  lottery_rounds table not found or empty");
        }
        console.log("\n4. 🕒 Recent lottery entries (last 10)...");
        try {
            const recentEntriesResult = await connection_1.default.query(`
        SELECT 
          le.wallet_address,
          le.token_id,
          le.verified,
          lr.round_number,
          le.created_at
        FROM lottery_entries le
        JOIN lottery_rounds lr ON le.round_id = lr.id
        ORDER BY le.created_at DESC
        LIMIT 10
      `);
            if (recentEntriesResult.rows.length > 0) {
                recentEntriesResult.rows.forEach((entry, index) => {
                    const status = entry.verified ? "✅" : "⏳";
                    const shortAddress = `${entry.wallet_address.slice(0, 6)}...${entry.wallet_address.slice(-4)}`;
                    console.log(`   ${index + 1}. ${status} Round ${entry.round_number} - ${shortAddress} (Token #${entry.token_id})`);
                });
            }
            else {
                console.log("   No recent entries found");
            }
        }
        catch (error) {
            console.log("   ⚠️  Could not fetch recent entries");
        }
        console.log("\n✅ Entry check completed successfully!");
    }
    catch (error) {
        console.error("❌ Error checking entries:", error.message);
        process.exit(1);
    }
    finally {
        await connection_1.default.end();
    }
}
if (require.main === module) {
    checkEntries().catch((error) => {
        console.error("❌ Unhandled error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=check-entries.js.map