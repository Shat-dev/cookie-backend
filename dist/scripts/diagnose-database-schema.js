"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const connection_1 = __importDefault(require("../db/connection"));
dotenv_1.default.config();
async function diagnoseDatabaseSchema() {
    console.log("🔍 Diagnosing Database Schema and Permissions...\n");
    try {
        console.log("1. 🔄 Testing basic connection...");
        const connectionTest = await connection_1.default.query("SELECT NOW(), current_user, current_database()");
        console.log("✅ Connection successful!");
        console.log(`   Time: ${connectionTest.rows[0].now}`);
        console.log(`   User: ${connectionTest.rows[0].current_user}`);
        console.log(`   Database: ${connectionTest.rows[0].current_database}`);
        console.log("\n2. 🔄 Checking available schemas...");
        const schemasResult = await connection_1.default.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name
    `);
        console.log("📊 Available schemas:");
        schemasResult.rows.forEach((row) => {
            console.log(`   - ${row.schema_name}`);
        });
        console.log("\n3. 🔄 Checking tables in public schema...");
        const tablesResult = await connection_1.default.query(`
      SELECT table_name, table_type 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
        if (tablesResult.rows.length === 0) {
            console.log("❌ No tables found in public schema!");
            console.log("📝 This explains the 'Tenant or user not found' error");
        }
        else {
            console.log("📊 Tables in public schema:");
            tablesResult.rows.forEach((row) => {
                console.log(`   - ${row.table_name} (${row.table_type})`);
            });
        }
        console.log("\n4. 🔄 Checking for expected tables...");
        const expectedTables = [
            "entries",
            "lottery_rounds",
            "winners",
            "app_state",
            "users",
            "tenants",
        ];
        for (const tableName of expectedTables) {
            try {
                const tableCheck = await connection_1.default.query(`
          SELECT COUNT(*) as count 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = $1
        `, [tableName]);
                if (tableCheck.rows[0].count > 0) {
                    console.log(`   ✅ ${tableName} exists`);
                    try {
                        const rowCount = await connection_1.default.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                        console.log(`      Rows: ${rowCount.rows[0].count}`);
                    }
                    catch (err) {
                        console.log(`      ❌ Cannot count rows: ${err.message}`);
                    }
                }
                else {
                    console.log(`   ❌ ${tableName} missing`);
                }
            }
            catch (err) {
                console.log(`   ❌ Error checking ${tableName}: ${err.message}`);
            }
        }
        console.log("\n5. 🔄 Checking user permissions...");
        try {
            const permissionsResult = await connection_1.default.query(`
        SELECT 
          grantee,
          table_schema,
          table_name,
          privilege_type
        FROM information_schema.role_table_grants 
        WHERE grantee = current_user
        AND table_schema = 'public'
        ORDER BY table_name, privilege_type
      `);
            if (permissionsResult.rows.length === 0) {
                console.log("⚠️  No explicit table permissions found (might be using superuser)");
            }
            else {
                console.log("📊 User permissions:");
                permissionsResult.rows.forEach((row) => {
                    console.log(`   ${row.table_name}: ${row.privilege_type}`);
                });
            }
        }
        catch (err) {
            console.log(`❌ Error checking permissions: ${err.message}`);
        }
        console.log("\n6. 📋 Analysis:");
        if (tablesResult.rows.length === 0) {
            console.log("🔍 Database appears to be empty. This is likely why you're getting 'Tenant or user not found'");
            console.log("\n🔧 Recommended actions:");
            console.log("1. Run database migrations to create tables");
            console.log("2. Check if you have schema files to import");
            console.log("3. Look for SQL files in your project (schema.sql, migrations, etc.)");
            console.log("\n📁 Looking for schema files in your project...");
            try {
                const fs = require("fs");
                const path = require("path");
                const sqlFiles = [
                    "../db/schema.sql",
                    "../db/lottery-schema.sql",
                    "../clear-lottery-db.sql",
                    "./schema.sql",
                ];
                for (const sqlFile of sqlFiles) {
                    try {
                        const fullPath = path.resolve(__dirname, sqlFile);
                        if (fs.existsSync(fullPath)) {
                            console.log(`   ✅ Found: ${sqlFile}`);
                        }
                    }
                    catch (err) {
                    }
                }
            }
            catch (err) {
                console.log("   ❌ Error checking for schema files");
            }
        }
    }
    catch (error) {
        console.error("❌ Database diagnosis failed:", error);
        if (error.code === "ECONNREFUSED") {
            console.log("🔧 Connection refused - check if database is running");
        }
        else if (error.code === "28P01") {
            console.log("🔧 Authentication failed - check credentials");
        }
        else if (error.code === "3D000") {
            console.log("🔧 Database does not exist");
        }
    }
}
diagnoseDatabaseSchema()
    .then(() => {
    console.log("\n✅ Database diagnosis completed");
    process.exit(0);
})
    .catch((err) => {
    console.error("\n❌ Diagnosis failed:", err);
    process.exit(1);
});
//# sourceMappingURL=diagnose-database-schema.js.map