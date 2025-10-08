"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const url_1 = require("url");
dotenv_1.default.config();
async function checkSupabaseProject() {
    console.log("🔍 Checking Supabase Project Status...\n");
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL not found");
        return;
    }
    const dbUrl = new url_1.URL(process.env.DATABASE_URL);
    const hostnameParts = dbUrl.hostname.split(".");
    let projectRef = "";
    if (hostnameParts.length >= 4 && hostnameParts[0] === "db") {
        projectRef = hostnameParts[1];
    }
    console.log(`Project Reference: ${projectRef}`);
    console.log(`Database Hostname: ${dbUrl.hostname}`);
    if (!projectRef) {
        console.error("❌ Could not extract project reference from hostname");
        return;
    }
    const endpoints = [
        {
            name: "REST API",
            url: `https://${projectRef}.supabase.co/rest/v1/`,
            expectedCodes: [200, 401, 403],
        },
        {
            name: "Auth API",
            url: `https://${projectRef}.supabase.co/auth/v1/`,
            expectedCodes: [200, 404, 405],
        },
        {
            name: "Storage API",
            url: `https://${projectRef}.supabase.co/storage/v1/`,
            expectedCodes: [200, 400, 401, 403],
        },
    ];
    console.log("\n🌐 Testing Supabase API Endpoints:");
    let projectExists = false;
    for (const endpoint of endpoints) {
        try {
            console.log(`\n🔄 Testing ${endpoint.name}...`);
            console.log(`   URL: ${endpoint.url}`);
            const response = await fetch(endpoint.url, {
                method: "GET",
                headers: {
                    "User-Agent": "DatabaseTest/1.0",
                },
            });
            console.log(`   Status: ${response.status} ${response.statusText}`);
            if (endpoint.expectedCodes.includes(response.status)) {
                console.log(`   ✅ ${endpoint.name} is accessible - project exists!`);
                projectExists = true;
            }
            else if (response.status >= 500) {
                console.log(`   ⚠️  ${endpoint.name} server error - project might exist but having issues`);
            }
            else {
                console.log(`   ❌ ${endpoint.name} unexpected response`);
            }
        }
        catch (error) {
            console.log(`   ❌ ${endpoint.name} failed: ${error.message}`);
            if (error.message.includes("ENOTFOUND") ||
                error.message.includes("getaddrinfo")) {
                console.log(`   🔍 DNS resolution failed for ${endpoint.name}`);
            }
        }
    }
    console.log("\n🔄 Testing database hostname resolution:");
    try {
        const dbResponse = await fetch(`https://${dbUrl.hostname}`, {
            method: "GET",
            timeout: 5000,
        });
        console.log(`Database hostname responds: ${dbResponse.status}`);
    }
    catch (error) {
        console.log(`Database hostname test failed: ${error.message}`);
    }
    console.log("\n📋 Summary:");
    if (projectExists) {
        console.log("✅ Supabase project appears to exist and is accessible via API");
        console.log("🔍 The database connection issue is likely:");
        console.log("   1. Database is paused/sleeping");
        console.log("   2. Database hostname DNS propagation issue");
        console.log("   3. Network routing problem between your location and database");
        console.log("   4. Railway-specific networking issue");
        console.log("\n🔧 Recommended actions:");
        console.log("1. Visit Supabase dashboard to wake up database");
        console.log("2. Try connecting from a different network");
        console.log("3. Contact Supabase support about hostname resolution");
        console.log("4. Consider creating a new database if this persists");
    }
    else {
        console.log("❌ Supabase project does not appear to exist or is inaccessible");
        console.log("🔧 Recommended actions:");
        console.log("1. Check if project was deleted or moved");
        console.log("2. Verify you have the correct DATABASE_URL");
        console.log("3. Check Supabase dashboard for project status");
        console.log("4. Generate a new DATABASE_URL from Supabase");
    }
}
checkSupabaseProject()
    .then(() => {
    console.log("\n✅ Project check completed");
})
    .catch((err) => {
    console.error("\n❌ Project check failed:", err);
});
//# sourceMappingURL=check-supabase-project.js.map