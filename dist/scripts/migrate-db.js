"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = require("fs");
const path_1 = require("path");
const connection_1 = __importDefault(require("../db/connection"));
async function runMigration() {
    console.log("🗄️  Running database migration...");
    try {
        const migrationPath = (0, path_1.join)(__dirname, "../db/add-push-tracking.sql");
        const migrationSQL = (0, fs_1.readFileSync)(migrationPath, "utf8");
        const statements = migrationSQL
            .split(";")
            .map((stmt) => stmt.trim())
            .filter((stmt) => stmt.length > 0);
        console.log(`Executing ${statements.length} SQL statements...`);
        for (const statement of statements) {
            if (statement.trim()) {
                console.log(`Executing: ${statement.substring(0, 50)}...`);
                await connection_1.default.query(statement);
            }
        }
        console.log("✅ Database migration completed successfully");
    }
    catch (error) {
        console.error("❌ Migration failed:", error.message);
        process.exit(1);
    }
    finally {
        await connection_1.default.end();
    }
}
if (require.main === module) {
    runMigration()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error("Migration script failed:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate-db.js.map