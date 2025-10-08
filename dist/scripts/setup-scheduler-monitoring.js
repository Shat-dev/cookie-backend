#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const connection_1 = __importDefault(require("../db/connection"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
async function setupSchedulerMonitoring() {
    console.log("🔧 Setting up scheduler monitoring...");
    try {
        const sqlPath = path_1.default.join(__dirname, "../db/scheduler-heartbeats.sql");
        const sql = fs_1.default.readFileSync(sqlPath, "utf8");
        await connection_1.default.query(sql);
        console.log("✅ Scheduler monitoring tables and functions created successfully");
        const result = await connection_1.default.query(`
      SELECT table_name, function_name 
      FROM information_schema.tables t
      LEFT JOIN information_schema.routines r ON r.routine_name LIKE '%scheduler%'
      WHERE t.table_name = 'scheduler_heartbeats'
    `);
        console.log("📊 Verification results:", result.rows);
        await connection_1.default.query("SELECT update_scheduler_heartbeat('test', 100)");
        console.log("✅ Heartbeat function test successful");
        await connection_1.default.query("DELETE FROM scheduler_heartbeats WHERE service = 'test'");
        console.log("✅ Test data cleaned up");
    }
    catch (error) {
        console.error("❌ Failed to setup scheduler monitoring:", error.message);
        throw error;
    }
    finally {
        await connection_1.default.end();
    }
}
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
//# sourceMappingURL=setup-scheduler-monitoring.js.map