"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetCountdown = exports.getCurrentState = exports.startCountdownRound = exports.getCountdownStatus = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
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
    const now = new Date();
    const countdownEnd = new Date(now.getTime() + 60 * 1000);
    countdownState = {
        phase: "countdown",
        endsAt: countdownEnd,
        isActive: true,
    };
    console.log("🚀 Countdown started - Phase 1: countdown (1 hour)");
    currentTimeout = setTimeout(() => {
        countdownState = {
            phase: "selecting",
            endsAt: null,
            isActive: true,
        };
        console.log("🎯 Phase 2: selecting (1 minute)");
        currentTimeout = setTimeout(() => {
            countdownState = {
                phase: "winner",
                endsAt: null,
                isActive: true,
            };
            console.log("🏆 Phase 3: winner (1 minute)");
            console.log("🏁 Winner phase reached — triggering manual VRF draw");
            try {
                const vrfPath = process.env.NODE_ENV === "production"
                    ? path_1.default.resolve(__dirname, "../scripts/manual-vrf-draw.js")
                    : path_1.default.resolve(__dirname, "../scripts/manual-vrf-draw.ts");
                console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
                console.log(`🔧 VRF script path: ${vrfPath}`);
                const subprocess = (0, child_process_1.fork)(vrfPath, [], {
                    execArgv: process.env.NODE_ENV === "production"
                        ? []
                        : ["-r", require.resolve("ts-node/register")],
                    stdio: ["pipe", "pipe", "pipe", "ipc"],
                });
                subprocess.stdout?.on("data", (data) => {
                    process.stdout.write(data);
                });
                subprocess.stderr?.on("data", (data) => {
                    process.stderr.write(data);
                });
                subprocess.on("error", (err) => {
                    console.error("❌ Failed to spawn VRF subprocess:", err);
                    console.error("❌ Check if the VRF script file exists at:", vrfPath);
                });
                subprocess.on("exit", (code) => {
                    console.log(`🎲 VRF subprocess exited with code ${code}`);
                });
            }
            catch (err) {
                console.error("❌ Failed to start manual VRF draw process:", err);
            }
            currentTimeout = setTimeout(() => {
                countdownState = {
                    phase: "starting",
                    endsAt: null,
                    isActive: false,
                };
                console.log("🔄 Reset to starting - Ready for next round");
                currentTimeout = null;
            }, 60 * 1000);
        }, 60 * 1000);
    }, 60 * 1000);
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
        console.log("🔄 Countdown manually reset to starting state");
        res.json({
            success: true,
            message: "Countdown reset to starting state",
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