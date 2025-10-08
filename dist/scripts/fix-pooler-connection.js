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
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
dotenv_1.default.config();
function validatePoolerConnection() {
    console.log("🔧 Validating Pooler Connection Setup\n");
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL not found in environment");
        return;
    }
    console.log("📋 Current DATABASE_URL Analysis:");
    try {
        const dbUrl = new url_1.URL(process.env.DATABASE_URL);
        console.log(`Protocol: ${dbUrl.protocol}`);
        console.log(`Username: ${dbUrl.username}`);
        console.log(`Password: ${dbUrl.password ? "[PRESENT]" : "[MISSING]"}`);
        console.log(`Hostname: ${dbUrl.hostname}`);
        console.log(`Port: ${dbUrl.port}`);
        console.log(`Database: ${dbUrl.pathname.slice(1)}`);
        console.log(`SSL Mode: ${dbUrl.searchParams.get("sslmode")}`);
        console.log("\n🔍 Pooler Validation:");
        const hostnameParts = dbUrl.hostname.split(".");
        console.log(`Hostname parts: ${hostnameParts.join(" | ")}`);
        if (hostnameParts.includes("pooler") &&
            hostnameParts.includes("supabase") &&
            hostnameParts.includes("com")) {
            if (hostnameParts[0].startsWith("aws-")) {
                console.log("❌ Using regional pooler (aws-0-*) - this is WRONG");
                console.log("🔧 Should use project-specific pooler instead");
                const projectRef = "uulzjchhneskrhkxznnk";
                const correctHost = `${projectRef}.pooler.supabase.com`;
                console.log(`✅ Correct hostname should be: ${correctHost}`);
                const correctUrl = new url_1.URL(process.env.DATABASE_URL);
                correctUrl.hostname = correctHost;
                correctUrl.port = "6543";
                console.log(`\n🎯 CORRECT DATABASE_URL:`);
                console.log(`DATABASE_URL="${correctUrl.toString()}"`);
            }
            else if (hostnameParts[0] === "uulzjchhneskrhkxznnk") {
                console.log("✅ Using correct project-specific pooler");
            }
            else {
                console.log("❌ Unknown pooler format");
            }
        }
        else {
            console.log("❌ Not using pooler connection - this will cause DNS issues");
        }
        if (dbUrl.port === "6543") {
            console.log("✅ Correct pooler port (6543)");
        }
        else if (dbUrl.port === "5432") {
            console.log("❌ Using direct connection port (5432) - should be 6543 for pooler");
        }
        else {
            console.log(`❌ Unexpected port: ${dbUrl.port}`);
        }
        if (dbUrl.username === "postgres") {
            console.log("✅ Correct username (postgres)");
        }
        else {
            console.log(`❌ Unexpected username: ${dbUrl.username} (should be postgres)`);
        }
        if (dbUrl.pathname.slice(1) === "postgres") {
            console.log("✅ Correct database name (postgres)");
        }
        else {
            console.log(`❌ Unexpected database: ${dbUrl.pathname.slice(1)} (should be postgres)`);
        }
        if (dbUrl.searchParams.get("sslmode") === "require") {
            console.log("✅ Correct SSL mode (require)");
        }
        else {
            console.log(`⚠️  SSL mode: ${dbUrl.searchParams.get("sslmode")} (should be 'require')`);
        }
    }
    catch (error) {
        console.error("❌ Failed to parse DATABASE_URL:", error);
    }
    console.log("\n🔧 Steps to Fix:");
    console.log("1. Go to Supabase Dashboard → Settings → Database");
    console.log("2. Find 'Connection pooling' section");
    console.log("3. Copy the EXACT connection string shown there");
    console.log("4. Update your Railway DATABASE_URL with that exact string");
    console.log("5. Make sure it uses: uulzjchhneskrhkxznnk.pooler.supabase.com:6543");
    console.log("\n🎯 Expected Format:");
    console.log("postgresql://postgres:Poptropica0606@uulzjchhneskrhkxznnk.pooler.supabase.com:6543/postgres?sslmode=require");
    console.log("\n⚠️  Common Mistakes:");
    console.log("- Using aws-0-us-west-1.pooler.supabase.com (regional) ❌");
    console.log("- Using port 5432 instead of 6543 ❌");
    console.log("- Using db.uulzjchhneskrhkxznnk.supabase.co (direct connection) ❌");
    console.log("- Adding quotes around the URL in Railway ❌");
}
async function testPoolerConnection() {
    console.log("\n🔄 Testing Pooler Connection...");
    if (!process.env.DATABASE_URL) {
        console.error("❌ No DATABASE_URL to test");
        return;
    }
    try {
        const { Pool } = await Promise.resolve().then(() => __importStar(require("pg")));
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000,
        });
        console.log("🔄 Attempting connection...");
        const result = await pool.query("SELECT NOW(), current_user, current_database()");
        console.log("✅ Connection successful!");
        console.log(`   Time: ${result.rows[0].now}`);
        console.log(`   User: ${result.rows[0].current_user}`);
        console.log(`   Database: ${result.rows[0].current_database}`);
        await pool.end();
    }
    catch (error) {
        console.error("❌ Connection failed:", error);
        if (error.message?.includes("Tenant or user not found")) {
            console.log("\n🔧 'Tenant or user not found' suggests:");
            console.log("- Wrong hostname (use project-specific pooler)");
            console.log("- Wrong credentials");
            console.log("- Wrong port");
        }
    }
}
console.log("DB URL host:", process.env.DATABASE_URL
    ? new url_1.URL(process.env.DATABASE_URL).host
    : "NO DATABASE_URL");
validatePoolerConnection();
testPoolerConnection()
    .then(() => {
    console.log("\n✅ Validation completed");
})
    .catch((err) => {
    console.error("\n❌ Validation failed:", err);
});
//# sourceMappingURL=fix-pooler-connection.js.map