"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const envPath = path_1.default.resolve(__dirname, "../../.env");
const result = dotenv_1.default.config({ path: envPath });
if (result.error) {
    console.log(`⚠️ No .env file found at ${envPath}, using system environment variables`);
}
else {
    console.log(`✅ Environment loaded from: ${envPath}`);
}
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const NODE_ENV = process.env.NODE_ENV || "development";
if (!ADMIN_API_KEY) {
    console.error("❌ ADMIN_API_KEY environment variable is required");
    process.exit(1);
}
if (!BACKEND_URL) {
    console.error("❌ BACKEND_URL environment variable is required");
    process.exit(1);
}
const env = {
    BACKEND_URL,
    ADMIN_API_KEY,
    NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
    X_USER_ID: process.env.X_USER_ID,
    RPC_URL: process.env.RPC_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    FRONTEND_URL: process.env.FRONTEND_URL,
    VERCEL_APP_NAME: process.env.VERCEL_APP_NAME,
    CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN,
};
console.log(`[CONFIG] Environment: ${NODE_ENV}`);
console.log(`[CONFIG] Backend URL: ${BACKEND_URL}`);
console.log(`[CONFIG] Admin API Key length: ${ADMIN_API_KEY.length}`);
exports.default = env;
//# sourceMappingURL=loadEnv.js.map