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
const node_dns_1 = __importDefault(require("node:dns"));
const util_1 = require("util");
dotenv_1.default.config();
const dnsLookup = (0, util_1.promisify)(node_dns_1.default.lookup);
async function findCorrectPooler() {
    console.log("🔍 Finding the Correct Pooler Hostname...\n");
    const projectRef = "uulzjchhneskrhkxznnk";
    const password = "Poptropica0606";
    const poolerPatterns = [
        `${projectRef}.pooler.supabase.com`,
        `${projectRef}.pooler.supabase.co`,
        `aws-0-us-west-1.pooler.supabase.com`,
        `aws-0-us-east-1.pooler.supabase.com`,
        `aws-0-eu-west-1.pooler.supabase.com`,
        `pooler-${projectRef}.supabase.com`,
        `db-pooler-${projectRef}.supabase.com`,
    ];
    console.log("🔄 Testing DNS resolution for different pooler hostnames...\n");
    const workingHostnames = [];
    for (const hostname of poolerPatterns) {
        try {
            console.log(`🔄 Testing: ${hostname}`);
            const result = await dnsLookup(hostname, 4);
            const address = typeof result === "string" ? result : result.address;
            console.log(`   ✅ Resolves to: ${address}`);
            workingHostnames.push({ hostname, address });
        }
        catch (error) {
            console.log(`   ❌ DNS failed: ${error.message}`);
        }
    }
    if (workingHostnames.length === 0) {
        console.log("\n❌ No pooler hostnames could be resolved!");
        console.log("🔧 This suggests:");
        console.log("1. Connection pooling might not be enabled for your project");
        console.log("2. You need to get the exact hostname from Supabase dashboard");
        console.log("3. There might be a region-specific pooler URL");
        console.log("\n📋 Manual Steps:");
        console.log("1. Go to Supabase Dashboard → Settings → Database");
        console.log("2. Look for 'Connection pooling' section");
        console.log("3. If it shows 'Not available' or similar, pooling isn't enabled");
        console.log("4. If enabled, copy the EXACT hostname from there");
        return;
    }
    console.log(`\n✅ Found ${workingHostnames.length} working hostname(s):`);
    for (const { hostname, address } of workingHostnames) {
        console.log(`\n🎯 ${hostname} (${address})`);
        console.log("   🔄 Testing database connection...");
        try {
            const { Pool } = await Promise.resolve().then(() => __importStar(require("pg")));
            const testUrl = `postgresql://postgres:${password}@${hostname}:6543/postgres?sslmode=require`;
            const pool = new Pool({
                connectionString: testUrl,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 5000,
            });
            const result = await pool.query("SELECT NOW()");
            console.log(`   ✅ Database connection successful!`);
            console.log(`   📋 Working DATABASE_URL:`);
            console.log(`   DATABASE_URL="${testUrl}"`);
            await pool.end();
            console.log(`\n🎉 Use this DATABASE_URL in Railway!`);
            return;
        }
        catch (error) {
            console.log(`   ❌ Database connection failed: ${error.message}`);
            if (error.message?.includes("Tenant or user not found")) {
                console.log(`   🔍 This hostname resolves but credentials don't match`);
            }
        }
    }
    console.log("\n🔧 Summary:");
    console.log("- Some hostnames resolve via DNS but database connections fail");
    console.log("- This suggests pooling configuration or credential issues");
    console.log("- Check Supabase dashboard for the exact connection string");
}
async function testDirectConnection() {
    console.log("\n🔄 Testing Direct Connection as Fallback...");
    const directHostname = "db.uulzjchhneskrhkxznnk.supabase.co";
    const password = "Poptropica0606";
    try {
        console.log(`🔄 Testing DNS for: ${directHostname}`);
        const result = await dnsLookup(directHostname, 4);
        const address = typeof result === "string" ? result : result.address;
        console.log(`   ✅ Direct hostname resolves to: ${address}`);
        const { Pool } = await Promise.resolve().then(() => __importStar(require("pg")));
        const directUrl = `postgresql://postgres:${password}@${directHostname}:5432/postgres?sslmode=require`;
        const pool = new Pool({
            connectionString: directUrl,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 5000,
        });
        const result2 = await pool.query("SELECT NOW()");
        console.log(`   ✅ Direct connection works!`);
        console.log(`   📋 Fallback DATABASE_URL:`);
        console.log(`   DATABASE_URL="${directUrl}"`);
        await pool.end();
    }
    catch (error) {
        console.log(`   ❌ Direct connection failed: ${error.message}`);
    }
}
findCorrectPooler()
    .then(() => {
    return testDirectConnection();
})
    .then(() => {
    console.log("\n✅ Pooler search completed");
})
    .catch((err) => {
    console.error("\n❌ Pooler search failed:", err);
});
//# sourceMappingURL=find-correct-pooler.js.map