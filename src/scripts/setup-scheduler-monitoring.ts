#!/usr/bin/env ts-node

/**
 * Setup script for scheduler monitoring
 * Run this to create the necessary database tables and functions
 */

import pool from "../db/connection";
import fs from "fs";
import path from "path";

async function setupSchedulerMonitoring() {
  console.log("🔧 Setting up scheduler monitoring...");

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, "../db/scheduler-heartbeats.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Execute the SQL
    await pool.query(sql);

    console.log(
      "✅ Scheduler monitoring tables and functions created successfully"
    );

    // Verify the setup
    const result = await pool.query(`
      SELECT table_name, function_name 
      FROM information_schema.tables t
      LEFT JOIN information_schema.routines r ON r.routine_name LIKE '%scheduler%'
      WHERE t.table_name = 'scheduler_heartbeats'
    `);

    console.log("📊 Verification results:", result.rows);

    // Test the heartbeat function
    await pool.query("SELECT update_scheduler_heartbeat('test', 100)");
    console.log("✅ Heartbeat function test successful");

    // Clean up test data
    await pool.query("DELETE FROM scheduler_heartbeats WHERE service = 'test'");
    console.log("✅ Test data cleaned up");
  } catch (error: any) {
    console.error("❌ Failed to setup scheduler monitoring:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  setupSchedulerMonitoring()
    .then(() => {
      console.log("🎉 Setup complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Setup failed:", error);
      process.exit(1);
    });
}
