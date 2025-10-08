"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
const pg_1 = require("pg");
dotenv_1.default.config();
async function testWithCustomDNS() {
    console.log("🔍 Testing with custom DNS resolution...\n");
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL not found");
        return;
    }
    const dbUrl = new url_1.URL(process.env.DATABASE_URL);
    console.log(`Original hostname: ${dbUrl.hostname}`);
    const supabaseIPs = {
        "us-east-1": ["54.81.141.114", "54.174.79.51", "52.201.203.206"],
        "us-west-1": ["13.57.23.102", "52.9.181.87", "54.67.45.198"],
        "eu-west-1": ["34.241.10.209", "52.208.164.7", "54.72.28.70"],
        "ap-southeast-1": ["54.169.28.152", "52.77.240.67", "54.179.130.149"],
    };
    console.log("🔄 Attempting manual DNS resolution...");
    try {
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execPromise = promisify(exec);
        let resolvedIP = null;
        try {
            const { stdout } = await execPromise(`nslookup ${dbUrl.hostname} 8.8.8.8`);
            console.log("DNS lookup result:", stdout);
            const ipMatch = stdout.match(/Address: (\d+\.\d+\.\d+\.\d+)/g);
            if (ipMatch && ipMatch.length > 0) {
                resolvedIP = ipMatch[ipMatch.length - 1].replace("Address: ", "");
                console.log(`✅ Resolved IP: ${resolvedIP}`);
            }
        }
        catch (err) {
            console.log("❌ nslookup failed:", err.message);
        }
        if (resolvedIP) {
            console.log(`\n🔄 Testing connection with IP: ${resolvedIP}`);
            const ipPool = new pg_1.Pool({
                host: resolvedIP,
                port: parseInt(dbUrl.port || "5432"),
                database: dbUrl.pathname.slice(1),
                user: dbUrl.username,
                password: dbUrl.password,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 10000,
            });
            try {
                const result = await ipPool.query("SELECT NOW(), version()");
                console.log("✅ Connection successful!");
                console.log(`   Time: ${result.rows[0].now}`);
                console.log(`   Database: ${result.rows[0].version.split(" ")[0]} ${result.rows[0].version.split(" ")[1]}`);
                const testResult = await ipPool.query("SELECT 1 as test");
                console.log(`   Test query: ${testResult.rows[0].test}`);
                await ipPool.end();
                const newUrl = new url_1.URL(process.env.DATABASE_URL);
                newUrl.hostname = resolvedIP;
                console.log(`\n📋 Updated DATABASE_URL for Railway:`);
                console.log(`DATABASE_URL="${newUrl.toString()}"`);
            }
            catch (err) {
                console.error("❌ Connection with IP failed:", err);
                await ipPool.end();
            }
        }
        else {
            console.log("❌ Could not resolve IP address");
        }
    }
    catch (error) {
        console.error("❌ DNS test failed:", error);
    }
    console.log("\n🔄 Testing with common Supabase IPs...");
    for (const [region, ips] of Object.entries(supabaseIPs)) {
        console.log(`\nTesting ${region} region:`);
        for (const ip of ips) {
            let testPool = null;
            try {
                testPool = new pg_1.Pool({
                    host: ip,
                    port: parseInt(dbUrl.port || "5432"),
                    database: dbUrl.pathname.slice(1),
                    user: dbUrl.username,
                    password: dbUrl.password,
                    ssl: { rejectUnauthorized: false },
                    connectionTimeoutMillis: 3000,
                });
                const result = await testPool.query("SELECT NOW()");
                console.log(`✅ ${region} (${ip}) works! Time: ${result.rows[0].now}`);
                await testPool.end();
                const workingUrl = new url_1.URL(process.env.DATABASE_URL);
                workingUrl.hostname = ip;
                console.log(`\n🎯 Working DATABASE_URL:`);
                console.log(`DATABASE_URL="${workingUrl.toString()}"`);
                return;
            }
            catch (err) {
                console.log(`❌ ${region} (${ip}) failed`);
                if (testPool) {
                    try {
                        await testPool.end();
                    }
                    catch { }
                }
            }
        }
    }
}
testWithCustomDNS()
    .then(() => {
    console.log("\n✅ DNS test completed");
    process.exit(0);
})
    .catch((err) => {
    console.error("\n❌ DNS test failed:", err);
    process.exit(1);
});
//# sourceMappingURL=force-dns-test.js.map