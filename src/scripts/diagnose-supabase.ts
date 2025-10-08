import dotenv from "dotenv";
import dns from "node:dns";
import { promisify } from "util";
import { URL } from "url";

dotenv.config();

const dnsLookup = promisify(dns.lookup);

async function diagnoseSupabase() {
  console.log("🔍 Supabase Connection Diagnostics\n");

  // Check environment variables
  console.log("📋 Environment Check:");
  console.log(`✓ DATABASE_URL exists: ${!!process.env.DATABASE_URL}`);
  if (process.env.DATABASE_URL) {
    const maskedUrl = process.env.DATABASE_URL.replace(
      /:\/\/([^:]+):([^@]+)@/,
      "://[user]:[password]@"
    );
    console.log(`✓ DATABASE_URL format: ${maskedUrl}\n`);
  } else {
    console.log("❌ DATABASE_URL not found in environment\n");
    return;
  }

  try {
    const dbUrl = new URL(process.env.DATABASE_URL!);
    console.log("📊 Connection Details:");
    console.log(`Host: ${dbUrl.hostname}`);
    console.log(`Port: ${dbUrl.port || "5432"}`);
    console.log(`Database: ${dbUrl.pathname.slice(1)}`);
    console.log(`User: ${dbUrl.username}`);
    console.log(`SSL Mode: ${dbUrl.searchParams.get("sslmode") || "prefer"}\n`);

    // Test basic connectivity
    console.log("🌐 Network Connectivity Tests:");

    // Test if we can reach any Supabase domains
    const supabaseHosts = ["supabase.com", "supabase.co", dbUrl.hostname];

    for (const host of supabaseHosts) {
      try {
        console.log(`🔄 Testing ${host}...`);
        const result = await dnsLookup(host);
        const address = typeof result === "string" ? result : result.address;
        console.log(`✅ ${host} resolves to: ${address}`);
      } catch (err) {
        console.log(`❌ ${host} failed: ${(err as Error).message}`);
      }
    }

    // Test different DNS servers
    console.log("\n🔧 DNS Server Tests:");
    const dnsServers = ["8.8.8.8", "1.1.1.1", "208.67.222.222"];

    for (const dnsServer of dnsServers) {
      console.log(`\n🔄 Testing with DNS server ${dnsServer}:`);
      try {
        // This is a basic approach - in production you'd want to use a proper DNS library
        const { exec } = require("child_process");
        const { promisify } = require("util");
        const execPromise = promisify(exec);

        const { stdout } = await execPromise(
          `nslookup ${dbUrl.hostname} ${dnsServer}`
        );
        if (stdout.includes("Address:")) {
          console.log(`✅ ${dnsServer} can resolve ${dbUrl.hostname}`);
          const addresses = stdout.match(/Address: (\d+\.\d+\.\d+\.\d+)/g);
          if (addresses) {
            addresses.forEach((addr: string) => console.log(`   ${addr}`));
          }
        } else {
          console.log(`❌ ${dnsServer} cannot resolve ${dbUrl.hostname}`);
        }
      } catch (err) {
        console.log(
          `❌ DNS test with ${dnsServer} failed: ${(err as Error).message}`
        );
      }
    }

    // Check if the database is paused
    console.log("\n💤 Database Status Check:");
    console.log("ℹ️  Common reasons for ENOTFOUND with Supabase:");
    console.log(
      "   1. Database is paused (free tier auto-pauses after inactivity)"
    );
    console.log("   2. Project has been deleted or moved");
    console.log("   3. Network/DNS configuration issues");
    console.log("   4. Incorrect DATABASE_URL");

    // Try to extract project ref from hostname
    const projectRef = dbUrl.hostname.split(".")[1];
    if (projectRef) {
      console.log(`\n📋 Supabase Project Info:`);
      console.log(`   Project Reference: ${projectRef}`);
      console.log(
        `   Dashboard URL: https://supabase.com/dashboard/project/${projectRef}`
      );
      console.log("   👆 Check if your database is paused in the dashboard");
    }

    // Test HTTP endpoint (if database is paused, REST API might still work)
    console.log("\n🌐 Testing Supabase REST API endpoint:");
    try {
      const restUrl = `https://${projectRef}.supabase.co/rest/v1/`;
      const response = await fetch(restUrl, {
        method: "GET",
        headers: {
          apikey: "test", // This will fail but tells us if the endpoint exists
        },
      });
      console.log(`✅ REST API endpoint responds (${response.status})`);
      if (response.status === 401 || response.status === 403) {
        console.log(
          "   ✓ This suggests the project exists but database might be paused"
        );
      }
    } catch (err) {
      console.log(`❌ REST API test failed: ${(err as Error).message}`);
    }
  } catch (error) {
    console.error("❌ Diagnostic failed:", error);
  }

  console.log("\n🔧 Recommended Actions:");
  console.log("1. Check Supabase dashboard to see if database is paused");
  console.log("2. If paused, wake it up by visiting the dashboard");
  console.log("3. Verify your DATABASE_URL is correct");
  console.log("4. Try running this diagnostic from Railway's environment");
  console.log(
    "5. Consider upgrading to Supabase Pro if you need always-on database"
  );
}

// Run diagnostics
diagnoseSupabase()
  .then(() => {
    console.log("\n✅ Diagnostics completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Diagnostics failed:", err);
    process.exit(1);
  });
