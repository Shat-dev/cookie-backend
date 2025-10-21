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
let countdownState = {
    phase: "starting",
    endsAt: null,
    isActive: false,
};
let currentTimeout = null;
const getCountdownStatus = (req, res) => {
    try {
        let remainingSeconds = 0;
        if (countdownState.phase === "countdown" && countdownState.endsAt) {
            const now = new Date();
            const timeLeft = countdownState.endsAt.getTime() - now.getTime();
            remainingSeconds = Math.max(0, Math.floor(timeLeft / 1000));
        }
        res.json({
            success: true,
            phase: countdownState.phase,
            remainingSeconds,
            endsAt: countdownState.endsAt,
            isActive: countdownState.isActive,
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
const startCountdownRound = (req, res) => {
    try {
        if (countdownState.isActive) {
            res.status(400).json({
                success: false,
                error: "A countdown round is already active",
                currentPhase: countdownState.phase,
            });
            return;
        }
        console.log("🔍 About to start countdown lifecycle...");
        startCountdownLifecycle();
        res.json({
            success: true,
            message: "Countdown round started",
            phase: countdownState.phase,
            endsAt: countdownState.endsAt,
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
function startCountdownLifecycle() {
    if (currentTimeout) {
        clearTimeout(currentTimeout);
    }
    runCountdownPhase();
}
function runCountdownPhase() {
    const now = new Date();
    const countdownEnd = new Date(now.getTime() + 60 * 1000);
    countdownState = {
        phase: "countdown",
        endsAt: countdownEnd,
        isActive: true,
    };
    console.log("🚀 Phase 1: countdown (1 hour)");
    currentTimeout = setTimeout(() => {
        runSelectingPhase();
    }, 60 * 1000);
}
function runSelectingPhase() {
    countdownState = {
        phase: "selecting",
        endsAt: null,
        isActive: true,
    };
    console.log("🎯 Phase 2: selecting (1 minute)");
    currentTimeout = setTimeout(() => {
        runWinnerPhase();
    }, 60 * 1000);
}
function runWinnerPhase() {
    countdownState = {
        phase: "winner",
        endsAt: null,
        isActive: true,
    };
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
function runNewRoundPhase() {
    countdownState = {
        phase: "new_round",
        endsAt: null,
        isActive: true,
    };
    console.log("🔄 Phase 4: new_round (30 seconds)");
    currentTimeout = setTimeout(() => {
        runCountdownPhase();
    }, 30 * 1000);
}
const getCurrentState = () => countdownState;
exports.getCurrentState = getCurrentState;
const resetCountdown = (req, res) => {
    try {
        if (currentTimeout) {
            clearTimeout(currentTimeout);
            currentTimeout = null;
        }
        countdownState = {
            phase: "starting",
            endsAt: null,
            isActive: false,
        };
        console.log("🔄 Countdown manually reset to starting state - Loop stopped");
        res.json({
            success: true,
            message: "Countdown reset to starting state and loop stopped",
            phase: countdownState.phase,
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
//# sourceMappingURL=manualCountdownController.js.map