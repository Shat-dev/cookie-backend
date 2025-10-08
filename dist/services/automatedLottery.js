"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.automatedLotteryService = exports.AutomatedLotteryService = void 0;
require("dotenv/config");
const connection_1 = __importDefault(require("../db/connection"));
const appStateRepository_1 = require("../db/appStateRepository");
const lotteryClient_1 = require("../lotteryClient");
const entryRepository_1 = require("../db/entryRepository");
const twitterPoller_1 = require("./twitterPoller");
const validateEntries_1 = require("./validateEntries");
const freezeCoordinator_1 = require("./freezeCoordinator");
const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
const FREEZE_SEC = Number(process.env.FREEZE_SEC || 180);
const SAFETY_SEC = Number(process.env.FREEZE_SAFETY_SEC || 15);
function freezeFlagKey(round) {
    return `round_${round}_frozen`;
}
function snapshotTxKey(round) {
    return `round_${round}_snapshot_tx`;
}
async function isFrozen(round) {
    return (await stateRepo.get(freezeFlagKey(round))) === "true";
}
async function markFrozen(round) {
    await stateRepo.set(freezeFlagKey(round), "true");
}
async function setSnapshotTx(round, tx) {
    await stateRepo.set(snapshotTxKey(round), tx);
}
async function getSnapshotTx(round) {
    return (await stateRepo.get(snapshotTxKey(round))) || null;
}
class AutomatedLotteryService {
    constructor() {
        this.isRunning = false;
        this.isTicking = false;
        this.timer = null;
        this.checkInterval = Number(process.env.AUTOMATION_CHECK_MS) || 10000;
        this.lastRemainingMinutes = null;
    }
    start() {
        if (this.isRunning) {
            console.log("🤖 Automated lottery service already running");
            return;
        }
        this.isRunning = true;
        console.log(`🚀 Starting automated lottery orchestrator (interval=${this.checkInterval}ms, FREEZE_SEC=${FREEZE_SEC})`);
        void (async () => {
            try {
                const currentRoundBN = await lotteryClient_1.lottery.s_currentRound();
                if (currentRoundBN > 0n) {
                    const currentRound = Number(currentRoundBN);
                    const rd = await (0, lotteryClient_1.getRound)(currentRound);
                    const now = Math.floor(Date.now() / 1000);
                    const end = Number(rd.end);
                    if (now >= end && rd.isActive) {
                        const snap = await getSnapshotTx(currentRound);
                        if (!snap) {
                            console.log(`🧹 Startup: round ${currentRound} ended without snapshot. Recovery will attempt on first tick.`);
                        }
                    }
                }
            }
            catch (e) {
                console.warn("⚠️ Startup probe skipped:", e?.shortMessage || e?.message || String(e));
            }
        })();
        void this.tick();
        this.timer = setInterval(() => void this.tick(), this.checkInterval);
    }
    stop() {
        if (!this.isRunning)
            return;
        this.isRunning = false;
        if (this.timer)
            clearInterval(this.timer);
        this.timer = null;
        this.lastRemainingMinutes = null;
        console.log("⏹️ Stopped automated lottery orchestrator");
    }
    async tick() {
        if (!this.isRunning || this.isTicking)
            return;
        this.isTicking = true;
        try {
            const currentRoundBN = await lotteryClient_1.lottery.s_currentRound();
            if (currentRoundBN === 0n) {
                console.log("⏸ No round yet — waiting for first valid entry.");
                return;
            }
            const currentRound = Number(currentRoundBN);
            const rd = await (0, lotteryClient_1.getRound)(currentRound);
            const now = Math.floor(Date.now() / 1000);
            const end = Number(rd.end);
            const start = Number(rd.start);
            if (!rd.isActive && !rd.isCompleted) {
                console.log(`⚪ Round ${currentRound} exists but is not active yet.`);
                return;
            }
            if (rd.isActive && now < end) {
                const remaining = end - now;
                const mins = Math.floor(remaining / 60);
                if (this.lastRemainingMinutes !== mins) {
                    console.log(`⏳ Round ${currentRound} active — ${mins}m ${remaining % 60}s left (window ${start}→${end})`);
                    this.lastRemainingMinutes = mins;
                }
            }
            else {
                this.lastRemainingMinutes = null;
            }
            if (rd.isActive && now >= end - FREEZE_SEC && now + SAFETY_SEC < end) {
                const alreadyFrozen = await isFrozen(currentRound);
                if (!alreadyFrozen) {
                    console.log(`🧊 Entering freeze for round ${currentRound} (final 3 min window before VRF)`);
                    await this.performFreeze(currentRound);
                    console.log(`📡 Freeze complete for round ${currentRound}. Awaiting VRF…`);
                }
                return;
            }
            if (now >= end && rd.isActive) {
                const hasEntriesField = rd?.entriesCount !== undefined &&
                    rd?.entriesCount !== null;
                const entriesCount = hasEntriesField
                    ? Number(rd.entriesCount)
                    : null;
                let snapTx = await getSnapshotTx(currentRound);
                if (!snapTx) {
                    await this.recoverSnapshotAfterEnd(currentRound);
                    snapTx = await getSnapshotTx(currentRound);
                }
                if (!snapTx) {
                    if (entriesCount !== null && entriesCount === 0) {
                        console.log(`🪶 Round ${currentRound} ended with zero entries. No snapshot. Automation will not run.`);
                    }
                    else {
                        console.log(`🪶 Round ${currentRound} ended without snapshot on-chain. Automation cannot run. Waiting or creating next round if pool persists.`);
                    }
                    return;
                }
                if (entriesCount !== null && entriesCount === 0) {
                    console.log(`🪶 Round ${currentRound} snapshot present but entriesCount=0. Nothing for VRF.`);
                    return;
                }
                console.log(`🎲 Round ${currentRound} ended — snapshot present — Chainlink Automation should now perform VRF.`);
                return;
            }
            if (rd.isCompleted) {
                console.log(`🏆 Round ${currentRound} is completed! VRF fulfilled.`);
                try {
                    const r = await lotteryClient_1.lottery["getRound(uint256)"](currentRound);
                    let winner = r.winner ?? r[4];
                    let tokenId = (r.winningTokenId ??
                        r[5]);
                    if ((!winner || tokenId === undefined) &&
                        lotteryClient_1.lottery.filters?.RoundCompleted) {
                        const evs = await lotteryClient_1.lottery.queryFilter(lotteryClient_1.lottery.filters.RoundCompleted(currentRound), -5000);
                        const last = evs.at(-1);
                        const ew = last?.args?.winner ?? last?.args?.[1];
                        const et = (last?.args?.winningTokenId ?? last?.args?.[2]);
                        if (ew)
                            winner = ew;
                        if (et !== undefined)
                            tokenId = et;
                    }
                    const ZERO = "0x0000000000000000000000000000000000000000";
                    const SUPPLY = BigInt(process.env.NFT_SUPPLY || 10000);
                    let displayId = tokenId;
                    if (displayId !== undefined &&
                        (displayId > SUPPLY || displayId <= 0n)) {
                        displayId = (displayId % SUPPLY) + 1n;
                    }
                    if (winner && winner !== ZERO && displayId !== undefined) {
                        console.log(`🥇 Winner: ${winner}, Token #${displayId.toString()}`);
                    }
                    else {
                        console.log("ℹ️ Winner info not exposed by this ABI.");
                    }
                }
                catch (err) {
                    console.warn("⚠️ Could not fetch winner from contract:", err?.message || err);
                }
                await (0, validateEntries_1.validateEntries)(false);
                const remainingPool = await entryRepository_1.entryRepository.getAllEntries();
                if (remainingPool.length > 0) {
                    console.log(`🔄 Pool still has ${remainingPool.length} entry rows; creating next 3h round (pool-based)`);
                    try {
                        const nowTs = Math.floor(Date.now() / 1000);
                        const startTs = nowTs - 5;
                        const endTs = startTs + 10800;
                        const tx = await lotteryClient_1.lottery.createRound(startTs, endTs);
                        const receipt = await tx.wait(2);
                        console.log(`✅ Next round created (3h). tx=${receipt.hash}, window ${startTs}→${endTs}`);
                    }
                    catch (e) {
                        console.error("❌ Failed to create next round:", e?.message || e);
                    }
                }
                return;
            }
        }
        catch (e) {
            const msg = e?.shortMessage || e?.message || String(e);
            console.error("❌ Orchestrator tick failed:", msg);
        }
        finally {
            this.isTicking = false;
        }
    }
    async performFreeze(roundNumber) {
        const rd = await (0, lotteryClient_1.getRound)(roundNumber);
        const now = Math.floor(Date.now() / 1000);
        const end = Number(rd.end);
        if (!(now + SAFETY_SEC < end)) {
            console.warn(`⚠️ Skip freeze: too close to end (now=${now}, end=${end}, SAFETY_SEC=${SAFETY_SEC})`);
            await markFrozen(roundNumber);
            return;
        }
        console.log("🛰️ Final pollMentions() before snapshot…");
        await (0, twitterPoller_1.pollMentions)();
        console.log("🔍 Final validateEntries(true) before snapshot…");
        await (0, validateEntries_1.validateEntries)(true);
        const rows = await entryRepository_1.entryRepository.getAllEntries();
        if (rows.length === 0) {
            console.log(`🪶 Empty snapshot for round ${roundNumber} — skipping on-chain push`);
            await markFrozen(roundNumber);
            return;
        }
        rows.sort((a, b) => {
            const wa = a.wallet_address.toLowerCase();
            const wb = b.wallet_address.toLowerCase();
            if (wa < wb)
                return -1;
            if (wa > wb)
                return 1;
            try {
                const ta = BigInt(a.token_id);
                const tb = BigInt(b.token_id);
                if (ta < tb)
                    return -1;
                if (ta > tb)
                    return 1;
                return 0;
            }
            catch {
                if (a.token_id < b.token_id)
                    return -1;
                if (a.token_id > b.token_id)
                    return 1;
                return 0;
            }
        });
        const dedup = new Map();
        for (const r of rows) {
            const key = `${r.wallet_address.toLowerCase()}-${r.token_id}`;
            if (!dedup.has(key))
                dedup.set(key, r);
        }
        const snapshot = Array.from(dedup.values());
        console.log(`📦 Snapshot for round ${roundNumber}: ${snapshot.length} unique pairs`);
        try {
            const payload = snapshot.map((r) => ({
                wallet_address: r.wallet_address.toLowerCase(),
                token_id: r.token_id,
            }));
            const txHash = await freezeCoordinator_1.freezeCoordinator.pushSnapshot(roundNumber, payload);
            if (txHash) {
                await setSnapshotTx(roundNumber, txHash);
                console.log(`✅ Snapshot pushed: ${txHash}`);
            }
            else {
                console.log("ℹ️ No tx emitted (empty input?).");
            }
            await markFrozen(roundNumber);
        }
        catch (err) {
            const msg = err?.shortMessage || err?.message || String(err);
            console.error("❌ Freeze push failed:", msg);
        }
    }
    async recoverSnapshotAfterEnd(roundNumber) {
        const existing = await getSnapshotTx(roundNumber);
        if (existing)
            return;
        console.log(`🧯 Recovery: round ${roundNumber} ended with no snapshot. Building and pushing now…`);
        try {
            try {
                await (0, twitterPoller_1.pollMentions)();
            }
            catch { }
            try {
                await (0, validateEntries_1.validateEntries)(true);
            }
            catch { }
            const rows = await entryRepository_1.entryRepository.getAllEntries();
            if (rows.length === 0) {
                console.log(`🪶 Recovery found empty pool for round ${roundNumber}. Cannot proceed.`);
                return;
            }
            rows.sort((a, b) => {
                const wa = a.wallet_address.toLowerCase();
                const wb = b.wallet_address.toLowerCase();
                if (wa < wb)
                    return -1;
                if (wa > wb)
                    return 1;
                try {
                    const ta = BigInt(a.token_id);
                    const tb = BigInt(b.token_id);
                    if (ta < tb)
                        return -1;
                    if (ta > tb)
                        return 1;
                    return 0;
                }
                catch {
                    if (a.token_id < b.token_id)
                        return -1;
                    if (a.token_id > b.token_id)
                        return 1;
                    return 0;
                }
            });
            const seen = new Map();
            for (const r of rows) {
                const key = `${r.wallet_address.toLowerCase()}-${r.token_id}`;
                if (!seen.has(key))
                    seen.set(key, r);
            }
            const payload = Array.from(seen.values()).map((r) => ({
                wallet_address: r.wallet_address.toLowerCase(),
                token_id: r.token_id,
            }));
            console.log(`📦 Recovery snapshot for round ${roundNumber}: ${payload.length} unique pairs`);
            const txHash = await freezeCoordinator_1.freezeCoordinator.pushSnapshot(roundNumber, payload);
            if (txHash) {
                await setSnapshotTx(roundNumber, txHash);
                console.log(`✅ Recovery snapshot pushed: ${txHash}`);
            }
            else {
                console.log("ℹ️ Recovery: coordinator returned no tx.");
            }
            await markFrozen(roundNumber);
        }
        catch (err) {
            const msg = err?.shortMessage || err?.message || String(err);
            console.error(`❌ Recovery snapshot failed: ${msg}`);
        }
    }
}
exports.AutomatedLotteryService = AutomatedLotteryService;
exports.automatedLotteryService = new AutomatedLotteryService();
//# sourceMappingURL=automatedLottery.js.map