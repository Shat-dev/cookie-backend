"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundCoordinator = exports.RoundCoordinator = void 0;
require("dotenv/config");
const connection_1 = __importDefault(require("../db/connection"));
const appStateRepository_1 = require("../db/appStateRepository");
const lotteryClient_1 = require("../lotteryClient");
const freezeCoordinator_1 = require("./freezeCoordinator");
const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
const FREEZE_SEC = Number(process.env.FREEZE_SEC || 180);
const FIRST_ROUND_KEY = "first_round_created";
function freezeFlagKey(round) {
    return `round_${round}_frozen`;
}
async function isFrozen(round) {
    return (await stateRepo.get(freezeFlagKey(round))) === "true";
}
class RoundCoordinator {
    constructor() {
        this.creatingRound = false;
    }
    async createRoundIfNeeded() {
        const currentRoundBN = await lotteryClient_1.lottery.s_currentRound();
        if (currentRoundBN > 0n) {
            try {
                const rd = await (0, lotteryClient_1.getRound)(Number(currentRoundBN));
                const now = Math.floor(Date.now() / 1000);
                if (rd.isActive &&
                    BigInt(rd.start) <= BigInt(now) &&
                    BigInt(rd.end) > BigInt(now) &&
                    !rd.isCompleted) {
                    console.log(`ℹ️ Round ${currentRoundBN} already active`);
                    return null;
                }
            }
            catch (e) {
                console.warn("⚠️ Could not read current round; proceeding to create a new one:", e);
            }
        }
        if (this.creatingRound) {
            console.log("⏳ Round creation already in progress");
            return null;
        }
        this.creatingRound = true;
        try {
            const { rows } = await connection_1.default.query("SELECT pg_try_advisory_lock($1)", [
                12345,
            ]);
            if (!rows?.[0]?.pg_try_advisory_lock) {
                console.log("🔒 Another process is creating a round; skipping");
                return null;
            }
            try {
                const currentAfter = await lotteryClient_1.lottery.s_currentRound();
                if (currentAfter > 0n) {
                    const rd = await (0, lotteryClient_1.getRound)(Number(currentAfter));
                    const now = Math.floor(Date.now() / 1000);
                    if (rd.isActive &&
                        BigInt(rd.start) <= BigInt(now) &&
                        BigInt(rd.end) > BigInt(now) &&
                        !rd.isCompleted) {
                        console.log(`ℹ️ Round ${currentAfter} became active while waiting for lock`);
                        return null;
                    }
                }
                const isFirstRound = (await stateRepo.get(FIRST_ROUND_KEY)) === null;
                const durationHours = 3;
                const durationSeconds = durationHours * 3600;
                const now = Math.floor(Date.now() / 1000);
                const startTs = now - 5;
                const endTs = startTs + durationSeconds;
                console.log(`🛠️ Creating ${isFirstRound ? "first" : "new"} round: ${durationHours}h window (${startTs}→${endTs})`);
                const tx = await lotteryClient_1.lottery.createRound(startTs, endTs);
                const receipt = await tx.wait(2);
                let createdRound;
                try {
                    for (const log of receipt.logs) {
                        try {
                            const parsed = lotteryClient_1.lottery.interface.parseLog(log);
                            if (parsed?.name === "RoundCreated") {
                                createdRound = Number(parsed.args.round);
                                break;
                            }
                        }
                        catch { }
                    }
                }
                catch { }
                if (!createdRound) {
                    const curr = await lotteryClient_1.lottery.s_currentRound();
                    if (curr > 0n)
                        createdRound = Number(curr);
                }
                if (!createdRound || createdRound === 0) {
                    throw new Error("Could not determine created round id");
                }
                if (isFirstRound) {
                    await stateRepo.set(FIRST_ROUND_KEY, "true");
                }
                console.log(`✅ Created round ${createdRound}`);
                return createdRound;
            }
            finally {
                await connection_1.default.query("SELECT pg_advisory_unlock($1)", [12345]);
            }
        }
        finally {
            this.creatingRound = false;
        }
    }
    async getFreezeTime(round) {
        const rd = await (0, lotteryClient_1.getRound)(round);
        return Number(rd.end) - FREEZE_SEC;
    }
    async freezeIfNeeded(round) {
        const rd = await (0, lotteryClient_1.getRound)(round);
        const now = Math.floor(Date.now() / 1000);
        const start = Number(rd.start);
        const end = Number(rd.end);
        const freezeAt = end - FREEZE_SEC;
        const alreadyFrozen = await isFrozen(round);
        if (!rd.isActive) {
            return {
                shouldFreeze: false,
                reason: "not-active",
                now,
                start,
                end,
                freezeAt,
                alreadyFrozen,
            };
        }
        if (rd.isCompleted) {
            return {
                shouldFreeze: false,
                reason: "completed",
                now,
                start,
                end,
                freezeAt,
                alreadyFrozen,
            };
        }
        if (alreadyFrozen) {
            return {
                shouldFreeze: false,
                reason: "already-frozen",
                now,
                start,
                end,
                freezeAt,
                alreadyFrozen,
            };
        }
        if (now < freezeAt) {
            return {
                shouldFreeze: false,
                reason: "before-freeze",
                now,
                start,
                end,
                freezeAt,
                alreadyFrozen,
            };
        }
        if (now >= end) {
            return {
                shouldFreeze: false,
                reason: "after-end",
                now,
                start,
                end,
                freezeAt,
                alreadyFrozen,
            };
        }
        return { shouldFreeze: true, now, start, end, freezeAt, alreadyFrozen };
    }
    async pushSnapshot(round, entries) {
        return freezeCoordinator_1.freezeCoordinator.pushSnapshot(round, entries);
    }
}
exports.RoundCoordinator = RoundCoordinator;
exports.roundCoordinator = new RoundCoordinator();
//# sourceMappingURL=roundCoordinator.js.map