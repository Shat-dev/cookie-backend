"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const node_dns_1 = __importDefault(require("node:dns"));
const util_1 = require("util");
const url_1 = require("url");
dotenv_1.default.config();
const dnsLookup = (0, util_1.promisify)(node_dns_1.default.lookup);
const dnsResolve4 = (0, util_1.promisify)(node_dns_1.default.resolve4);
async function testDatabaseConnection() {
    console.log("🔍 Testing Database IPv4 Connection...\n");
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL not set");
        return;
    }
    try {
        const dbUrl = new url_1.URL(process.env.DATABASE_URL);
        console.log(`📍 Database Host: ${dbUrl.hostname}`);
        console.log(`📍 Database Port: ${dbUrl.port || "5432"}`);
        console.log(`📍 Database Name: ${dbUrl.pathname.slice(1)}\n`);
        console.log("🔄 Testing DNS resolution...");
        try {
            const ipv4Result = await dnsLookup(dbUrl.hostname, 4);
            const ipv4Address = typeof ipv4Result === "string" ? ipv4Result : ipv4Result.address;
            console.log(`✅ IPv4 lookup successful: ${ipv4Address}`);
        }
        catch (err) {
            console.error("❌ IPv4 lookup failed:", err);
        }
        try {
            const ipv6Result = await dnsLookup(dbUrl.hostname, 6);
            const ipv6Address = typeof ipv6Result === "string" ? ipv6Result : ipv6Result.address;
            console.log(`📝 IPv6 lookup result: ${ipv6Address}`);
        }
        catch (err) {
            console.error("⚠️ IPv6 lookup failed:", err);
        }
        try {
            const addresses = await dnsResolve4(dbUrl.hostname);
            console.log(`✅ resolve4 results: ${addresses.join(", ")}`);
        }
        catch (err) {
            console.error("❌ resolve4 failed:", err);
        }
        console.log("\n🔄 Testing PostgreSQL connection...");
        const { Pool } = await Promise.resolve().then(() => __importStar(require("pg")));
        try {
            const ipv4Result = await dnsLookup(dbUrl.hostname, 4);
            const ipv4Address = typeof ipv4Result === "string" ? ipv4Result : ipv4Result.address;
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
        }
        catch (err) {
            console.error("❌ IPv4 connection failed:", err);
        }
        try {
            const hostnamePool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },
                connectionTimeoutMillis: 5000,
            });
            const result = await hostnamePool.query("SELECT NOW()");
            console.log(`✅ Hostname connection successful: ${result.rows[0].now}`);
            await hostnamePool.end();
        }
        catch (err) {
            console.error("❌ Hostname connection failed:", err);
        }
    }
    catch (error) {
        console.error("❌ Test failed:", error);
    }
}
node_dns_1.default.setDefaultResultOrder("ipv4first");
testDatabaseConnection()
    .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
})
    .catch((err) => {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
});
//# sourceMappingURL=test-ipv4-connection.js.map