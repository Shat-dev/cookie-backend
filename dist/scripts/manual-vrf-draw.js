"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const axios_1 = __importDefault(require("axios"));
const loadEnv_1 = __importDefault(require("../utils/loadEnv"));
const { BACKEND_URL, ADMIN_API_KEY } = loadEnv_1.default;
async function executeVrfDrawViaApi() {
    try {
        console.log("🎲 [MANUAL VRF] Starting VRF draw via authenticated API...");
        console.log(`🔗 [MANUAL VRF] Backend URL: ${BACKEND_URL}`);
        console.log(`🔑 [MANUAL VRF] Admin key configured: ${!!ADMIN_API_KEY}`);
        if (!ADMIN_API_KEY) {
            throw new Error("ADMIN_API_KEY environment variable is required");
        }
        if (!BACKEND_URL) {
            throw new Error("BACKEND_URL environment variable is required");
        }
        const response = await axios_1.default.post(`${BACKEND_URL}/api/admin/manual-vrf-draw`, {}, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ADMIN_API_KEY}`,
                "User-Agent": "manual-vrf-draw-script/1.0",
            },
            timeout: 120000,
        });
        console.log("✅ [MANUAL VRF] VRF draw API call successful");
        return response.data;
    }
    catch (error) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            console.error(`❌ [MANUAL VRF] HTTP ${status} error:`, data);
            if (status === 401 || status === 403) {
                console.error("🔒 [MANUAL VRF] Authentication failed - check ADMIN_API_KEY");
            }
            return {
                success: false,
                message: `HTTP ${status}: ${data?.error || data?.message || "Unknown error"}`,
                error: data?.error || `HTTP ${status} error`,
            };
        }
        else if (error.code === "ECONNREFUSED") {
            console.error("❌ [MANUAL VRF] Connection refused - is the backend server running?");
            return {
                success: false,
                message: "Connection refused - backend server not reachable",
                error: "ECONNREFUSED",
            };
        }
        else {
            console.error("❌ [MANUAL VRF] Network/request error:", error.message);
            return {
                success: false,
                message: `Request failed: ${error.message}`,
                error: error.message,
            };
        }
    }
}
function validateCliArguments() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        return !!ADMIN_API_KEY;
    }
    if (args.length === 1) {
        const providedKey = args[0];
        if (!ADMIN_API_KEY) {
            console.error("❌ [MANUAL VRF] ADMIN_API_KEY not configured in environment");
            return false;
        }
        if (providedKey !== ADMIN_API_KEY) {
            console.error("❌ [MANUAL VRF] Provided CLI key does not match ADMIN_API_KEY");
            return false;
        }
        console.log("✅ [MANUAL VRF] CLI key validation successful");
        return true;
    }
    console.error("❌ [MANUAL VRF] Invalid arguments. Usage: npm run manual-vrf-draw [ADMIN_API_KEY]");
    return false;
}
async function main() {
    try {
        console.log("🎲 [MANUAL VRF] Manual VRF Draw Script (Authenticated)");
        console.log("===============================================");
        if (!validateCliArguments()) {
            console.error("❌ [MANUAL VRF] Authentication validation failed");
            process.exit(1);
        }
        const result = await executeVrfDrawViaApi();
        if (result.success) {
            console.log("✅ [MANUAL VRF] VRF draw completed successfully!");
            console.log(`   Transaction Hash: ${result.txHash}`);
            console.log(`   Round: ${result.roundNumber} (ID: ${result.roundId})`);
            if (result.winnerAddress) {
                console.log(`   Winner: ${result.winnerAddress}`);
                console.log(`   Winning Token: ${result.winningTokenId}`);
            }
            else {
                console.log("   Winner: Pending VRF fulfillment");
            }
            console.log(`   Message: ${result.message}`);
            process.exit(0);
        }
        else {
            console.error("❌ [MANUAL VRF] VRF draw failed:");
            console.error(`   Error: ${result.error}`);
            console.error(`   Message: ${result.message}`);
            process.exit(1);
        }
    }
    catch (error) {
        console.error("❌ [MANUAL VRF] Unhandled error:", error.message);
        console.error("Stack trace:", error.stack);
        process.exit(1);
    }
}
main().catch((err) => {
    console.error("❌ Unhandled error:", err);
    return;
});
//# sourceMappingURL=manual-vrf-draw.js.map