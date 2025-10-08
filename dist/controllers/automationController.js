"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationController = void 0;
const ethers_1 = require("ethers");
const lotteryClient_1 = require("../lotteryClient");
const entryRepository_1 = require("../db/entryRepository");
exports.automationController = {
    async getStatus(_req, res) {
        try {
            const [enabled, nextAt, currentRound, unpushedCount] = await Promise.all([
                lotteryClient_1.lottery.s_automationEnabled(),
                lotteryClient_1.lottery.s_nextAllowedPerformAt(),
                lotteryClient_1.lottery.s_currentRound(),
                entryRepository_1.entryRepository.countUnpushed(),
            ]);
            const [upkeepNeeded, performData] = await lotteryClient_1.lottery.checkUpkeep("0x");
            let reason = "";
            if (!upkeepNeeded && performData !== "0x") {
                try {
                    reason = ethers_1.ethers.toUtf8String(performData);
                }
                catch {
                    reason = "unknown";
                }
            }
            const currentTime = Math.floor(Date.now() / 1000);
            const nextAllowedTime = Number(nextAt);
            const timeUntilNext = Math.max(0, nextAllowedTime - currentTime);
            let activeRound = null;
            let needsRoundCreation = false;
            if (currentRound > 0n) {
                try {
                    const rd = await (0, lotteryClient_1.getRound)(Number(currentRound));
                    const now = BigInt(currentTime);
                    if (rd.isActive &&
                        BigInt(rd.start) <= now &&
                        BigInt(rd.end) > now &&
                        !rd.isCompleted) {
                        activeRound = {
                            round: Number(currentRound),
                            startTime: Number(rd.start),
                            endTime: Number(rd.end),
                            totalEntries: Number(rd.totalEntries),
                            secondsRemaining: Number(BigInt(rd.end) - now),
                        };
                    }
                }
                catch { }
            }
            if (!activeRound && unpushedCount > 0) {
                needsRoundCreation = true;
            }
            res.json({
                success: true,
                data: {
                    automationEnabled: enabled,
                    currentRound: Number(currentRound),
                    upkeepNeeded,
                    reason: reason || undefined,
                    nextAllowedPerformAt: nextAllowedTime,
                    timeUntilNext,
                    activeRound,
                    needsRoundCreation,
                    unpushedEntries: unpushedCount,
                },
            });
        }
        catch (error) {
            console.error("Error getting automation status:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get automation status",
            });
        }
    },
    async getUnifiedStatus(_req, res) {
        try {
            const [enabled, nextAt, currentRound, unpushedCount] = await Promise.all([
                lotteryClient_1.lottery.s_automationEnabled(),
                lotteryClient_1.lottery.s_nextAllowedPerformAt(),
                lotteryClient_1.lottery.s_currentRound(),
                entryRepository_1.entryRepository.countUnpushed(),
            ]);
            const [upkeepNeeded, performData] = await lotteryClient_1.lottery.checkUpkeep("0x");
            let reason = "";
            if (!upkeepNeeded && performData !== "0x") {
                try {
                    reason = ethers_1.ethers.toUtf8String(performData);
                }
                catch {
                    reason = "unknown";
                }
            }
            const currentTime = Math.floor(Date.now() / 1000);
            const nextAllowedTime = Number(nextAt);
            const timeUntilNext = Math.max(0, nextAllowedTime - currentTime);
            let activeRound = null;
            let roundData = null;
            if (currentRound > 0n) {
                try {
                    const rd = await (0, lotteryClient_1.getRound)(Number(currentRound));
                    const now = BigInt(currentTime);
                    if (rd.isActive &&
                        BigInt(rd.start) <= now &&
                        BigInt(rd.end) > now &&
                        !rd.isCompleted) {
                        activeRound = {
                            round: Number(currentRound),
                            startTime: Number(rd.start),
                            endTime: Number(rd.end),
                            totalEntries: Number(rd.totalEntries),
                            secondsRemaining: Number(BigInt(rd.end) - now),
                        };
                        roundData = {
                            roundNumber: Number(currentRound),
                            startTime: Number(rd.start),
                            endTime: Number(rd.end),
                            isActive: true,
                            timeLeft: Number(BigInt(rd.end) - now),
                            totalEntries: Number(rd.totalEntries),
                        };
                    }
                }
                catch (error) {
                    console.error("Error fetching round data:", error);
                }
            }
            const automation = {
                automationEnabled: enabled,
                currentRound: Number(currentRound),
                upkeepNeeded,
                reason: reason || undefined,
                nextAllowedPerformAt: nextAllowedTime,
                timeUntilNext,
                activeRound,
                unpushedEntries: unpushedCount,
            };
            res.json({
                success: true,
                data: {
                    automation,
                    roundData,
                },
            });
        }
        catch (error) {
            console.error("Error getting unified status:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get unified status",
            });
        }
    },
    async getNextDraw(_req, res) {
        try {
            const currentRound = await lotteryClient_1.lottery.s_currentRound();
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentRound > 0n) {
                const rd = await (0, lotteryClient_1.getRound)(Number(currentRound));
                const now = BigInt(currentTime);
                if (rd.isActive &&
                    BigInt(rd.start) <= now &&
                    BigInt(rd.end) > now &&
                    !rd.isCompleted) {
                    const endTime = Number(rd.end);
                    const secondsRemaining = endTime - currentTime;
                    const databaseEntries = await entryRepository_1.entryRepository.getAllEntries();
                    const byWallet = new Map();
                    for (const r of databaseEntries) {
                        const w = r.wallet_address.toLowerCase();
                        if (!byWallet.has(w))
                            byWallet.set(w, new Set());
                        byWallet.get(w).add(r.token_id);
                    }
                    const actualEntryCount = Array.from(byWallet.values()).reduce((total, tokenSet) => total + tokenSet.size, 0);
                    res.json({
                        success: true,
                        data: {
                            hasActiveDraw: true,
                            round: Number(currentRound),
                            drawTime: endTime,
                            secondsRemaining: Math.max(0, secondsRemaining),
                            totalEntries: actualEntryCount,
                            onChainEntries: Number(rd.totalEntries),
                        },
                    });
                    return;
                }
            }
            const unpushedCount = await entryRepository_1.entryRepository.countUnpushed();
            res.json({
                success: true,
                data: {
                    hasActiveDraw: false,
                    message: unpushedCount > 0
                        ? "No active round. First entry will create a new round."
                        : "No active round and no pending entries.",
                },
            });
        }
        catch (error) {
            console.error("Error getting next draw:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get next draw info",
            });
        }
    },
    async getSchedule(_req, res) {
        try {
            const currentRound = await lotteryClient_1.lottery.s_currentRound();
            const currentTime = Math.floor(Date.now() / 1000);
            const schedule = [];
            if (currentRound > 0n) {
                const rd = await (0, lotteryClient_1.getRound)(Number(currentRound));
                const now = BigInt(currentTime);
                if (rd.isActive &&
                    BigInt(rd.start) <= now &&
                    BigInt(rd.end) > now &&
                    !rd.isCompleted) {
                    schedule.push({
                        round: Number(currentRound),
                        type: "draw",
                        scheduledTime: Number(rd.end),
                        status: "scheduled",
                        totalEntries: Number(rd.totalEntries),
                    });
                }
            }
            res.json({
                success: true,
                data: {
                    schedule,
                    message: schedule.length === 0
                        ? "No scheduled draws. Rounds are created on first entry."
                        : undefined,
                },
            });
        }
        catch (error) {
            console.error("Error getting schedule:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get schedule",
            });
        }
    },
};
//# sourceMappingURL=automationController.js.map