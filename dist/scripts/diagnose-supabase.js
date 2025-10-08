"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const node_dns_1 = __importDefault(require("node:dns"));
const util_1 = require("util");
const url_1 = require("url");
dotenv_1.default.config();
const dnsLookup = (0, util_1.promisify)(node_dns_1.default.lookup);
async function diagnoseSupabase() {
    console.log("🔍 Supabase Connection Diagnostics\n");
    console.log("📋 Environment Check:");
    console.log(`✓ DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
    if (process.env.DATABASE_URL) {
        const maskedUrl = process.env.DATABASE_URL.replace(/:\/\/([^:]+):([^@]+)@/, "://[user]:[password]@");
        console.log(`✓ DATABASE_URL format: ${maskedUrl}\n`);
    }
    else {
        console.log("❌ DATABASE_URL not found in environment\n");
        return;
    }
    try {
        const dbUrl = new url_1.URL(process.env.DATABASE_URL);
        console.log("📊 Connection Details:");
        console.log(`Host: ${dbUrl.hostname}`);
        console.log(`Port: ${dbUrl.port || "5432"}`);
        console.log(`Database: ${dbUrl.pathname.slice(1)}`);
        console.log(`User: ${dbUrl.username}`);
        console.log(`SSL Mode: ${dbUrl.searchParams.get("sslmode") || "prefer"}\n`);
        console.log("🌐 Network Connectivity Tests:");
        const supabaseHosts = ["supabase.com", "supabase.co", dbUrl.hostname];
        for (const host of supabaseHosts) {
            try {
                console.log(`🔄 Testing ${host}...`);
                const result = await dnsLookup(host);
                const address = typeof result === "string" ? result : result.address;
                console.log(`✅ ${host} resolves to: ${address}`);
            }
            catch (err) {
                console.log(`❌ ${host} failed: ${err.message}`);
            }
        }
        console.log("\n🔧 DNS Server Tests:");
        const dnsServers = ["8.8.8.8", "1.1.1.1", "208.67.222.222"];
        for (const dnsServer of dnsServers) {
            console.log(`\n🔄 Testing with DNS server ${dnsServer}:`);
            try {
                const { exec } = require("child_process");
                const { promisify } = require("util");
                const execPromise = promisify(exec);
                const { stdout } = await execPromise(`nslookup ${dbUrl.hostname} ${dnsServer}`);
                if (stdout.includes("Address:")) {
                    console.log(`✅ ${dnsServer} can resolve ${dbUrl.hostname}`);
                    const addresses = stdout.match(/Address: (\d+\.\d+\.\d+\.\d+)/g);
                    if (addresses) {
                        addresses.forEach((addr) => console.log(`   ${addr}`));
                    }
                }
                else {
                    console.log(`❌ ${dnsServer} cannot resolve ${dbUrl.hostname}`);
                }
            }
            catch (err) {
                console.log(`❌ DNS test with ${dnsServer} failed: ${err.message}`);
            }
        }
        console.log("\n💤 Database Status Check:");
        console.log("ℹ️  Common reasons for ENOTFOUND with Supabase:");
        console.log("   1. Database is paused (free tier auto-pauses after inactivity)");
        console.log("   2. Project has been deleted or moved");
        console.log("   3. Network/DNS configuration issues");
        console.log("   4. Incorrect DATABASE_URL");
        const projectRef = dbUrl.hostname.split(".")[1];
        if (projectRef) {
            console.log(`\n📋 Supabase Project Info:`);
            console.log(`   Project Reference: ${projectRef}`);
            console.log(`   Dashboard URL: https://supabase.com/dashboard/project/${projectRef}`);
            console.log("   👆 Check if your database is paused in the dashboard");
        }
        console.log("\n🌐 Testing Supabase REST API endpoint:");
        try {
            const restUrl = `https://${projectRef}.supabase.co/rest/v1/`;
            const response = await fetch(restUrl, {
                method: "GET",
                headers: {
                    apikey: "test",
                },
            });
            console.log(`✅ REST API endpoint responds (${response.status})`);
            if (response.status === 401 || response.status === 403) {
                console.log("   ✓ This suggests the project exists but database might be paused");
            }
        }
        catch (err) {
            console.log(`❌ REST API test failed: ${err.message}`);
        }
    }
    catch (error) {
        console.error("❌ Diagnostic failed:", error);
    }
    console.log("\n🔧 Recommended Actions:");
    console.log("1. Check Supabase dashboard to see if database is paused");
    console.log("2. If paused, wake it up by visiting the dashboard");
    console.log("3. Verify your DATABASE_URL is correct");
    console.log("4. Try running this diagnostic from Railway's environment");
    console.log("5. Consider upgrading to Supabase Pro if you need always-on database");
}
diagnoseSupabase()
    .then(() => {
    console.log("\n✅ Diagnostics completed");
    process.exit(0);
})
    .catch((err) => {
    console.error("\n❌ Diagnostics failed:", err);
    process.exit(1);
});
//# sourceMappingURL=diagnose-supabase.js.map