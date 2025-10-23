import "dotenv/config";
import axios from "axios";
import env from "../utils/loadEnv";

// Configuration from shared environment loader
const { BACKEND_URL, ADMIN_API_KEY } = env;

interface VrfDrawResponse {
  success: boolean;
  txHash?: string;
  winnerAddress?: string;
  winningTokenId?: string;
  roundId?: number;
  roundNumber?: number;
  message: string;
  error?: string;
}

//npm run manual-vrf-draw YOUR_ADMIN_KEY

/**
 * Execute VRF draw via authenticated HTTP endpoint
 * This replaces direct blockchain/database access with secure API calls
 */
async function executeVrfDrawViaApi(): Promise<VrfDrawResponse> {
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

    // Make authenticated request to VRF endpoint
    const response = await axios.post(
      `${BACKEND_URL}/api/admin/manual-vrf-draw`,
      {}, // Empty body
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ADMIN_API_KEY}`,
          "User-Agent": "manual-vrf-draw-script/1.0",
        },
        timeout: 120000, // 2 minute timeout for VRF operations
      }
    );

    console.log("✅ [MANUAL VRF] VRF draw API call successful");
    return response.data;
  } catch (error: any) {
    if (error.response) {
      // HTTP error response
      const status = error.response.status;
      const data = error.response.data;

      console.error(`❌ [MANUAL VRF] HTTP ${status} error:`, data);

      if (status === 401 || status === 403) {
        console.error(
          "🔒 [MANUAL VRF] Authentication failed - check ADMIN_API_KEY"
        );
      }

      return {
        success: false,
        message: `HTTP ${status}: ${
          data?.error || data?.message || "Unknown error"
        }`,
        error: data?.error || `HTTP ${status} error`,
      };
    } else if (error.code === "ECONNREFUSED") {
      console.error(
        "❌ [MANUAL VRF] Connection refused - is the backend server running?"
      );
      return {
        success: false,
        message: "Connection refused - backend server not reachable",
        error: "ECONNREFUSED",
      };
    } else {
      console.error("❌ [MANUAL VRF] Network/request error:", error.message);
      return {
        success: false,
        message: `Request failed: ${error.message}`,
        error: error.message,
      };
    }
  }
}

/**
 * Validate CLI arguments for direct execution safeguard
 */
function validateCliArguments(): boolean {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // No CLI args provided - use environment variable
    return !!ADMIN_API_KEY;
  }

  if (args.length === 1) {
    // CLI argument provided - validate it matches environment
    const providedKey = args[0];

    if (!ADMIN_API_KEY) {
      console.error(
        "❌ [MANUAL VRF] ADMIN_API_KEY not configured in environment"
      );
      return false;
    }

    if (providedKey !== ADMIN_API_KEY) {
      console.error(
        "❌ [MANUAL VRF] Provided CLI key does not match ADMIN_API_KEY"
      );
      return false;
    }

    console.log("✅ [MANUAL VRF] CLI key validation successful");
    return true;
  }

  console.error(
    "❌ [MANUAL VRF] Invalid arguments. Usage: npm run manual-vrf-draw [ADMIN_API_KEY]"
  );
  return false;
}

// npx ts-node src/scripts/manual-vrf-draw.ts [ADMIN_API_KEY]
//npm run manual-vrf-draw  # HTTP call with admin authentication
//npm run manual-vrf-draw YOUR_ADMIN_KEY
async function main(): Promise<void> {
  try {
    console.log("🎲 [MANUAL VRF] Manual VRF Draw Script (Authenticated)");
    console.log("===============================================");

    // Validate CLI arguments and authentication
    if (!validateCliArguments()) {
      console.error("❌ [MANUAL VRF] Authentication validation failed");
      process.exit(1);
    }

    // Execute VRF draw via authenticated API
    const result = await executeVrfDrawViaApi();

    if (result.success) {
      console.log("✅ [MANUAL VRF] VRF draw completed successfully!");
      console.log(`   Transaction Hash: ${result.txHash}`);
      console.log(`   Round: ${result.roundNumber} (ID: ${result.roundId})`);

      if (result.winnerAddress) {
        console.log(`   Winner: ${result.winnerAddress}`);
        console.log(`   Winning Token: ${result.winningTokenId}`);
      } else {
        console.log("   Winner: Pending VRF fulfillment");
      }

      console.log(`   Message: ${result.message}`);
      process.exit(0);
    } else {
      console.error("❌ [MANUAL VRF] VRF draw failed:");
      console.error(`   Error: ${result.error}`);
      console.error(`   Message: ${result.message}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error("❌ [MANUAL VRF] Unhandled error:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Unhandled error:", err);
  return;
});
