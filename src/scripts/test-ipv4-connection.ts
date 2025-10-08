import dotenv from "dotenv";
import dns from "node:dns";
import { promisify } from "util";
import { URL } from "url";

dotenv.config();

const dnsLookup = promisify(dns.lookup);
const dnsResolve4 = promisify(dns.resolve4);

async function testDatabaseConnection() {
  console.log("🔍 Testing Database IPv4 Connection...\n");

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    return;
  }

  try {
    const dbUrl = new URL(process.env.DATABASE_URL);
    console.log(`📍 Database Host: ${dbUrl.hostname}`);
    console.log(`📍 Database Port: ${dbUrl.port || "5432"}`);
    console.log(`📍 Database Name: ${dbUrl.pathname.slice(1)}\n`);

    // Test DNS resolution
    console.log("🔄 Testing DNS resolution...");

    try {
      // Try IPv4 lookup
      const ipv4Result = await dnsLookup(dbUrl.hostname, 4);
      const ipv4Address =
        typeof ipv4Result === "string" ? ipv4Result : ipv4Result.address;
      console.log(`✅ IPv4 lookup successful: ${ipv4Address}`);
    } catch (err) {
      console.error("❌ IPv4 lookup failed:", err);
    }

    try {
      // Try IPv6 lookup
      const ipv6Result = await dnsLookup(dbUrl.hostname, 6);
      const ipv6Address =
        typeof ipv6Result === "string" ? ipv6Result : ipv6Result.address;
      console.log(`📝 IPv6 lookup result: ${ipv6Address}`);
    } catch (err) {
      console.error("⚠️ IPv6 lookup failed:", err);
    }

    try {
      // Try resolve4
      const addresses = await dnsResolve4(dbUrl.hostname);
      console.log(`✅ resolve4 results: ${addresses.join(", ")}`);
    } catch (err) {
      console.error("❌ resolve4 failed:", err);
    }

    // Test actual connection with pg
    console.log("\n🔄 Testing PostgreSQL connection...");
    const { Pool } = await import("pg");

    // First try with IPv4 resolution
    try {
      const ipv4Result = await dnsLookup(dbUrl.hostname, 4);
      const ipv4Address =
        typeof ipv4Result === "string" ? ipv4Result : ipv4Result.address;

      const ipv4Pool = new Pool({
        host: ipv4Address,
        port: parseInt(dbUrl.port || "5432"),
        database: dbUrl.pathname.slice(1),
        user: dbUrl.username,
        password: dbUrl.password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      const result = await ipv4Pool.query("SELECT NOW()");
      console.log(`✅ IPv4 connection successful: ${result.rows[0].now}`);
      await ipv4Pool.end();
    } catch (err) {
      console.error("❌ IPv4 connection failed:", err);
    }

    // Try with original hostname
    try {
      const hostnamePool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 5000,
      });

      const result = await hostnamePool.query("SELECT NOW()");
      console.log(`✅ Hostname connection successful: ${result.rows[0].now}`);
      await hostnamePool.end();
    } catch (err) {
      console.error("❌ Hostname connection failed:", err);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Force IPv4 preference
dns.setDefaultResultOrder("ipv4first");

testDatabaseConnection()
  .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  });
