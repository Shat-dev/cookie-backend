"use strict";
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
    const countdownEnd = new Date(now.getTime() + 60 * 60 * 1000);
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
    }, 60 * 60 * 1000);
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