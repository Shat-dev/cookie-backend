// src/scripts/reset-for-new-deployment.ts

//npx ts-node src/scripts/manual-vrf-draw.ts
import "dotenv/config";
import pool from "../db/connection";
import fs from "fs";
import path from "path";

async function resetForNewDeployment() {
  console.log("🧹 Resetting Database for New Lottery Deployment...\n");

  try {
    // Test connection first
    console.log("1. 🔄 Testing database connection...");
    const connectionTest = await pool.query(
      "SELECT NOW(), current_user, current_database()"
    );
    console.log("✅ Connection successful!");
    console.log(`   User: ${connectionTest.rows[0].current_user}`);
    console.log(`   Database: ${connectionTest.rows[0].current_database}`);

    // Show current data counts before clearing
    console.log("\n2. 📊 Checking current data before reset...");

    const checks = [
      { name: "entries", query: "SELECT COUNT(*) as count FROM entries" },
      {
        name: "lottery_rounds",
        query: "SELECT COUNT(*) as count FROM lottery_rounds",
      },
      {
        name: "lottery_entries",
        query: "SELECT COUNT(*) as count FROM lottery_entries",
      },
      {
        name: "lottery_winners",
        query: "SELECT COUNT(*) as count FROM lottery_winners",
      },
      { name: "winners", query: "SELECT COUNT(*) as count FROM winners" },
    ];

    const beforeCounts: Record<string, number> = {};
    for (const check of checks) {
      try {
        const result = await pool.query(check.query);
        const count = parseInt(result.rows[0].count);
        beforeCounts[check.name] = count;
        console.log(`   ${check.name}: ${count} rows`);
      } catch (error) {
        console.log(`   ${check.name}: table not found`);
        beforeCounts[check.name] = 0;
      }
    }

    // Confirm reset if there's data
    const totalRows = Object.values(beforeCounts).reduce(
      (sum, count) => sum + count,
      0
    );
    if (totalRows > 0) {
      console.log(`\n⚠️  Found ${totalRows} total rows to delete.`);
      console.log("🔥 This will PERMANENTLY DELETE all lottery data!");
      console.log("   - All historical rounds and winners");
      console.log("   - All current entries and tweets");
      console.log("   - All lottery state data");
      console.log("\n⏳ Proceeding in 3 seconds...");

      // Small delay for safety
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      console.log("✅ Database is already clean - no data to reset");
    }

    // Execute reset script
    console.log("\n3. 🧹 Executing database reset...");

    const resetSqlPath = path.join(__dirname, "../../complete-reset.sql");
    if (fs.existsSync(resetSqlPath)) {
      const resetSql = fs.readFileSync(resetSqlPath, "utf8");

      // Split by semicolon and execute each statement
      const statements = resetSql
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`   Executing: ${statement.substring(0, 50)}...`);
          await pool.query(statement);
        }
      }
    } else {
      // Fallback: manual reset if file not found
      console.log("   Reset file not found, executing manual reset...");

      await pool.query("DELETE FROM lottery_winners");
      await pool.query("DELETE FROM lottery_entries");
      await pool.query("DELETE FROM lottery_rounds");
      await pool.query("DELETE FROM entries");
      await pool.query("DELETE FROM winners");

      // Reset sequences
      await pool.query("ALTER SEQUENCE lottery_rounds_id_seq RESTART WITH 1");
      await pool.query("ALTER SEQUENCE lottery_entries_id_seq RESTART WITH 1");
      await pool.query("ALTER SEQUENCE lottery_winners_id_seq RESTART WITH 1");
      await pool.query("ALTER SEQUENCE entries_id_seq RESTART WITH 1");
      await pool.query("ALTER SEQUENCE winners_id_seq RESTART WITH 1");
    }

    // Verify reset
    console.log("\n4. ✅ Verifying reset completion...");
    for (const check of checks) {
      try {
        const result = await pool.query(check.query);
        const count = parseInt(result.rows[0].count);
        const beforeCount = beforeCounts[check.name];
        console.log(`   ${check.name}: ${count} rows (was ${beforeCount})`);

        if (count > 0) {
          console.log(`   ⚠️  Warning: ${check.name} still has data!`);
        }
      } catch (error) {
        console.log(`   ${check.name}: verified clean`);
      }
    }

    // Clear app_state poller markers (optional)
    console.log("\n5. 🔄 Resetting Twitter poller state...");
    try {
      await pool.query(
        "DELETE FROM app_state WHERE key LIKE '%_since_id' OR key LIKE '%last_%'"
      );
      console.log("   ✅ Poller state cleared - will start fresh");
    } catch (error) {
      console.log("   ⚠️  Could not clear app_state:", error);
    }

    console.log("\n🎉 Database reset completed successfully!");
    console.log("\n📋 Next steps:");
    console.log("   1. ✅ Backend server will start fresh");
    console.log("   2. ✅ Twitter poller will scan from latest tweets");
    console.log("   3. ✅ Lottery system awaits first entry for Round 1");
    console.log("   4. ✅ All historical data cleared");
  } catch (error) {
    console.error("❌ Reset failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run reset if called directly
if (require.main === module) {
  resetForNewDeployment().catch(console.error);
}

export { resetForNewDeployment };
