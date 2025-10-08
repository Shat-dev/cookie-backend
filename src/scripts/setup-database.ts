import dotenv from "dotenv";
import pool from "../db/connection";
import fs from "fs";
import path from "path";

dotenv.config();

async function setupDatabase() {
  console.log("🔧 Setting up Database Schema...\n");

  try {
    // Test connection first
    console.log("1. 🔄 Testing database connection...");
    const connectionTest = await pool.query(
      "SELECT NOW(), current_user, current_database()"
    );
    console.log("✅ Connection successful!");
    console.log(`   User: ${connectionTest.rows[0].current_user}`);
    console.log(`   Database: ${connectionTest.rows[0].current_database}`);

    // Check if tables already exist
    console.log("\n2. 🔄 Checking existing tables...");
    const existingTables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (existingTables.rows.length > 0) {
      console.log("📊 Existing tables found:");
      existingTables.rows.forEach((row) => {
        console.log(`   - ${row.table_name}`);
      });
      console.log("\n⚠️  Database already has tables. Continue anyway? (y/N)");
      // For script automation, we'll continue
      console.log("Continuing with schema setup...");
    } else {
      console.log("📋 No tables found - fresh database detected");
    }

    // Define SQL files to run in order
    const sqlFiles = [
      {
        name: "Main Schema",
        path: path.join(__dirname, "../db/schema.sql"),
      },
      {
        name: "Lottery Schema",
        path: path.join(__dirname, "../db/lottery-schema.sql"),
      },
      {
        name: "Push Tracking Addition",
        path: path.join(__dirname, "../db/add-push-tracking.sql"),
      },
    ];

    console.log("\n3. 🔄 Running SQL schema files...");

    for (const sqlFile of sqlFiles) {
      try {
        console.log(`\n📁 Processing: ${sqlFile.name}`);
        console.log(`   File: ${sqlFile.path}`);

        if (!fs.existsSync(sqlFile.path)) {
          console.log(`   ⚠️  File not found, skipping...`);
          continue;
        }

        const sqlContent = fs.readFileSync(sqlFile.path, "utf8");
        console.log(`   📏 Size: ${sqlContent.length} characters`);

        // Execute the SQL
        await pool.query(sqlContent);
        console.log(`   ✅ ${sqlFile.name} executed successfully`);
      } catch (error) {
        console.error(`   ❌ Error executing ${sqlFile.name}:`, error);
        // Continue with other files even if one fails
      }
    }

    // Verify schema setup
    console.log("\n4. 🔄 Verifying schema setup...");
    const finalTables = await pool.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log("📊 Final database schema:");
    finalTables.rows.forEach((row) => {
      console.log(`   ✅ ${row.table_name} (${row.column_count} columns)`);
    });

    // Check for required tables
    const requiredTables = [
      "entries",
      "winners",
      "app_state",
      "lottery_rounds",
    ];
    console.log("\n5. 🔄 Checking required tables...");

    for (const tableName of requiredTables) {
      const tableExists = finalTables.rows.some(
        (row) => row.table_name === tableName
      );
      if (tableExists) {
        console.log(`   ✅ ${tableName} ready`);
      } else {
        console.log(`   ❌ ${tableName} missing`);
      }
    }

    // Initialize app_state if empty
    console.log("\n6. 🔄 Initializing app_state...");
    try {
      const appStateCount = await pool.query(
        "SELECT COUNT(*) as count FROM app_state"
      );
      if (appStateCount.rows[0].count === 0) {
        console.log("   📝 Initializing app_state with default values...");
        await pool.query(`
          INSERT INTO app_state (key, value) VALUES 
          ('twitter_last_id', '0'),
          ('last_processed_tweet', '0')
          ON CONFLICT (key) DO NOTHING
        `);
        console.log("   ✅ app_state initialized");
      } else {
        console.log("   ✅ app_state already has data");
      }
    } catch (error) {
      console.log(
        `   ❌ Could not initialize app_state: ${(error as Error).message}`
      );
    }

    console.log("\n✅ Database setup completed!");
    console.log("\n🎯 Next steps:");
    console.log("1. Your database schema is now ready");
    console.log("2. Deploy your backend to Railway");
    console.log("3. The 'Tenant or user not found' error should be resolved");
  } catch (error) {
    console.error("❌ Database setup failed:", error);
    throw error;
  }
}

setupDatabase()
  .then(() => {
    console.log("\n✅ Setup script completed successfully");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Setup script failed:", err);
    process.exit(1);
  });
