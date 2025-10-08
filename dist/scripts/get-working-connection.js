"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
dotenv_1.default.config();
function generateAlternativeConnections() {
    console.log("🔧 Generating Alternative Database Connection Methods\n");
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL not found");
        return;
    }
    const dbUrl = new url_1.URL(process.env.DATABASE_URL);
    const projectRef = dbUrl.hostname.split(".")[1];
    console.log("📋 Current Connection Details:");
    console.log(`Project Reference: ${projectRef}`);
    console.log(`Original Hostname: ${dbUrl.hostname}`);
    console.log(`Username: ${dbUrl.username}`);
    console.log(`Database: ${dbUrl.pathname.slice(1)}`);
    console.log(`Port: ${dbUrl.port}`);
    console.log("\n🔧 Alternative Solutions:\n");
    console.log("1. 🎯 **RECOMMENDED: Use Supabase Connection Pooling**");
    console.log("   This bypasses direct database connection issues.");
    console.log("");
    console.log("   In your Supabase dashboard:");
    console.log("   • Go to Settings > Database");
    console.log("   • Look for 'Connection Pooling' section");
    console.log("   • Use the 'Connection pooling' URL instead of 'Direct connection'");
    console.log("   • The pooling URL typically looks like:");
    console.log(`   postgresql://postgres:[password]@aws-0-us-west-1.pooler.supabase.com:6543/postgres`);
    console.log("");
    console.log("2. 🔄 **Try Alternative Database Hostnames**");
    console.log("   Sometimes different hostname formats work:");
    console.log("");
    const alternativeHostnames = [
        `aws-0-us-west-1.pooler.supabase.com`,
        `aws-0-us-east-1.pooler.supabase.com`,
        `${projectRef}.pooler.supabase.com`,
        `db-${projectRef}.supabase.co`,
    ];
    alternativeHostnames.forEach((hostname, index) => {
        const altUrl = new url_1.URL(process.env.DATABASE_URL);
        altUrl.hostname = hostname;
        if (hostname.includes("pooler")) {
            altUrl.port = "6543";
        }
        console.log(`   ${index + 1}. ${hostname}`);
        console.log(`      DATABASE_URL="${altUrl.toString()}"`);
        console.log("");
    });
    console.log("3. 🚂 **Railway-Specific Solutions**");
    console.log("   Add these environment variables in Railway:");
    console.log("");
    console.log("   NODE_OPTIONS=--dns-result-order=ipv4first");
    console.log("   DNS_ORDER=ipv4first");
    console.log("");
    console.log("4. 💻 **Code-Based DNS Resolution** (Already implemented)");
    console.log("   Use the updated connection.ts file I provided, which:");
    console.log("   • Forces IPv4 resolution");
    console.log("   • Uses individual connection parameters instead of connection string");
    console.log("   • Has better error handling");
    console.log("");
    console.log("5. 🆕 **Create New Supabase Project** (Last resort)");
    console.log("   If DNS issues persist:");
    console.log("   • Create a new Supabase project");
    console.log("   • Export your current database schema");
    console.log("   • Import to the new project");
    console.log("   • Update your DATABASE_URL");
    console.log("");
    console.log("🎯 **Next Steps:**");
    console.log("1. Try the connection pooling URL first (most likely to work)");
    console.log("2. If that doesn't work, try the alternative hostnames");
    console.log("3. Set the Railway environment variables");
    console.log("4. Contact Supabase support about the DNS issue");
    console.log("");
    console.log("📧 You can also contact Supabase support with this info:");
    console.log(`   Project: ${projectRef}`);
    console.log(`   Issue: Database hostname ${dbUrl.hostname} not resolving via DNS`);
    console.log(`   Error: ENOTFOUND even though project APIs work fine`);
}
generateAlternativeConnections();
//# sourceMappingURL=get-working-connection.js.map