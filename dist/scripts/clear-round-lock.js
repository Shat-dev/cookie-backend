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
exports.clearRoundLock = clearRoundLock;
const connection_1 = __importDefault(require("../db/connection"));
async function clearRoundLock() {
    console.log("🔓 Clearing PostgreSQL advisory lock for round creation...");
    try {
        const { rows } = await connection_1.default.query("SELECT pg_advisory_unlock($1)", [12345]);
        if (rows[0]?.pg_advisory_unlock) {
            console.log("✅ Advisory lock cleared successfully!");
        }
        else {
            console.log("ℹ️ No lock was held (or already released)");
        }
        console.log("\n📊 Current system status:");
        const { lottery } = await Promise.resolve().then(() => __importStar(require("../lotteryClient")));
        const currentRound = await lottery.s_currentRound();
        console.log(`   Current round: ${currentRound.toString()}`);
        if (currentRound === 0n) {
            console.log("   Status: No rounds exist yet");
            console.log("   Next: TwitterPoller should create first round on next mention processing");
        }
        else {
            console.log(`   Status: Round ${currentRound.toString()} exists`);
        }
    }
    catch (error) {
        console.error("❌ Error clearing lock:", error);
        process.exit(1);
    }
    finally {
        await connection_1.default.end();
        console.log("\n🏁 Lock clearing complete!");
    }
}
if (require.main === module) {
    clearRoundLock().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=clear-round-lock.js.map