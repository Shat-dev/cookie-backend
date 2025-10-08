import { Pool } from "pg";
import dotenv from "dotenv";
import dns from "node:dns";
import { URL } from "url";
import { resolveHostnameToIPv4 } from "../utils/dnsHelper";

dotenv.config();

// Force Node to prefer IPv4 over IPv6
dns.setDefaultResultOrder("ipv4first");

console.log("connectionV2.ts loaded", {
  NODE_ENV: process.env.NODE_ENV,
  hasDBURL: !!process.env.DATABASE_URL,
});

async function createPool(): Promise<Pool> {
  let poolConfig: any;

  if (process.env.DATABASE_URL) {
    // Parse the DATABASE_URL to extract components
    const dbUrl = new URL(process.env.DATABASE_URL);

    try {
      // Try to resolve hostname to IPv4
      const ipv4Address = await resolveHostnameToIPv4(dbUrl.hostname);

      poolConfig = {
        host: ipv4Address, // Use resolved IPv4 address
        port: parseInt(dbUrl.port || "5432"),
        database: dbUrl.pathname.slice(1),
        user: dbUrl.username,
        password: dbUrl.password,
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // Increased timeout
      };

      console.log(
        `✅ Using IPv4 address: ${ipv4Address} for ${dbUrl.hostname}`
      );
    } catch (error) {
      console.error("⚠️ Failed to resolve to IPv4, using original hostname");

      // Fallback to parsing URL components
      poolConfig = {
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port || "5432"),
        database: dbUrl.pathname.slice(1),
        user: dbUrl.username,
        password: dbUrl.password,
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        // Force IPv4 in pg-native
        lookup: (hostname: string, options: any, callback: any) => {
          dns.lookup(hostname, 4, callback);
        },
      };
    }
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
    };
  }

  // Log configuration (without sensitive data)
  console.log("Pool configuration:", {
    ...poolConfig,
    password: poolConfig.password ? "[HIDDEN]" : undefined,
  });

  const pool = new Pool(poolConfig);

  // Set up event handlers
  pool.on("connect", (client) => {
    console.log("✅ Connected to PostgreSQL database");
    if (process.env.NODE_ENV === "production") {
      console.log("🔒 Using SSL connection");
    }
  });

  pool.on("error", (err) => {
    console.error("❌ Unexpected error on idle client", err);
    if (process.env.NODE_ENV !== "production") {
      process.exit(-1);
    }
  });

  // Test the connection
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Initial connection test successful:", result.rows[0].now);
  } catch (err) {
    console.error("❌ Initial connection test failed:", err);
    if ((err as any).code === "ENETUNREACH") {
      console.error(
        "🔧 Network unreachable - IPv6 issue detected.",
        "\n📝 Please ensure your DATABASE_URL uses an IPv4 address or update your Railway/Supabase settings."
      );
    }
    throw err;
  }

  return pool;
}

// Create and export pool instance
let poolInstance: Pool | null = null;

export async function getPool(): Promise<Pool> {
  if (!poolInstance) {
    poolInstance = await createPool();
  }
  return poolInstance;
}

// For backward compatibility, also export a synchronous version that initializes on first use
const pool = new Proxy({} as Pool, {
  get(target, prop) {
    if (!poolInstance) {
      throw new Error("Database pool not initialized. Call getPool() first.");
    }
    return (poolInstance as any)[prop];
  },
});

export default pool;

// Initialize pool on module load
if (process.env.DATABASE_URL) {
  getPool().catch((err) => {
    console.error("❌ Failed to initialize database pool:", err);
    process.exit(1);
  });
}
