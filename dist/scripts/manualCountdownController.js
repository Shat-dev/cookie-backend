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
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetCountdown = exports.getCurrentState = exports.startCountdownRound = exports.getCountdownStatus = void 0;
exports.restoreCountdownState = restoreCountdownState;
const countdownRepository_1 = require("../repositories/countdownRepository");
let currentTimeout = null;
async function restoreCountdownState() {
    try {
        console.log("🔄 Restoring countdown state from database...");
        const savedState = await (0, countdownRepository_1.getCountdownState)();
        console.log(`📊 Found saved state: ${savedState.phase} (active: ${savedState.is_active})`);
        if (!savedState.is_active) {
            console.log("✅ No active countdown to restore");
            return;
        }
        switch (savedState.phase) {
            case "countdown":
                await restoreCountdownPhase(savedState);
                break;
            case "selecting":
                console.log("🎯 Resuming selecting phase...");
                await runSelectingPhase();
                break;
            case "winner":
                console.log("🏆 Resuming winner phase...");
                await runWinnerPhase();
                break;
            case "new_round":
                console.log("🔄 Resuming new_round phase...");
                await runNewRoundPhase();
                break;
            default:
                console.log(`⚠️ Unknown phase: ${savedState.phase}, resetting to starting`);
                await (0, countdownRepository_1.resetCountdownState)();
        }
    }
    catch (error) {
        console.error("❌ Error restoring countdown state:", error);
        console.log("🔄 Resetting to default state due to restoration error");
        await (0, countdownRepository_1.resetCountdownState)();
    }
}
async function restoreCountdownPhase(savedState) {
    if (!savedState.ends_at) {
        console.log("⚠️ Countdown phase missing end time, restarting countdown");
        await runCountdownPhase();
        return;
    }
    const now = new Date();
    const endTime = new Date(savedState.ends_at);
    const remainingMs = endTime.getTime() - now.getTime();
    if (remainingMs <= 0) {
        console.log("⏰ Countdown time has expired, transitioning to selecting phase");
        await runSelectingPhase();
    }
    else {
        const remainingSeconds = Math.floor(remainingMs / 1000);
        console.log(`⏰ Resuming countdown with ${remainingSeconds} seconds remaining`);
        if (currentTimeout) {
            clearTimeout(currentTimeout);
        }
        currentTimeout = setTimeout(() => {
            runSelectingPhase();
        }, remainingMs);
    }
}
const getCountdownStatus = async (req, res) => {
    try {
        const countdownState = await (0, countdownRepository_1.getCountdownState)();
        let remainingSeconds = 0;
        if (countdownState.phase === "countdown" && countdownState.ends_at) {
            const now = new Date();
            const timeLeft = countdownState.ends_at.getTime() - now.getTime();
            remainingSeconds = Math.max(0, Math.floor(timeLeft / 1000));
        }
        res.json({
            success: true,
            phase: countdownState.phase,
            remainingSeconds,
            endsAt: countdownState.ends_at,
            isActive: countdownState.is_active,
        });
    }
    catch (error) {
        console.error("Error getting countdown status:", error);
        res.status(500).json({
            success: false,
            error: "Failed to get countdown status",
        });
    }
};
exports.getCountdownStatus = getCountdownStatus;
const startCountdownRound = async (req, res) => {
    try {
        const currentState = await (0, countdownRepository_1.getCountdownState)();
        if (currentState.is_active) {
            res.status(400).json({
                success: false,
                error: "A countdown round is already active",
                currentPhase: currentState.phase,
            });
            return;
        }
        console.log("🔍 About to start countdown lifecycle...");
        await startCountdownLifecycle();
        const updatedState = await (0, countdownRepository_1.getCountdownState)();
        res.json({
            success: true,
            message: "Countdown round started",
            phase: updatedState.phase,
            endsAt: updatedState.ends_at,
        });
    }
    catch (error) {
        console.error("Error starting countdown round:", error);
        res.status(500).json({
            success: false,
            error: "Failed to start countdown round",
        });
    }
};
exports.startCountdownRound = startCountdownRound;
async function startCountdownLifecycle() {
    if (currentTimeout) {
        clearTimeout(currentTimeout);
    }
    await runCountdownPhase();
}
async function runCountdownPhase() {
    const now = new Date();
    const countdownEnd = new Date(now.getTime() + 60 * 1000 * 5);
    await (0, countdownRepository_1.setCountdownState)({
        phase: "countdown",
        ends_at: countdownEnd,
        is_active: true,
    });
    console.log("🚀 Phase 1: countdown (1 hour)");
    if (currentTimeout) {
        clearTimeout(currentTimeout);
    }
    currentTimeout = setTimeout(() => {
        runSelectingPhase();
    }, 60 * 1000 * 5);
}
async function runSelectingPhase() {
    await (0, countdownRepository_1.setCountdownState)({
        phase: "selecting",
        ends_at: null,
        is_active: true,
    });
    console.log("🎯 Phase 2: selecting (1 minute)");
    if (currentTimeout) {
        clearTimeout(currentTimeout);
    }
    currentTimeout = setTimeout(() => {
        runWinnerPhase();
    }, 60 * 1000);
}
async function runWinnerPhase() {
    await (0, countdownRepository_1.setCountdownState)({
        phase: "winner",
        ends_at: null,
        is_active: true,
    });
    console.log("🏆 Phase 3: winner (1 minute)");
    console.log("🏁 Winner phase reached — triggering authenticated VRF draw");
    executeVrfDrawViaApi()
        .then((result) => {
        if (result.success) {
            console.log(`✅ [COUNTDOWN VRF] VRF draw completed: ${result.txHash}`);
            if (result.winnerAddress) {
                console.log(`🏆 [COUNTDOWN VRF] Winner: ${result.winnerAddress} (Token: ${result.winningTokenId})`);
            }
        }
        else {
            console.error(`❌ [COUNTDOWN VRF] VRF draw failed: ${result.error}`);
        }
    })
        .catch((err) => {
        console.error("❌ [COUNTDOWN VRF] Failed to execute VRF draw:", err.message);
    });
    if (currentTimeout) {
        clearTimeout(currentTimeout);
    }
    currentTimeout = setTimeout(() => {
        runNewRoundPhase();
    }, 60 * 1000);
}
async function executeVrfDrawViaApi() {
    try {
        const axios = (await Promise.resolve().then(() => __importStar(require("axios")))).default;
        const env = (await Promise.resolve().then(() => __importStar(require("../utils/loadEnv")))).default;
        const { BACKEND_URL, ADMIN_API_KEY } = env;
        if (!ADMIN_API_KEY) {
            throw new Error("ADMIN_API_KEY not configured for countdown VRF execution");
        }
        if (!BACKEND_URL) {
            throw new Error("BACKEND_URL not configured for countdown VRF execution");
        }
        console.log("🎲 [COUNTDOWN VRF] Executing VRF draw via authenticated API...");
        const response = await axios.post(`${BACKEND_URL}/api/admin/manual-vrf-draw`, {}, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${ADMIN_API_KEY}`,
                "User-Agent": "countdown-controller/1.0",
            },
            timeout: 120000,
        });
        return response.data;
    }
    catch (error) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            console.error(`❌ [COUNTDOWN VRF] HTTP ${status} error:`, data);
            return {
                success: false,
                error: data?.error || `HTTP ${status} error`,
            };
        }
        else {
            console.error("❌ [COUNTDOWN VRF] Network/request error:", error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }
}
async function runNewRoundPhase() {
    await (0, countdownRepository_1.setCountdownState)({
        phase: "new_round",
        ends_at: null,
        is_active: true,
    });
    console.log("🔄 Phase 4: new_round (30 seconds)");
    if (currentTimeout) {
        clearTimeout(currentTimeout);
    }
    currentTimeout = setTimeout(() => {
        runCountdownPhase();
    }, 30 * 1000);
}
const getCurrentState = async () => {
    return await (0, countdownRepository_1.getCountdownState)();
};
exports.getCurrentState = getCurrentState;
const resetCountdown = async (req, res) => {
    try {
        if (currentTimeout) {
            clearTimeout(currentTimeout);
            currentTimeout = null;
        }
        await (0, countdownRepository_1.resetCountdownState)();
        console.log("🔄 Countdown manually reset to starting state - Loop stopped");
        res.json({
            success: true,
            message: "Countdown reset to starting state and loop stopped",
            phase: "starting",
        });
    }
    catch (error) {
        console.error("Error resetting countdown:", error);
        res.status(500).json({
            success: false,
            error: "Failed to reset countdown",
        });
    }
};
exports.resetCountdown = resetCountdown;
async function cleanup(signal) {
    console.log(`\n🛑 Received ${signal} signal. Starting countdown cleanup...`);
    try {
        if (currentTimeout) {
            clearTimeout(currentTimeout);
            currentTimeout = null;
            console.log("✅ Cleared active countdown timeout");
        }
        try {
            await (0, countdownRepository_1.setCountdownState)({ is_active: false });
            console.log("✅ Marked countdown as inactive in database");
        }
        catch (dbError) {
            console.error("⚠️ Failed to update database during cleanup:", dbError);
        }
        console.log("✅ Countdown cleanup completed successfully");
    }
    catch (error) {
        console.error("❌ Error during countdown cleanup:", error);
    }
    process.exit(0);
}
function handleShutdownSignal(signal) {
    if (process.env.COUNTDOWN_CLEANUP_STARTED) {
        console.log(`⚠️ Cleanup already in progress, ignoring ${signal}`);
        return;
    }
    process.env.COUNTDOWN_CLEANUP_STARTED = "true";
    const forceExitTimeout = setTimeout(() => {
        console.log("⚠️ Cleanup timeout reached, forcing exit");
        process.exit(1);
    }, 5000);
    cleanup(signal)
        .then(() => {
        clearTimeout(forceExitTimeout);
    })
        .catch((error) => {
        console.error("❌ Cleanup failed:", error);
        clearTimeout(forceExitTimeout);
        process.exit(1);
    });
}
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
if (!process.env.COUNTDOWN_SIGNALS_REGISTERED) {
    console.log("🛡️ Countdown graceful shutdown handlers registered (SIGTERM, SIGINT)");
    process.env.COUNTDOWN_SIGNALS_REGISTERED = "true";
}
//# sourceMappingURL=manualCountdownController.js.map