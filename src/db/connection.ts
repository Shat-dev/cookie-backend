import { Pool } from "pg";
import dotenv from "dotenv";
import dns from "node:dns";
import { URL } from "url";

dotenv.config();

// Force Node to prefer IPv4 over IPv6 (Railway often fails IPv6)
dns.setDefaultResultOrder("ipv4first");

console.log("conn.ts loaded", {
  NODE_ENV: process.env.NODE_ENV,
  hasDBURL: !!process.env.DATABASE_URL,
});

let poolConfig: any;

if (process.env.DATABASE_URL) {
  // Parse the DATABASE_URL to extract components
  const dbUrl = new URL(process.env.DATABASE_URL);

  // Production: Use Supabase connection with explicit IPv4
  poolConfig = {
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port || "5432"),
    database: dbUrl.pathname.slice(1), // Remove leading '/'
    user: dbUrl.username,
    password: dbUrl.password,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000, // Increased timeout
    // Force IPv4 lookup for the hostname
    lookup: (hostname: string, options: any, callback: any) => {
      dns.lookup(hostname, 4, callback); // Force IPv4 only
    },
  };
} else {
  // Development: Local Postgres
  poolConfig = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "postgres",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "your_password",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    lookup: (hostname: string, _opts: any, cb: any) =>
      dns.lookup(hostname, { family: 4 }, cb),
  };
}

// Log the configuration (without password)
console.log("Pool configuration:", {
  ...poolConfig,
  password: poolConfig.password ? "[HIDDEN]" : undefined,
  connectionString: poolConfig.connectionString ? "[HIDDEN]" : undefined,
});

const pool = new Pool(poolConfig);

// Test the connection
pool.on("connect", (client) => {
  console.log("✅ Connected to PostgreSQL database");
  if (process.env.NODE_ENV === "production") {
    console.log("🔒 Using SSL connection");
  }

  // Get connection info
  client.query(
    "SELECT inet_server_addr(), inet_server_port()",
    (err, result) => {
      if (!err && result.rows.length > 0) {
        console.log("📍 Connected to:", result.rows[0]);
      }
    }
  );
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
  // Don't exit immediately in production, try to recover
  if (process.env.NODE_ENV !== "production") {
    process.exit(-1);
  }
});

// Test connection on startup
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("❌ Initial connection test failed:", err.message);
    if ((err as any).code === "ENETUNREACH") {
      console.error(
        "🔧 Network unreachable - likely IPv6 issue. Ensure DATABASE_URL uses IPv4."
      );
    }
  } else {
    console.log("✅ Initial connection test successful:", res.rows[0].now);
  }
});

export default pool;
