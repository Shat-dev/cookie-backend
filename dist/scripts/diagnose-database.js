#!/usr/bin/env ts-node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diagnoseDatabaseState = diagnoseDatabaseState;
const connection_1 = __importDefault(require("../db/connection"));
async function diagnoseDatabaseState() {
    console.log("🔍 Diagnosing Railway database state...\n");
    try {
        console.log("1. 📡 Testing database connection...");
        const { rows: testRows } = await connection_1.default.query("SELECT NOW() as current_time, current_user");
        console.log(`   ✅ Connected as: ${testRows[0].current_user}`);
        console.log(`   ✅ Server time: ${testRows[0].current_time}\n`);
        console.log("2. 📋 Checking database schema...");
        const { rows: tables } = await connection_1.default.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
        console.log(`   Found ${tables.length} tables:`);
        tables.forEach((table) => console.log(`   - ${table.table_name}`));
        console.log();
        if (tables.some((t) => t.table_name === "entries")) {
            console.log("3. 🎫 Checking entries table...");
            const { rows: entryCount } = await connection_1.default.query("SELECT COUNT(*) as count FROM entries");
            console.log(`   Total entries: ${entryCount[0].count}`);
            if (entryCount[0].count > 0) {
                const { rows: recentEntries } = await connection_1.default.query(`
          SELECT wallet_address, token_id, tweet_id, created_at 
          FROM entries 
          ORDER BY created_at DESC 
          LIMIT 5
        `);
                console.log("   Recent entries:");
                recentEntries.forEach((entry) => {
                    console.log(`   - ${entry.wallet_address} token ${entry.token_id} (${entry.created_at})`);
                });
            }
            console.log();
        }
        if (tables.some((t) => t.table_name === "app_state")) {
            console.log("4. ⚙️ Checking app_state (locks and flags)...");
            const { rows: appState } = await connection_1.default.query("SELECT key, value FROM app_state ORDER BY key");
            console.log(`   Found ${appState.length} state entries:`);
            appState.forEach((state) => {
                console.log(`   - ${state.key}: ${state.value}`);
            });
            console.log();
        }
        console.log("5. 🔒 Checking PostgreSQL advisory locks...");
        const { rows: locks } = await connection_1.default.query(`
      SELECT 
        locktype, 
        objid,
        mode,
        granted,
        pid
      FROM pg_locks 
      WHERE locktype = 'advisory'
    `);
        if (locks.length > 0) {
            console.log(`   Found ${locks.length} advisory locks:`);
            locks.forEach((lock) => {
                console.log(`   - Lock ID ${lock.objid}: ${lock.mode} (PID: ${lock.pid}, Granted: ${lock.granted})`);
            });
            const ourLock = locks.find((lock) => lock.objid === 12345);
            if (ourLock) {
                console.log(`   ⚠️ Round creation lock (12345) IS HELD by PID ${ourLock.pid}`);
            }
            else {
                console.log(`   ✅ Round creation lock (12345) is NOT held`);
            }
        }
        else {
            console.log("   ✅ No advisory locks found");
        }
        console.log();
        console.log("6. 🎲 Checking smart contract state...");
        try {
            const { lottery } = await Promise.resolve().then(() => __importStar(require("../lotteryClient")));
            const currentRound = await lottery.s_currentRound();
            console.log(`   Current round on contract: ${currentRound.toString()}`);
            if (currentRound > 0n) {
                try {
                    const { getRound } = await Promise.resolve().then(() => __importStar(require("../lotteryClient")));
                    const roundData = await getRound(Number(currentRound));
                    console.log(`   Round ${currentRound} details:`, {
                        start: new Date(Number(roundData.start) * 1000).toISOString(),
                        end: new Date(Number(roundData.end) * 1000).toISOString(),
                        isActive: roundData.isActive,
                        isCompleted: roundData.isCompleted,
                    });
                }
                catch (err) {
                    console.log(`   ⚠️ Could not fetch round details: ${err}`);
                }
            }
        }
        catch (err) {
            console.log(`   ⚠️ Could not check contract: ${err?.message || err}`);
        }
        console.log();
        console.log("📊 DIAGNOSIS SUMMARY:");
        console.log("====================");
        let hasEntries = false;
        try {
            const { rows: entryCount } = await connection_1.default.query("SELECT COUNT(*) as count FROM entries WHERE 1=1");
            hasEntries = entryCount[0]?.count > 0;
        }
        catch {
            hasEntries = false;
        }
        const ourLockExists = locks.some((lock) => lock.objid === 12345);
        if (hasEntries && !ourLockExists) {
            console.log("✅ Database has entries and no advisory lock blocking");
            console.log("   → Round creation should work on next TwitterPoller cycle");
        }
        else if (hasEntries && ourLockExists) {
            console.log("⚠️ Database has entries BUT advisory lock is blocking round creation");
            console.log("   → Run: npm run clear-round-lock");
        }
        else if (!hasEntries) {
            console.log("ℹ️ Database has no entries yet");
            console.log("   → Need valid Twitter mentions to create entries first");
        }
    }
    catch (error) {
        console.error("❌ Error during diagnosis:", error);
    }
    finally {
        await connection_1.default.end();
        console.log("\n🏁 Database diagnosis complete!");
    }
}
if (require.main === module) {
    diagnoseDatabaseState().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=diagnose-database.js.map