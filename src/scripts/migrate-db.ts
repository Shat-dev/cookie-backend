import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import pool from "../db/connection";

async function runMigration() {
  console.log("🗄️  Running database migration...");

  try {
    // Read the migration SQL file
    const migrationPath = join(__dirname, "../db/add-push-tracking.sql");
    const migrationSQL = readFileSync(migrationPath, "utf8");

    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0);

    console.log(`Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await pool.query(statement);
      }
    }

    console.log("✅ Database migration completed successfully");
  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}
