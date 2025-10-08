"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.freezeCoordinator = exports.FreezeCoordinator = void 0;
require("dotenv/config");
const connection_1 = __importDefault(require("../db/connection"));
const appStateRepository_1 = require("../db/appStateRepository");
const lotteryClient_1 = require("../lotteryClient");
const validateEntries_1 = require("./validateEntries");
const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
function freezeFlagKey(round) {
    return `round_${round}_frozen`;
}
function snapshotTxKey(round) {
    return `round_${round}_snapshot_tx`;
}
const ID_PREFIX = 1n << 255n;
const isEncoded = (n) => n >= ID_PREFIX;
const encodeIfNeeded = (n) => (isEncoded(n) ? n : n | ID_PREFIX);
class FreezeCoordinator {
    constructor() {
        this.isPushing = false;
    }
    async performFinalValidation() {
        console.log("🔍 Starting final validation before freeze...");
        try {
            await (0, validateEntries_1.validateEntries)(true);
            console.log("✅ Final validation completed successfully");
        }
        catch (error) {
            console.error("❌ Final validation failed:", error?.message || error);
            throw new Error(`Final validation failed: ${error?.message || error}`);
        }
    }
    async pushSnapshot(roundNumber, entries) {
        if (this.isPushing) {
            console.log("⏳ Snapshot push already in progress");
            return null;
        }
        if (!entries?.length) {
            console.log("🪶 Empty snapshot; nothing to push");
            return null;
        }
        this.isPushing = true;
        try {
            const owners = new Array(entries.length);
            const tokenIds = new Array(entries.length);
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                owners[i] = e.wallet_address.toLowerCase();
                const raw = BigInt(e.token_id);
                tokenIds[i] = encodeIfNeeded(raw);
            }
            console.log(`➡️  Pushing snapshot: round=${roundNumber}, entries=${entries.length}`);
            const tx = await lotteryClient_1.lottery.addEntriesWithOwners(roundNumber, tokenIds, owners);
            const receipt = await tx.wait(2);
            await stateRepo.set(snapshotTxKey(roundNumber), receipt.hash);
            await stateRepo.set(freezeFlagKey(roundNumber), "true");
            console.log(`✅ Snapshot pushed for round ${roundNumber}, tx=${receipt.hash}`);
            return receipt.hash;
        }
        catch (err) {
            console.error("❌ Snapshot push failed:", err?.shortMessage || err?.reason || err?.message || err);
            throw err;
        }
        finally {
            this.isPushing = false;
        }
    }
    async freezeRound(roundNumber, entries) {
        console.log(`🧊 Starting freeze process for round ${roundNumber}...`);
        try {
            await this.performFinalValidation();
            const txHash = await this.pushSnapshot(roundNumber, entries);
            console.log(`🎉 Round ${roundNumber} frozen successfully!`);
            return txHash;
        }
        catch (error) {
            console.error(`💥 Freeze process failed for round ${roundNumber}:`, error?.message || error);
            throw error;
        }
    }
}
exports.FreezeCoordinator = FreezeCoordinator;
exports.freezeCoordinator = new FreezeCoordinator();
//# sourceMappingURL=freezeCoordinator.js.map