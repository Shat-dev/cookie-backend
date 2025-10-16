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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.freezeCoordinator = exports.FreezeCoordinator = void 0;
require("dotenv/config");
const connection_1 = __importDefault(require("../db/connection"));
const appStateRepository_1 = require("../db/appStateRepository");
const lotteryClient_1 = require("../lotteryClient");
const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
const SNAPSHOT_MAX_BATCH = Number(process.env.SNAPSHOT_MAX_BATCH || 1000);
function freezeFlagKey(round) {
    return `round_${round}_frozen`;
}
function snapshotTxKey(round) {
    return `round_${round}_snapshot_tx`;
}
const ID_PREFIX = 1n << 255n;
const isEncoded = (n) => n >= ID_PREFIX;
const encodeIfNeeded = (n) => (isEncoded(n) ? n : n | ID_PREFIX);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class FreezeCoordinator {
    constructor() {
        this.isPushing = false;
    }
    async validateContractConfiguration() {
        try {
            const [fundsAdmin, contractBalance] = await Promise.all([
                (0, lotteryClient_1.getFundsAdmin)(),
                (0, lotteryClient_1.getContractBalance)(),
            ]);
            console.log(`🔍 Contract Configuration Validation:`);
            console.log(`   Funds Admin: ${fundsAdmin}`);
            console.log(`   Contract Balance: ${contractBalance} ETH`);
            if (!fundsAdmin ||
                fundsAdmin === "0x0000000000000000000000000000000000000000") {
                console.warn(`⚠️ WARNING: Funds admin is not set or zero address`);
            }
            else {
                const isValidFundsAdmin = await (0, lotteryClient_1.isValidWinner)(fundsAdmin);
                if (!isValidFundsAdmin) {
                    console.warn(`⚠️ WARNING: Funds admin ${fundsAdmin} is not a valid EOA`);
                }
            }
            const balanceNum = parseFloat(contractBalance);
            if (!Number.isFinite(balanceNum) || balanceNum < 0.01) {
                console.warn(`⚠️ WARNING: Low contract balance (${contractBalance} ETH)`);
            }
            console.log(`✅ Contract configuration validation completed`);
        }
        catch (error) {
            console.error(`❌ Failed to validate contract configuration: ${error?.message || error}`);
        }
    }
    async monitorContractEvents(startBlock) {
        try {
            const currentBlock = await lotteryClient_1.lottery.runner?.provider?.getBlockNumber();
            if (!currentBlock || !lotteryClient_1.lottery.runner?.provider)
                return;
            const events = await Promise.all([
                lotteryClient_1.lottery.filters?.FundsAdminChanged
                    ? lotteryClient_1.lottery.queryFilter(lotteryClient_1.lottery.filters.FundsAdminChanged(), startBlock, currentBlock)
                    : [],
                lotteryClient_1.lottery.filters?.OwnershipTransferred
                    ? lotteryClient_1.lottery.queryFilter(lotteryClient_1.lottery.filters.OwnershipTransferred(), startBlock, currentBlock)
                    : [],
            ]);
            const allEvents = events.flat();
            if (allEvents.length === 0)
                return;
            console.log(`🔄 Contract configuration changes detected:`);
            for (const event of allEvents) {
                const name = event.eventName || event.fragment?.name;
                if (name === "FundsAdminChanged") {
                    const [oldAdmin, newAdmin] = event.args || [];
                    console.log(`🔐 Funds Admin Changed: ${oldAdmin} → ${newAdmin} (Block ${event.blockNumber})`);
                }
                else if (name === "OwnershipTransferred") {
                    const [from, to] = event.args || [];
                    console.log(`👑 Ownership Transferred: ${from} → ${to} (Block ${event.blockNumber})`);
                }
            }
            await this.validateContractConfiguration();
        }
        catch (error) {
            console.warn(`⚠️ Could not monitor contract events: ${error?.message || error}`);
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
        if (entries.length > SNAPSHOT_MAX_BATCH) {
            throw new Error(`Too many entries (${entries.length}). Max per push is ${SNAPSHOT_MAX_BATCH}. Split into batches.`);
        }
        if (!lotteryClient_1.lottery.runner?.provider) {
            throw new Error("No provider available — aborting snapshot push");
        }
        this.isPushing = true;
        let startBlock;
        try {
            await this.validateContractConfiguration();
            startBlock = await lotteryClient_1.lottery.runner.provider.getBlockNumber();
            console.log(`🔍 Checking Round ${roundNumber} for existing entries...`);
            try {
                const rd = await lotteryClient_1.lottery.getRound(roundNumber);
                if (rd.totalEntries && Number(rd.totalEntries) > 0) {
                    console.log(`🛑 Round ${roundNumber} already has ${rd.totalEntries} entries`);
                    const placeholderTx = "EXISTING_ENTRIES_" + Date.now();
                    await Promise.all([
                        stateRepo.set(snapshotTxKey(roundNumber), placeholderTx),
                        stateRepo.set(freezeFlagKey(roundNumber), "true"),
                    ]);
                    return placeholderTx;
                }
            }
            catch {
                console.log(`⚠️ Could not verify round state; continuing anyway`);
            }
            let cookieContract = null;
            try {
                const { getCookieContract } = await Promise.resolve().then(() => __importStar(require("../utils/ownershipUtils")));
                cookieContract = getCookieContract();
            }
            catch {
                console.warn("⚠️ Could not initialize cookie contract...");
            }
            const owners = [];
            const tokenIds = [];
            let invalidCount = 0;
            for (const e of entries) {
                if (!/^0x[a-fA-F0-9]{40}$/.test(e.wallet_address)) {
                    console.warn(`⚠️ Skipping invalid wallet address: ${e.wallet_address}`);
                    invalidCount++;
                    continue;
                }
                if (!/^\d+$/.test(e.token_id)) {
                    console.warn(`⚠️ Skipping invalid token id: ${e.token_id}`);
                    invalidCount++;
                    continue;
                }
                const wallet = e.wallet_address.toLowerCase();
                const encoded = encodeIfNeeded(BigInt(e.token_id));
                if (cookieContract) {
                    try {
                        const actualOwner = (await cookieContract.ownerOf(encoded)).toLowerCase();
                        if (actualOwner !== wallet) {
                            console.warn(`⚠️ Token #${e.token_id} owner mismatch: chain=${actualOwner} provided=${wallet}`);
                        }
                    }
                    catch (ownErr) {
                        console.warn(`⚠️ Could not verify ownerOf(${encoded.toString()}): ${ownErr}`);
                    }
                }
                owners.push(wallet);
                tokenIds.push(encoded);
            }
            if (owners.length === 0) {
                console.warn("⚠️ No valid entries after validation. Abort.");
                return null;
            }
            if (invalidCount > 0) {
                console.warn(`⚠️ ${invalidCount} invalid entries skipped`);
            }
            console.log(`➡️ Pushing snapshot: ${owners.length} entries`);
            const tx = await lotteryClient_1.lottery.addEntriesWithOwners(roundNumber, tokenIds, owners);
            console.log(`⏳ Awaiting tx confirmation: ${tx.hash}`);
            const receipt = await tx.wait(2);
            if (startBlock !== undefined)
                await this.monitorContractEvents(startBlock);
            const expectedCount = owners.length;
            let ok = false;
            for (let i = 0; i < 5; i++) {
                try {
                    const rd = await lotteryClient_1.lottery.getRound(roundNumber);
                    const actual = Number(rd.totalEntries || 0);
                    if (actual === expectedCount) {
                        ok = true;
                        break;
                    }
                }
                catch { }
                await sleep(1500);
            }
            if (!ok) {
                console.error("🚨 Post-push verification did not observe expected entry count. Proceeding anyway.");
            }
            try {
                await Promise.all([
                    stateRepo.set(snapshotTxKey(roundNumber), receipt.hash),
                    stateRepo.set(freezeFlagKey(roundNumber), "true"),
                ]);
            }
            catch (dbErr) {
                console.error("⚠️ Failed to persist snapshot state:", dbErr);
            }
            console.log(`✅ Snapshot pushed (round ${roundNumber}) tx=${receipt.hash}`);
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
    async getFundsAdminInfo() {
        try {
            const fundsAdmin = await (0, lotteryClient_1.getFundsAdmin)();
            const isValidEOA = await (0, lotteryClient_1.isValidWinner)(fundsAdmin);
            return { fundsAdmin, isValidEOA };
        }
        catch (error) {
            console.error(`❌ Failed to get funds admin info: ${error?.message || error}`);
            throw error;
        }
    }
}
exports.FreezeCoordinator = FreezeCoordinator;
exports.freezeCoordinator = new FreezeCoordinator();
//# sourceMappingURL=freezeCoordinator.js.map