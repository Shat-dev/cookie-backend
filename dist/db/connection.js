"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const node_dns_1 = __importDefault(require("node:dns"));
const url_1 = require("url");
dotenv_1.default.config();
node_dns_1.default.setDefaultResultOrder("ipv4first");
console.log("conn.ts loaded", {
    NODE_ENV: process.env.NODE_ENV,
    hasDBURL: !!process.env.DATABASE_URL,
});
let poolConfig;
if (process.env.DATABASE_URL) {
    const dbUrl = new url_1.URL(process.env.DATABASE_URL);
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
        connectionTimeoutMillis: 5000,
        lookup: (hostname, options, callback) => {
            node_dns_1.default.lookup(hostname, 4, callback);
        },
    };
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
        lookup: (hostname, _opts, cb) => node_dns_1.default.lookup(hostname, { family: 4 }, cb),
    };
}
console.log("Pool configuration:", {
    ...poolConfig,
    password: poolConfig.password ? "[HIDDEN]" : undefined,
    connectionString: poolConfig.connectionString ? "[HIDDEN]" : undefined,
});
const pool = new pg_1.Pool(poolConfig);
pool.on("connect", (client) => {
    console.log("✅ Connected to PostgreSQL database");
    if (process.env.NODE_ENV === "production") {
        console.log("🔒 Using SSL connection");
    }
    client.query("SELECT inet_server_addr(), inet_server_port()", (err, result) => {
        if (!err && result.rows.length > 0) {
            console.log("📍 Connected to:", result.rows[0]);
        }
    });
});
pool.on("error", (err) => {
    console.error("❌ Unexpected error on idle client", err);
    if (process.env.NODE_ENV !== "production") {
        process.exit(-1);
    }
});
pool.query("SELECT NOW()", (err, res) => {
    if (err) {
        console.error("❌ Initial connection test failed:", err.message);
        if (err.code === "ENETUNREACH") {
            console.error("🔧 Network unreachable - likely IPv6 issue. Ensure DATABASE_URL uses IPv4.");
        }
    }
    else {
        console.log("✅ Initial connection test successful:", res.rows[0].now);
    }
});
exports.default = pool;
//# sourceMappingURL=connection.js.map