"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const ethers_1 = require("ethers");
const lotteryClient_1 = require("../lotteryClient");
const COOKIE_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";
const COOKIE_ABI = [
    "function owned(address owner) view returns (uint256[])",
    "function ownerOf(uint256 tokenId) view returns (address)",
];
const cookie = new ethers_1.ethers.Contract(COOKIE_ADDRESS, COOKIE_ABI, lotteryClient_1.provider);
function getNftId(tokenId) {
    const id = BigInt(tokenId);
    const nftId = id & ((1n << 255n) - 1n);
    return Number(nftId);
}
function requireEnv(name) {
    const v = process.env[name];
    if (!v || !v.trim())
        throw new Error(`Missing required env: ${name}`);
    return v.trim();
}
async function getOwnedIdsForWallet(cookie, wallet) {
    try {
        const ids = await cookie.owned(wallet);
        return ids.map((b) => b.toString());
    }
    catch (e) {
        console.warn(`⚠️ COOKIE.owned(${wallet}) reverted:`, e?.shortMessage || e?.message || e);
        return [];
    }
}
async function checkAutomationStatus() {
    console.log("🤖 Checking Chainlink Automation status...");
    try {
        const [enabled, nextAt, currentRound] = await Promise.all([
            lotteryClient_1.lottery.s_automationEnabled(),
            lotteryClient_1.lottery.s_nextAllowedPerformAt(),
            lotteryClient_1.lottery.s_currentRound(),
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
        console.log("📊 AUTOMATION STATUS:");
        console.log(`   Enabled: ${enabled ? "YES" : "NO"}`);
        console.log(`   Current Round: ${Number(currentRound)}`);
        console.log(`   Upkeep Needed: ${upkeepNeeded ? "YES" : "NO"}`);
        if (!upkeepNeeded && reason) {
            console.log(`   Reason: ${reason}`);
        }
        if (timeUntilNext > 0) {
            const hours = Math.floor(timeUntilNext / 3600);
            const minutes = Math.floor((timeUntilNext % 3600) / 60);
            console.log(`   Time Until Next: ${hours}h ${minutes}m`);
        }
        console.log();
        return {
            enabled,
            upkeepNeeded,
            currentRound: Number(currentRound),
            reason,
        };
    }
    catch (error) {
        console.error("❌ Error checking automation:", error);
        return {
            enabled: false,
            upkeepNeeded: false,
            currentRound: 0,
            reason: "error",
        };
    }
}
async function main() {
    console.log("🎲 Running lottery from on-chain Cookie data...");
    console.log("=====================================\n");
    const automationStatus = await checkAutomationStatus();
    if (automationStatus.enabled && automationStatus.upkeepNeeded) {
        console.log("🤖 Automation is enabled and upkeep is needed!");
        console.log("💡 Consider letting Chainlink Automation handle this automatically.");
        console.log("   Or you can proceed manually...\n");
    }
    console.log(`📡 Fetching pool data from: ${process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`}/api/current-pool`);
    const response = await fetch(`${process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`}/api/current-pool`);
    if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
    }
    const data = (await response.json());
    const wallets = data.data || [];
    console.log(`📊 Found ${wallets.length} wallets in pool\n`);
    const entries = [];
    for (const wallet of wallets) {
        const ownedIds = await cookie.owned(wallet.wallet_address);
        if (ownedIds.length === 0) {
            console.log(`ℹ️ Wallet ${wallet.wallet_address} owns 0 tokens`);
            continue;
        }
        console.log(`🔍 Wallet ${wallet.wallet_address}:`);
        console.log(`   Owns NFTs: [${ownedIds
            .map((id) => `#${getNftId(id)}`)
            .join(", ")}]`);
        let validCount = 0;
        for (const id of ownedIds) {
            const tokenId = id.toString();
            try {
                const owner = await cookie.ownerOf(tokenId);
                if (owner !== "0x0000000000000000000000000000000000000000") {
                    entries.push({ tokenId, owner: wallet.wallet_address });
                    validCount++;
                }
                else {
                    console.log(`   ⚠️ NFT #${getNftId(tokenId)} has no owner, skipping`);
                }
            }
            catch (error) {
                console.log(`   ⚠️ NFT #${getNftId(tokenId)} doesn't exist, skipping`);
            }
        }
        console.log(`   ✅ Valid entries: ${validCount}/${ownedIds.length}\n`);
    }
    if (entries.length === 0) {
        throw new Error("No on-chain entries found");
    }
    console.log(`🎯 Total valid entries for lottery: ${entries.length}\n`);
    console.log("=====================================\n");
    console.log("🔧 Checking VRF subscription...");
    await (0, lotteryClient_1.ensureVrfReady)();
    console.log("");
    const targetRound = await (0, lotteryClient_1.createInstantRound)();
    console.log(`🔒 Target round: ${targetRound}\n`);
    const tokenIds = entries.map((e) => BigInt(e.tokenId));
    const owners = entries.map((e) => e.owner);
    console.log("📝 Pushing entries to contract...");
    console.log("");
    console.log("🎲 Drawing winner...");
    const result = await (0, lotteryClient_1.drawAndWait)(targetRound, 5 * 60000);
    console.log("\n=====================================");
    console.log("🏆 LOTTERY COMPLETE!");
    console.log("=====================================");
    console.log(`Winner Address: ${result.winner}`);
    console.log(`Winning NFT ID: #${getNftId(result.tokenId)}`);
    console.log(`Full Token ID: ${result.tokenId.toString()}`);
    console.log("=====================================\n");
}
main().catch((e) => {
    console.error("❌ Lottery run failed:", e);
    process.exit(1);
});
//# sourceMappingURL=run-lottery-from-pool.js.map