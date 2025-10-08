"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
dotenv_1.default.config();
function validateDatabaseUrl() {
    console.log("🔍 Validating DATABASE_URL...\n");
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL environment variable not found");
        console.log("📝 Make sure you have a .env file with DATABASE_URL set");
        return;
    }
    console.log("✅ DATABASE_URL exists");
    try {
        const dbUrl = new url_1.URL(process.env.DATABASE_URL);
        console.log("\n📊 Database URL Components:");
        console.log(`Protocol: ${dbUrl.protocol}`);
        console.log(`Username: ${dbUrl.username}`);
        console.log(`Password: ${dbUrl.password ? "[HIDDEN]" : "NOT SET"}`);
        console.log(`Hostname: ${dbUrl.hostname}`);
        console.log(`Port: ${dbUrl.port || "default (5432)"}`);
        console.log(`Database: ${dbUrl.pathname.slice(1)}`);
        console.log(`SSL Mode: ${dbUrl.searchParams.get("sslmode") || "not specified"}`);
        const hostnameParts = dbUrl.hostname.split(".");
        console.log(`\n🔍 Hostname Analysis:`);
        console.log(`Total parts: ${hostnameParts.length}`);
        console.log(`Parts: ${hostnameParts.join(" | ")}`);
        if (hostnameParts.length >= 3 &&
            hostnameParts.includes("supabase") &&
            hostnameParts.includes("co")) {
            console.log("✅ Hostname format looks like Supabase");
            if (hostnameParts[0].startsWith("db.") && hostnameParts.length >= 4) {
                const projectRef = hostnameParts[1];
                console.log(`📋 Project Reference: ${projectRef}`);
                console.log(`🌐 Dashboard: https://supabase.com/dashboard/project/${projectRef}`);
                if (projectRef.length === 20) {
                    console.log("✅ Project reference length looks correct (20 chars)");
                }
                else {
                    console.log(`⚠️  Project reference unusual length: ${projectRef.length} chars (expected 20)`);
                }
            }
            else {
                console.log("⚠️  Hostname doesn't match expected Supabase format");
            }
        }
        else {
            console.log("⚠️  This doesn't look like a standard Supabase hostname");
        }
        console.log(`\n🔧 Common Issue Checks:`);
        if (dbUrl.hostname.includes("localhost") ||
            dbUrl.hostname.includes("127.0.0.1")) {
            console.log("⚠️  Using localhost - this won't work on Railway");
        }
        if (!dbUrl.password) {
            console.log("❌ No password in DATABASE_URL");
        }
        if (dbUrl.protocol !== "postgresql:" && dbUrl.protocol !== "postgres:") {
            console.log(`⚠️  Unusual protocol: ${dbUrl.protocol} (expected postgresql: or postgres:)`);
        }
    }
    catch (error) {
        console.error("❌ Failed to parse DATABASE_URL:", error);
        console.log("📝 Make sure your DATABASE_URL is properly formatted");
        console.log("Example: postgresql://user:password@host:5432/database");
    }
}
validateDatabaseUrl();
//# sourceMappingURL=validate-db-url.js.map