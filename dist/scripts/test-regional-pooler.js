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
dotenv_1.default.config();
async function testRegionalPooler() {
    console.log("🔧 Testing Regional Pooler with Proper SSL...\n");
    const password = "Poptropica0606";
    const poolerConfigs = [
        {
            name: "US West 1 - SSL Reject Unauthorized False",
            url: `postgresql://postgres:${password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require`,
            ssl: { rejectUnauthorized: false },
        },
        {
            name: "US West 1 - SSL Prefer",
            url: `postgresql://postgres:${password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=prefer`,
            ssl: { rejectUnauthorized: false },
        },
        {
            name: "US West 1 - No SSL Mode",
            url: `postgresql://postgres:${password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
            ssl: false,
        },
        {
            name: "US East 1 - SSL Reject Unauthorized False",
            url: `postgresql://postgres:${password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`,
            ssl: { rejectUnauthorized: false },
        },
    ];
    for (const config of poolerConfigs) {
        console.log(`\n🔄 Testing: ${config.name}`);
        console.log(`   URL: ${config.url}`);
        try {
            const { Pool } = await Promise.resolve().then(() => __importStar(require("pg")));
            const pool = new Pool({
                connectionString: config.url,
                ssl: config.ssl,
                connectionTimeoutMillis: 10000,
            });
            const result = await pool.query("SELECT NOW(), current_user, current_database()");
            console.log(`   ✅ SUCCESS!`);
            console.log(`   Time: ${result.rows[0].now}`);
            console.log(`   User: ${result.rows[0].current_user}`);
            console.log(`   Database: ${result.rows[0].current_database}`);
            try {
                const tableTest = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'");
                console.log(`   Tables in database: ${tableTest.rows[0].count}`);
                if (tableTest.rows[0].count > 0) {
                    console.log(`   ✅ Database has tables - schema is set up!`);
                }
                else {
                    console.log(`   ⚠️  Database is empty - need to run schema setup`);
                }
            }
            catch (schemaError) {
                console.log(`   ⚠️  Could not check schema: ${schemaError.message}`);
            }
            await pool.end();
            console.log(`\n🎉 WORKING DATABASE_URL FOUND:`);
            console.log(`DATABASE_URL="${config.url}"`);
            console.log(`\n📋 Use this in your Railway environment variables!`);
            return;
        }
        catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
            if (error.code === "ENOTFOUND") {
                console.log(`   🔍 DNS resolution failed`);
            }
            else if (error.message?.includes("certificate")) {
                console.log(`   🔍 SSL certificate issue`);
            }
            else if (error.message?.includes("Tenant or user not found")) {
                console.log(`   🔍 Authentication/credentials issue`);
            }
        }
    }
    console.log(`\n❌ None of the configurations worked`);
    console.log(`\n🔧 Next steps:`);
    console.log(`1. Check Supabase dashboard for exact connection string`);
    console.log(`2. Verify your password is correct: Poptropica0606`);
    console.log(`3. Make sure connection pooling is enabled in Supabase`);
    console.log(`4. Try resetting the database password again`);
}
testRegionalPooler()
    .then(() => {
    console.log("\n✅ Regional pooler test completed");
})
    .catch((err) => {
    console.error("\n❌ Regional pooler test failed:", err);
});
//# sourceMappingURL=test-regional-pooler.js.map