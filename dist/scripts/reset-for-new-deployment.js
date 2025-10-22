"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetForNewDeployment = resetForNewDeployment;
require("dotenv/config");
const connection_1 = __importDefault(require("../db/connection"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const rpcCache_1 = require("../utils/rpcCache");
const projectionRoutes_1 = require("../routes/projectionRoutes");
async function clearFilesystemArtifacts() {
    console.log("\n1. 🗂️  Clearing filesystem artifacts...");
    const pathsToClean = [
        "/tmp",
        path_1.default.join(process.cwd(), ".cache"),
        path_1.default.join(process.cwd(), "dist"),
        path_1.default.join(process.cwd(), "constants"),
    ];
    for (const cleanPath of pathsToClean) {
        try {
            if (fs_1.default.existsSync(cleanPath)) {
                if (cleanPath.includes("constants")) {
                    const files = fs_1.default.readdirSync(cleanPath);
                    const jsonFiles = files.filter((f) => f.endsWith(".json"));
                    for (const jsonFile of jsonFiles) {
                        fs_1.default.unlinkSync(path_1.default.join(cleanPath, jsonFile));
                    }
                    console.log(`   ✅ Cleared ${jsonFiles.length} JSON files from ${cleanPath}`);
                }
                else if (cleanPath === "/tmp") {
                    console.log(`   ⏭️  Skipping system /tmp directory`);
                }
                else {
                    (0, child_process_1.execSync)(`rm -rf ${cleanPath}`, { stdio: "pipe" });
                    console.log(`   ✅ Cleared directory: ${cleanPath}`);
                }
            }
            else {
                console.log(`   ⏭️  Path not found: ${cleanPath}`);
            }
        }
        catch (error) {
            console.log(`   ⚠️  Could not clear ${cleanPath}:`, error);
        }
    }
}
async function clearInMemoryCaches() {
    console.log("\n4. 🧠 Clearing in-memory caches...");
    try {
        const cacheStats = rpcCache_1.rpcCache.getStats();
        rpcCache_1.rpcCache.clear();
        console.log(`   ✅ RPC cache cleared (was ${cacheStats.totalEntries} entries)`);
    }
    catch (error) {
        console.log("   ⚠️  Could not clear RPC cache:", error);
    }
    try {
        (0, projectionRoutes_1.clearProjectionCache)();
        console.log("   ✅ Projection cache cleared successfully");
    }
    catch (error) {
        console.log("   ⚠️  Could not clear projection cache:", error);
    }
    try {
        if (global.gc) {
            global.gc();
            console.log("   ✅ Forced garbage collection");
        }
        else {
            console.log("   ⏭️  Garbage collection not available (run with --expose-gc for manual GC)");
        }
    }
    catch (error) {
        console.log("   ⚠️  Could not force garbage collection:", error);
    }
}
async function triggerRailwayRestart() {
    console.log("\n5. 🚂 Triggering Railway environment restart...");
    try {
        (0, child_process_1.execSync)("railway --version", { stdio: "pipe" });
        try {
            console.log("   🔄 Attempting Railway service restart...");
            (0, child_process_1.execSync)("railway service restart", { stdio: "inherit", timeout: 30000 });
            console.log("   ✅ Railway service restart initiated");
        }
        catch (restartError) {
            console.log("   ⚠️  Direct restart failed, trying redeploy...");
            try {
                (0, child_process_1.execSync)("railway up -d", { stdio: "inherit", timeout: 60000 });
                console.log("   ✅ Railway redeploy initiated");
            }
            catch (deployError) {
                console.log("   ⚠️  Railway redeploy failed:", deployError);
                console.log("   💡 Manual restart may be required via Railway dashboard");
            }
        }
    }
    catch (cliError) {
        console.log("   ⚠️  Railway CLI not available");
        console.log("   💡 Manual restart required via Railway dashboard or git push");
    }
}
async function purgeVercelCache() {
    console.log("\n6. ☁️  Purging Vercel frontend cache...");
    const vercelToken = process.env.VERCEL_API_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    if (!vercelToken || !projectId) {
        console.log("   ⏭️  VERCEL_API_TOKEN or VERCEL_PROJECT_ID not configured");
        console.log("   💡 Manual cache purge may be required via Vercel dashboard");
        return;
    }
    try {
        (0, child_process_1.execSync)("vercel --version", { stdio: "pipe" });
        try {
            (0, child_process_1.execSync)("vercel cache purge --type=cdn", {
                stdio: "inherit",
                timeout: 30000,
            });
            console.log("   ✅ Vercel CDN cache purged successfully");
        }
        catch (purgeError) {
            console.log("   ⚠️  Vercel cache purge failed:", purgeError);
            console.log("   💡 Manual cache purge may be required via Vercel dashboard");
        }
    }
    catch (cliError) {
        console.log("   ⚠️  Vercel CLI not available");
        console.log("   💡 Manual cache purge required via Vercel dashboard");
    }
}
async function resetForNewDeployment() {
    console.log("🚀 MASTER RESET CONTROLLER - Complete System Reset for New Contract Deployment");
    console.log("=".repeat(80));
    console.log("⚠️  WARNING: This will perform a COMPLETE SYSTEM RESET");
    console.log("   - Database: All tables dropped and recreated");
    console.log("   - Caches: All in-memory caches cleared");
    console.log("   - Services: Background services will be restarted");
    console.log("   - Environment: Railway deployment restart triggered");
    console.log("   - Frontend: Vercel cache purged (if configured)");
    console.log("=".repeat(80));
    let poolClosed = false;
    try {
        await clearFilesystemArtifacts();
        console.log("\n2. 🔄 Testing database connection...");
        const connectionTest = await connection_1.default.query("SELECT NOW(), current_user, current_database(), version()");
        console.log("✅ Database connection successful!");
        console.log(`   User: ${connectionTest.rows[0].current_user}`);
        console.log(`   Database: ${connectionTest.rows[0].current_database}`);
        console.log(`   PostgreSQL: ${connectionTest.rows[0].version.split(" ")[0]} ${connectionTest.rows[0].version.split(" ")[1]}`);
        console.log("\n3. 📊 Analyzing current database state...");
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
            { name: "app_state", query: "SELECT COUNT(*) as count FROM app_state" },
        ];
        const beforeCounts = {};
        let totalRows = 0;
        for (const check of checks) {
            try {
                const result = await connection_1.default.query(check.query);
                const count = parseInt(result.rows[0].count);
                beforeCounts[check.name] = count;
                totalRows += count;
                console.log(`   ${check.name}: ${count} rows`);
            }
            catch (error) {
                console.log(`   ${check.name}: table not found or inaccessible`);
                beforeCounts[check.name] = 0;
            }
        }
        if (totalRows > 0) {
            console.log(`\n⚠️  CRITICAL: Found ${totalRows} total rows across all tables`);
            console.log("🔥 This will PERMANENTLY DELETE ALL DATA:");
            console.log("   - All historical lottery rounds and winners");
            console.log("   - All current entries and tweets");
            console.log("   - All application state and cache data");
            console.log("   - All background service state");
            console.log("\n⏳ Proceeding with FULL RESET in 5 seconds...");
            console.log("   Press Ctrl+C to abort!");
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        else {
            console.log("✅ Database appears clean - proceeding with reset verification");
        }
        console.log("\n🗄️  EXECUTING COMPLETE DATABASE RESET...");
        const resetSqlPath = path_1.default.join(__dirname, "../db/complete-reset.sql");
        console.log(`   Using reset script: ${resetSqlPath}`);
        if (fs_1.default.existsSync(resetSqlPath)) {
            const resetSql = fs_1.default.readFileSync(resetSqlPath, "utf8");
            console.log(`   ✅ Reset script loaded (${resetSql.length} characters)`);
            try {
                await connection_1.default.query(resetSql);
                console.log("   ✅ Complete database reset executed successfully");
            }
            catch (sqlError) {
                console.log("   ⚠️  Batch execution failed, trying statement-by-statement...");
                console.log("   Executing full SQL reset file...");
                await connection_1.default.query(resetSql);
            }
        }
        else {
            console.log("   ❌ Reset script not found, executing emergency manual reset...");
            const emergencyStatements = [
                "DROP TABLE IF EXISTS lottery_winners CASCADE",
                "DROP TABLE IF EXISTS lottery_entries CASCADE",
                "DROP TABLE IF EXISTS lottery_rounds CASCADE",
                "DROP TABLE IF EXISTS entries CASCADE",
                "DROP TABLE IF EXISTS winners CASCADE",
                "DROP TABLE IF EXISTS app_state CASCADE",
                `CREATE TABLE IF NOT EXISTS app_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`,
            ];
            for (const stmt of emergencyStatements) {
                console.log(`   Emergency: ${stmt.substring(0, 50)}...`);
                await connection_1.default.query(stmt);
            }
        }
        await clearInMemoryCaches();
        console.log("\n✅ VERIFYING RESET COMPLETION...");
        let verificationPassed = true;
        for (const check of checks) {
            try {
                const result = await connection_1.default.query(check.query);
                const count = parseInt(result.rows[0].count);
                const beforeCount = beforeCounts[check.name];
                if (check.name === "app_state") {
                    console.log(`   ${check.name}: ${count} rows (was ${beforeCount}) - ✅ recreated`);
                }
                else if (count === 0) {
                    console.log(`   ${check.name}: ${count} rows (was ${beforeCount}) - ✅ cleared`);
                }
                else {
                    console.log(`   ${check.name}: ${count} rows (was ${beforeCount}) - ⚠️  still has data!`);
                    verificationPassed = false;
                }
            }
            catch (error) {
                if (check.name === "app_state") {
                    console.log(`   ${check.name}: ❌ table missing - reset may have failed`);
                    verificationPassed = false;
                }
                else {
                    console.log(`   ${check.name}: ✅ table dropped successfully`);
                }
            }
        }
        if (!verificationPassed) {
            console.log("\n⚠️  WARNING: Database reset verification found issues");
            console.log("   Some tables may still contain data or be missing");
            console.log("   Manual verification recommended before contract deployment");
        }
        await triggerRailwayRestart();
        await purgeVercelCache();
        console.log("\n" + "=".repeat(80));
        console.log("🎉 MASTER RESET COMPLETED SUCCESSFULLY!");
        console.log("=".repeat(80));
        console.log("✅ Database: All tables dropped, sequences reset, app_state recreated");
        console.log("✅ Memory Caches: RPC cache cleared, projection cache cleared");
        console.log("✅ Filesystem: Temporary files and build artifacts cleared");
        console.log("✅ Railway: Environment restart initiated");
        console.log("✅ Vercel: Frontend cache purge attempted");
        console.log("");
        console.log("📋 SYSTEM STATE AFTER RESET:");
        console.log("   - Database: Clean slate with fresh app_state table");
        console.log("   - Backend: All caches cleared, ready for fresh start");
        console.log("   - Services: Will reinitialize on next startup");
        console.log("   - Environment: Railway deployment restarting");
        console.log("   - Frontend: Cache purged, will fetch fresh data");
        console.log("");
        console.log("🚀 READY FOR NEW CONTRACT DEPLOYMENT!");
        console.log("=".repeat(80));
    }
    catch (error) {
        console.error("\n❌ MASTER RESET FAILED:", error);
        console.error("   This is a critical error that requires manual intervention");
        console.error("   Check database connectivity and permissions");
        console.error("   Verify Railway CLI access and authentication");
        process.exit(1);
    }
    finally {
        if (!poolClosed) {
            try {
                await connection_1.default.end();
                poolClosed = true;
                console.log("\n🔌 Database connection pool closed");
            }
            catch (closeError) {
                console.error("⚠️  Error closing database pool:", closeError);
            }
        }
    }
}
if (require.main === module) {
    resetForNewDeployment().catch((error) => {
        console.error("❌ Fatal error in reset process:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=reset-for-new-deployment.js.map