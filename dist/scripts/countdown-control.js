#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCountdownStatus = getCountdownStatus;
exports.startCountdownRound = startCountdownRound;
exports.resetCountdown = resetCountdown;
exports.monitorCountdown = monitorCountdown;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const BASE_URL = process.env.BACKEND_URL || "http://localhost:3001";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
if (!ADMIN_API_KEY) {
    console.error("❌ ADMIN_API_KEY environment variable is required for admin operations");
    process.exit(1);
}
const apiClient = axios_1.default.create({
    baseURL: BASE_URL,
    headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_API_KEY}`,
    },
});
async function getCountdownStatus() {
    try {
        console.log("📊 Fetching countdown status...");
        const response = await axios_1.default.get(`${BASE_URL}/api/countdown`);
        const { phase, remainingSeconds, endsAt, isActive } = response.data;
        console.log("\n🎯 Countdown Status:");
        console.log(`   Phase: ${phase}`);
        console.log(`   Active: ${isActive}`);
        console.log(`   Remaining: ${remainingSeconds} seconds`);
        console.log(`   Ends at: ${endsAt || "N/A"}`);
        return response.data;
    }
    catch (error) {
        console.error("❌ Failed to get countdown status:", error.response?.data || error.message);
        throw error;
    }
}
async function startCountdownRound() {
    try {
        console.log("🚀 Starting countdown round...");
        const response = await apiClient.post("/api/admin/start-round");
        console.log("✅ Countdown round started successfully!");
        console.log(`   Phase: ${response.data.phase}`);
        console.log(`   Ends at: ${response.data.endsAt}`);
        return response.data;
    }
    catch (error) {
        console.error("❌ Failed to start countdown round:", error.response?.data || error.message);
        throw error;
    }
}
async function resetCountdown() {
    try {
        console.log("🔄 Resetting countdown...");
        const response = await apiClient.post("/api/admin/reset-countdown");
        console.log("✅ Countdown reset successfully!");
        console.log(`   Phase: ${response.data.phase}`);
        return response.data;
    }
    catch (error) {
        console.error("❌ Failed to reset countdown:", error.response?.data || error.message);
        throw error;
    }
}
async function monitorCountdown(intervalSeconds = 5) {
    console.log(`👀 Starting countdown monitor (updates every ${intervalSeconds}s)...`);
    console.log("Press Ctrl+C to stop monitoring\n");
    const monitor = setInterval(async () => {
        try {
            const status = await getCountdownStatus();
            process.stdout.write("\x1b[2J\x1b[0f");
            console.log(`🕐 ${new Date().toLocaleTimeString()} - Countdown Monitor`);
            console.log(`Phase: ${status.phase} | Active: ${status.isActive} | Remaining: ${status.remainingSeconds}s`);
            if (status.phase === "starting" && !status.isActive) {
                console.log('💡 Tip: Use "start" command to begin a new round');
            }
        }
        catch (error) {
            console.error("Monitor error:", error);
        }
    }, intervalSeconds * 1000);
    process.on("SIGINT", () => {
        clearInterval(monitor);
        console.log("\n👋 Monitoring stopped");
        process.exit(0);
    });
}
async function main() {
    const command = process.argv[2];
    console.log("🎲 Countdown Controller Script");
    console.log(`🔗 Backend URL: ${BASE_URL}\n`);
    try {
        switch (command) {
            case "status":
                await getCountdownStatus();
                break;
            case "start":
                await startCountdownRound();
                break;
            case "reset":
                await resetCountdown();
                break;
            case "monitor":
                const interval = parseInt(process.argv[3]) || 5;
                await monitorCountdown(interval);
                break;
            case "help":
            case "--help":
            case "-h":
                showHelp();
                break;
            default:
                console.log('❓ Unknown command. Use "help" to see available commands.\n');
                showHelp();
                process.exit(1);
        }
    }
    catch (error) {
        console.error("\n💥 Command failed");
        process.exit(1);
    }
}
function showHelp() {
    console.log("📖 Available Commands:");
    console.log("");
    console.log("  status              Get current countdown status");
    console.log("  start               Start a new countdown round (admin)");
    console.log("  reset               Reset countdown to starting state (admin)");
    console.log("  monitor [interval]  Monitor countdown with real-time updates");
    console.log("  help                Show this help message");
    console.log("");
    console.log("📋 Examples:");
    console.log("  npm run countdown status");
    console.log("  npm run countdown start");
    console.log("  npm run countdown reset");
    console.log("  npm run countdown monitor 3    # Update every 3 seconds");
    console.log("");
    console.log("🔧 Environment Variables:");
    console.log("  BACKEND_URL     Backend server URL (default: http://localhost:3001)");
    console.log("  ADMIN_API_KEY   Required for admin operations (start/reset)");
    console.log("");
    console.log("⏱️  Countdown Phases:");
    console.log("  starting  → countdown (1 hour) → selecting (1 min) → winner (1 min) → starting");
}
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=countdown-control.js.map