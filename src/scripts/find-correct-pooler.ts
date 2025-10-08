import dotenv from "dotenv";
import dns from "node:dns";
import { promisify } from "util";

dotenv.config();

const dnsLookup = promisify(dns.lookup);

async function findCorrectPooler() {
  console.log("🔍 Finding the Correct Pooler Hostname...\n");

  const projectRef = "uulzjchhneskrhkxznnk";
  const password = "Poptropica0606";

  // Different pooler hostname patterns to try
  const poolerPatterns = [
    // Project-specific patterns
    `${projectRef}.pooler.supabase.com`,
    `${projectRef}.pooler.supabase.co`,

    // Regional patterns (that were working before)
    `aws-0-us-west-1.pooler.supabase.com`,
    `aws-0-us-east-1.pooler.supabase.com`,
    `aws-0-eu-west-1.pooler.supabase.com`,

    // Other possible patterns
    `pooler-${projectRef}.supabase.com`,
    `db-pooler-${projectRef}.supabase.com`,
  ];

  console.log("🔄 Testing DNS resolution for different pooler hostnames...\n");

  const workingHostnames = [];

  for (const hostname of poolerPatterns) {
    try {
      console.log(`🔄 Testing: ${hostname}`);
      const result = await dnsLookup(hostname, 4); // IPv4 only
      const address = typeof result === "string" ? result : result.address;
      console.log(`   ✅ Resolves to: ${address}`);
      workingHostnames.push({ hostname, address });
    } catch (error) {
      console.log(`   ❌ DNS failed: ${(error as Error).message}`);
    }
  }

  if (workingHostnames.length === 0) {
    console.log("\n❌ No pooler hostnames could be resolved!");
    console.log("🔧 This suggests:");
    console.log("1. Connection pooling might not be enabled for your project");
    console.log(
      "2. You need to get the exact hostname from Supabase dashboard"
    );
    console.log("3. There might be a region-specific pooler URL");

    console.log("\n📋 Manual Steps:");
    console.log("1. Go to Supabase Dashboard → Settings → Database");
    console.log("2. Look for 'Connection pooling' section");
    console.log(
      "3. If it shows 'Not available' or similar, pooling isn't enabled"
    );
    console.log("4. If enabled, copy the EXACT hostname from there");

    return;
  }

  console.log(`\n✅ Found ${workingHostnames.length} working hostname(s):`);

  for (const { hostname, address } of workingHostnames) {
    console.log(`\n🎯 ${hostname} (${address})`);

    // Test actual connection
    console.log("   🔄 Testing database connection...");
    try {
      const { Pool } = await import("pg");
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

      // If we found a working connection, we can stop here
      console.log(`\n🎉 Use this DATABASE_URL in Railway!`);
      return;
    } catch (error) {
      console.log(
        `   ❌ Database connection failed: ${(error as Error).message}`
      );

      if ((error as any).message?.includes("Tenant or user not found")) {
        console.log(`   🔍 This hostname resolves but credentials don't match`);
      }
    }
  }

  console.log("\n🔧 Summary:");
  console.log("- Some hostnames resolve via DNS but database connections fail");
  console.log("- This suggests pooling configuration or credential issues");
  console.log("- Check Supabase dashboard for the exact connection string");
}

// Also test the direct connection as fallback
async function testDirectConnection() {
  console.log("\n🔄 Testing Direct Connection as Fallback...");

  const directHostname = "db.uulzjchhneskrhkxznnk.supabase.co";
  const password = "Poptropica0606";

  try {
    console.log(`🔄 Testing DNS for: ${directHostname}`);
    const result = await dnsLookup(directHostname, 4);
    const address = typeof result === "string" ? result : result.address;
    console.log(`   ✅ Direct hostname resolves to: ${address}`);

    // Test connection
    const { Pool } = await import("pg");
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
  } catch (error) {
    console.log(`   ❌ Direct connection failed: ${(error as Error).message}`);
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
