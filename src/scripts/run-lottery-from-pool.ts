// src/scripts/run-lottery-from-pool.ts
import "dotenv/config";
import { ethers } from "ethers";
import {
  provider,
  lottery,
  ensureVrfReady,
  createInstantRound,
  drawAndWait,
} from "../lotteryClient";

// Gacha contract setup (same as frontend)
const GACHA_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";
const GACHA_ABI = [
  "function owned(address owner) view returns (uint256[])",
  "function ownerOf(uint256 tokenId) view returns (address)",
];

const gacha = new ethers.Contract(GACHA_ADDRESS, GACHA_ABI, provider);

interface ApiResponse {
  success: boolean;
  data: Array<{
    wallet_address: string;
    token_ids: string[];
  }>;
}

// Helper to extract the NFT ID from ERC-404 token ID
function getNftId(tokenId: string | bigint): number {
  const id = BigInt(tokenId);
  // Mask off the high bit to get the actual NFT ID
  const nftId = id & ((1n << 255n) - 1n);
  return Number(nftId);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

async function getOwnedIdsForWallet(
  gacha: ethers.Contract,
  wallet: string
): Promise<string[]> {
  try {
    const ids: bigint[] = await gacha.owned(wallet);
    return ids.map((b) => b.toString());
  } catch (e: any) {
    console.warn(
      `⚠️ GACHA.owned(${wallet}) reverted:`,
      e?.shortMessage || e?.message || e
    );
    return [];
  }
}

async function checkAutomationStatus() {
  console.log("🤖 Checking Chainlink Automation status...");

  try {
    const [enabled, nextAt, currentRound] = await Promise.all([
      lottery.s_automationEnabled(),
      lottery.s_nextAllowedPerformAt(),
      lottery.s_currentRound(),
    ]);

    const [upkeepNeeded, performData] = await lottery.checkUpkeep("0x");

    let reason = "";
    if (!upkeepNeeded && performData !== "0x") {
      try {
        reason = ethers.toUtf8String(performData);
      } catch {
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
  } catch (error) {
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
  console.log("🎲 Running lottery from on-chain Gacha data...");
  console.log("=====================================\n");

  // 0) Check automation status first
  const automationStatus = await checkAutomationStatus();

  if (automationStatus.enabled && automationStatus.upkeepNeeded) {
    console.log("🤖 Automation is enabled and upkeep is needed!");
    console.log(
      "💡 Consider letting Chainlink Automation handle this automatically."
    );
    console.log("   Or you can proceed manually...\n");
  }

  // 1) Get wallets from your API (but we'll ignore the token IDs)
  console.log(
    `📡 Fetching pool data from: ${
      process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`
    }/api/current-pool`
  );
  const response = await fetch(
    `${
      process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`
    }/api/current-pool`
  );
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  const data = (await response.json()) as ApiResponse;
  const wallets = data.data || [];
  console.log(`📊 Found ${wallets.length} wallets in pool\n`);

  // 2) Build entries from on-chain ERC-404 `owned()` calls (SAME as frontend)
  const entries: { tokenId: string; owner: string }[] = [];

  for (const wallet of wallets) {
    // Call Gacha contract directly like frontend does
    const ownedIds = await gacha.owned(wallet.wallet_address);

    if (ownedIds.length === 0) {
      console.log(`ℹ️ Wallet ${wallet.wallet_address} owns 0 tokens`);
      continue;
    }

    console.log(`🔍 Wallet ${wallet.wallet_address}:`);
    console.log(
      `   Owns NFTs: [${ownedIds
        .map((id: bigint) => `#${getNftId(id)}`)
        .join(", ")}]`
    );

    // Use the ERC-404 high-bit tokens directly (don't decode them!)
    // These are the actual NFT identifiers in ERC-404
    let validCount = 0;
    for (const id of ownedIds) {
      // Use the ERC-404 high-bit token ID directly
      const tokenId = id.toString();

      // Verify this token actually exists by checking if it has an owner
      try {
        const owner = await gacha.ownerOf(tokenId);
        if (owner !== "0x0000000000000000000000000000000000000000") {
          entries.push({ tokenId, owner: wallet.wallet_address });
          validCount++;
        } else {
          console.log(`   ⚠️ NFT #${getNftId(tokenId)} has no owner, skipping`);
        }
      } catch (error) {
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

  // 3) Ensure VRF is ready
  console.log("🔧 Checking VRF subscription...");
  await ensureVrfReady();
  console.log("");

  // 4) Create a fresh instant round
  const targetRound = await createInstantRound();
  console.log(`🔒 Target round: ${targetRound}\n`);

  // 5) Push entries into the round
  const tokenIds = entries.map((e) => BigInt(e.tokenId));
  const owners = entries.map((e) => e.owner);

  console.log("📝 Pushing entries to contract...");
  console.log("");

  // 6) Draw winner and wait for completion
  console.log("🎲 Drawing winner...");
  const result = await drawAndWait(targetRound, 5 * 60_000); // 5 min timeout

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
