"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const node_dns_1 = __importDefault(require("node:dns"));
const url_1 = require("url");
const dnsHelper_1 = require("../utils/dnsHelper");
dotenv_1.default.config();
node_dns_1.default.setDefaultResultOrder("ipv4first");
console.log("connectionV2.ts loaded", {
    NODE_ENV: process.env.NODE_ENV,
    hasDBURL: !!process.env.DATABASE_URL,
});
async function createPool() {
    let poolConfig;
    if (process.env.DATABASE_URL) {
        const dbUrl = new url_1.URL(process.env.DATABASE_URL);
        try {
            const ipv4Address = await (0, dnsHelper_1.resolveHostnameToIPv4)(dbUrl.hostname);
            poolConfig = {
                host: ipv4Address,
                port: parseInt(dbUrl.port || "5432"),
                database: dbUrl.pathname.slice(1),
                user: dbUrl.username,
                password: dbUrl.password,
                ssl: process.env.NODE_ENV === "production"
                    ? { rejectUnauthorized: false }
                    : false,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            };
            console.log(`✅ Using IPv4 address: ${ipv4Address} for ${dbUrl.hostname}`);
        }
        catch (error) {
            console.error("⚠️ Failed to resolve to IPv4, using original hostname");
            poolConfig = {
                host: dbUrl.hostname,
                port: parseInt(dbUrl.port || "5432"),
                database: dbUrl.pathname.slice(1),
                user: dbUrl.username,
                password: dbUrl.password,
                ssl: process.env.NODE_ENV === "production"
                    ? { rejectUnauthorized: false }
                    : false,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
                lookup: (hostname, options, callback) => {
                    node_dns_1.default.lookup(hostname, 4, callback);
                },
            };
        }
    }
    else {
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
    console.log("Pool configuration:", {
        ...poolConfig,
        password: poolConfig.password ? "[HIDDEN]" : undefined,
    });
    const pool = new pg_1.Pool(poolConfig);
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
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("✅ Initial connection test successful:", result.rows[0].now);
    }
    catch (err) {
        console.error("❌ Initial connection test failed:", err);
        if (err.code === "ENETUNREACH") {
            console.error("🔧 Network unreachable - IPv6 issue detected.", "\n📝 Please ensure your DATABASE_URL uses an IPv4 address or update your Railway/Supabase settings.");
        }
        throw err;
    }
    return pool;
}
let poolInstance = null;
async function getPool() {
    if (!poolInstance) {
        poolInstance = await createPool();
    }
    return poolInstance;
}
const pool = new Proxy({}, {
    get(target, prop) {
        if (!poolInstance) {
            throw new Error("Database pool not initialized. Call getPool() first.");
        }
        return poolInstance[prop];
    },
});
exports.default = pool;
if (process.env.DATABASE_URL) {
    getPool().catch((err) => {
        console.error("❌ Failed to initialize database pool:", err);
        process.exit(1);
    });
}
//# sourceMappingURL=connectionV2.js.map