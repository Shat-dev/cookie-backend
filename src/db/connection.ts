import { Pool } from "pg";
import dns from "node:dns";
import { URL } from "url";

// Prefer IPv4 on Railway/Supabase
dns.setDefaultResultOrder("ipv4first");

console.log("conn.ts loaded", {
  NODE_ENV: process.env.NODE_ENV,
  hasDBURL: !!process.env.DATABASE_URL,
});

type LookupFn = (hostname: string, options: any, callback: any) => void;

let poolConfig: any;

if (process.env.DATABASE_URL) {
  const dbUrl = new URL(process.env.DATABASE_URL);

  poolConfig = {
    host: dbUrl.hostname,
    port: parseInt(dbUrl.port || "5432", 10),
    database: dbUrl.pathname.slice(1),
    user: dbUrl.username,
    password: dbUrl.password,
    ssl:
      process.env.NODE_ENV === "production"
        ? {
            rejectUnauthorized: false,
            checkServerIdentity: () => undefined,
            secureProtocol: "TLSv1_2_method",
          }
        : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    acquireTimeoutMillis: 10000,
    statement_timeout: 30000,
    query_timeout: 30000,
    lookup: ((hostname: string, _opts: any, cb: any) =>
      dns.lookup(hostname, { family: 4 }, cb)) as LookupFn,
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME || "postgres",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "your_password",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    acquireTimeoutMillis: 5000,
    lookup: ((hostname: string, _opts: any, cb: any) =>
      dns.lookup(hostname, { family: 4 }, cb)) as LookupFn,
  };
}

// Safe config log (no secrets)
console.log("Pool configuration:", {
  ...poolConfig,
  password: poolConfig.password ? "[HIDDEN]" : undefined,
  connectionString: poolConfig.connectionString ? "[HIDDEN]" : undefined,
});

const pool = new Pool(poolConfig);

// Keep idle error handler, but no active tests here
pool.on("error", (err: any) => {
  const isTimeoutError =
    err.code === "ETIMEDOUT" ||
    err.code === "ECONNREFUSED" ||
    err.message?.includes?.("timeout");

  if (isTimeoutError) {
    console.warn(
      "⚠️ Database connection timeout on idle client; will retry on next use:",
      err.message
    );
  } else {
    console.error("❌ Unexpected error on idle client", err);
  }

  if (process.env.NODE_ENV !== "production" && !isTimeoutError) {
    process.exit(-1);
  }
});

export default pool;

//test
