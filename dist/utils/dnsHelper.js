"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveHostnameToIPv4 = resolveHostnameToIPv4;
exports.ensureIPv4DatabaseUrl = ensureIPv4DatabaseUrl;
const node_dns_1 = __importDefault(require("node:dns"));
const util_1 = require("util");
const dnsLookup = (0, util_1.promisify)(node_dns_1.default.lookup);
async function resolveHostnameToIPv4(hostname) {
    try {
        console.log(`🔍 Resolving ${hostname} to IPv4...`);
        const result = await dnsLookup(hostname, 4);
        const address = typeof result === "string" ? result : result.address;
        console.log(`✅ Resolved ${hostname} to ${address}`);
        return address;
    }
    catch (error) {
        console.error(`❌ Failed to resolve ${hostname} to IPv4:`, error);
        if (hostname.includes("supabase.co")) {
            console.log("🔧 Attempting manual Supabase resolution...");
            try {
                const addresses = await (0, util_1.promisify)(node_dns_1.default.resolve4)(hostname);
                if (addresses.length > 0) {
                    console.log(`✅ Found IPv4 addresses: ${addresses.join(", ")}`);
                    return addresses[0];
                }
            }
            catch (resolveError) {
                console.error("❌ Manual resolution failed:", resolveError);
            }
        }
        throw error;
    }
}
async function ensureIPv4DatabaseUrl(databaseUrl) {
    try {
        const url = new URL(databaseUrl);
        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        if (ipv4Regex.test(url.hostname)) {
            console.log("✅ DATABASE_URL already uses IPv4");
            return databaseUrl;
        }
        const ipv4Address = await resolveHostnameToIPv4(url.hostname);
        url.hostname = ipv4Address;
        const newUrl = url.toString();
        console.log(`🔄 Converted DATABASE_URL to use IPv4: ${url.hostname}`);
        return newUrl;
    }
    catch (error) {
        console.error("❌ Failed to ensure IPv4 DATABASE_URL:", error);
        return databaseUrl;
    }
}
//# sourceMappingURL=dnsHelper.js.map