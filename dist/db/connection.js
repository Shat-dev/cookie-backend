"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const node_dns_1 = __importDefault(require("node:dns"));
const url_1 = require("url");
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
        port: parseInt(dbUrl.port || "5432", 10),
        database: dbUrl.pathname.slice(1),
        user: dbUrl.username,
        password: dbUrl.password,
        ssl: process.env.NODE_ENV === "production"
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
        lookup: ((hostname, _opts, cb) => node_dns_1.default.lookup(hostname, { family: 4 }, cb)),
    };
}
else {
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
        lookup: ((hostname, _opts, cb) => node_dns_1.default.lookup(hostname, { family: 4 }, cb)),
    };
}
console.log("Pool configuration:", {
    ...poolConfig,
    password: poolConfig.password ? "[HIDDEN]" : undefined,
    connectionString: poolConfig.connectionString ? "[HIDDEN]" : undefined,
});
const pool = new pg_1.Pool(poolConfig);
pool.on("error", (err) => {
    const isTimeoutError = err.code === "ETIMEDOUT" ||
        err.code === "ECONNREFUSED" ||
        err.message?.includes?.("timeout");
    if (isTimeoutError) {
        console.warn("⚠️ Database connection timeout on idle client; will retry on next use:", err.message);
    }
    else {
        console.error("❌ Unexpected error on idle client", err);
    }
    if (process.env.NODE_ENV !== "production" && !isTimeoutError) {
        process.exit(-1);
    }
});
exports.default = pool;
//# sourceMappingURL=connection.js.map