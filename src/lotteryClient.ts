import "dotenv/config";
import { ethers } from "ethers";
import lotteryAbi from "./constants/LotteryVrfV25ABI.json";
import lotteryAddr from "./constants/LotteryVrfV25Address.json";
import { robustRpcProvider } from "./utils/rpcProvider";
import { rpcCache } from "./utils/rpcCache";

/** Require an env var with a friendly error */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

/** Get an env var with a default value */
function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/* ---------- ENV ---------- */
// Make RPC optional since we're using robustRpcProvider
const RPC = process.env.BASE_MAINNET_RPC_URL;
const PK = getEnv("PRIVATE_KEY", ""); // Make private key optional for read-only operations

// Use address from JSON file
const LOTTERY: string = lotteryAddr.LotteryVrfV25;

if (!ethers.isAddress(LOTTERY)) {
  throw new Error(`Invalid lottery address: ${LOTTERY}`);
}

// 🛡️ SAFETY CHECK: Warn about environment variable conflicts
const ENV_LOTTERY_ADDRESS = process.env.LOTTERY_ADDRESS;
if (ENV_LOTTERY_ADDRESS && ENV_LOTTERY_ADDRESS !== LOTTERY) {
  console.warn(
    "🚨 ==================== CONTRACT ADDRESS MISMATCH WARNING ===================="
  );
  console.warn(
    "🚨 LOTTERY_ADDRESS environment variable differs from JSON configuration!"
  );
  console.warn(`🚨 Environment variable: ${ENV_LOTTERY_ADDRESS}`);
  console.warn(`🚨 JSON configuration:   ${LOTTERY}`);
  console.warn(
    "🚨 Using JSON configuration. Update environment variables if needed."
  );
  console.warn(
    "🚨 ========================================================================"
  );
}

// 🛡️ NEW: Contract deployment freshness check
const CONTRACT_DEPLOYMENT_TIME = lotteryAddr.deployedAt;
if (CONTRACT_DEPLOYMENT_TIME) {
  const deployedAt = new Date(CONTRACT_DEPLOYMENT_TIME);
  const processStartTime = new Date(); // Approximate process start time
  const timeSinceDeployment = processStartTime.getTime() - deployedAt.getTime();

  // If contract was deployed less than 10 minutes ago, warn about potential cache issues
  if (timeSinceDeployment < 10 * 60 * 1000) {
    console.warn(
      "⚠️ ===================== CONTRACT FRESHNESS WARNING ====================="
    );
    console.warn(
      `⚠️ Contract was deployed recently: ${deployedAt.toISOString()}`
    );
    console.warn(
      "⚠️ If you're seeing unexpected behavior, restart this process to clear caches."
    );
    console.warn(
      "⚠️ =================================================================="
    );
  }
}

// 🛡️ NEW: Runtime contract address validation
async function validateContractAddress(): Promise<void> {
  try {
    // Add a small delay to ensure everything is initialized
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check if lottery instance exists
    if (!lottery) {
      throw new Error("Lottery contract instance is not initialized");
    }

    // Check if s_currentRound method exists
    if (typeof lottery.s_currentRound !== "function") {
      throw new Error(
        "Contract does not have s_currentRound method - ABI mismatch?"
      );
    }

    // Try to call a simple method to verify the contract exists and is responsive
    const currentRound = await lottery.s_currentRound();
    console.log(
      `✅ Contract validation successful: ${LOTTERY} (currentRound: ${currentRound})`
    );
  } catch (error: any) {
    console.error(
      "🚨 =================== CONTRACT VALIDATION FAILED ==================="
    );
    console.error(`🚨 Cannot connect to contract at: ${LOTTERY}`);
    console.error(`🚨 Error: ${error?.message || error}`);
    console.error(
      "🚨 This might indicate a wrong contract address or network issue."
    );
    console.error(
      "🚨 ================================================================="
    );
    throw new Error(`Contract validation failed: ${error?.message || error}`);
  }
}

// Log the contract address being used for transparency
console.log(`🎯 Lottery Contract: ${LOTTERY}`);
if (ENV_LOTTERY_ADDRESS) {
  console.log(
    `ℹ️ LOTTERY_ADDRESS env var: ${ENV_LOTTERY_ADDRESS} ${
      ENV_LOTTERY_ADDRESS === LOTTERY ? "✅" : "❌"
    }`
  );
}

// Make VRF-related env vars optional for read-only operations
const SUB_ID_STR = getEnv("SUB_ID", "");
const VRF_COORDINATOR = getEnv("VRF_COORDINATOR", "");
const LINK_TOKEN = getEnv("LINK_TOKEN", "");
const VRF_NATIVE = (process.env.VRF_NATIVE || "false").toLowerCase() === "true";

/* ---------- Provider / Signer ---------- */
export const provider = robustRpcProvider.getProvider();

// Only create signer if private key is provided
export const signer = PK ? new ethers.Wallet(PK, provider) : null;

/* ---------- Contracts ---------- */
// Create lottery contract with provider (read-only) if no signer
export const lottery = signer
  ? new ethers.Contract(LOTTERY, lotteryAbi as any, signer)
  : new ethers.Contract(LOTTERY, lotteryAbi as any, provider);

/* ---------- Helpers ---------- */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseCustomError(err: any) {
  const data = err?.data ?? err?.info?.error?.data;
  if (!data) return null;
  try {
    const parsed = (lottery.interface as any).parseError(data);
    return { name: parsed?.name as string, args: parsed?.args as any[] };
  } catch {
    return null;
  }
}

/* ---------- Transaction Builders ---------- */

/**
 * Set the funds admin address (only current funds admin can call)
 */
export async function setFundsAdmin(newFundsAdmin: string): Promise<string> {
  if (!signer) {
    throw new Error("Signer required to set funds admin");
  }

  if (!ethers.isAddress(newFundsAdmin)) {
    throw new Error("Invalid funds admin address");
  }

  try {
    const tx = await lottery.setFundsAdmin(newFundsAdmin);
    const receipt = await tx.wait(2);
    console.log(`✅ Funds admin set to ${newFundsAdmin}. Tx: ${receipt.hash}`);
    return receipt.hash;
  } catch (err: any) {
    const parsed = parseCustomError(err);
    if (parsed) {
      throw new Error(
        `setFundsAdmin reverted with custom error ${
          parsed.name
        } ${JSON.stringify(parsed.args ?? [])}`
      );
    }
    throw err;
  }
}

/**
 * Set the draw interval for automation (only owner can call)
 */
export async function setDrawInterval(
  newIntervalSeconds: number
): Promise<string> {
  if (!signer) {
    throw new Error("Signer required to set draw interval");
  }

  if (newIntervalSeconds < 3600) {
    // 1 hour minimum
    throw new Error("Draw interval must be at least 1 hour (3600 seconds)");
  }

  if (newIntervalSeconds > 86400) {
    // 24 hours maximum
    throw new Error("Draw interval must not exceed 24 hours (86400 seconds)");
  }

  try {
    const tx = await lottery.setDrawInterval(newIntervalSeconds);
    const receipt = await tx.wait(2);
    console.log(
      `✅ Draw interval set to ${newIntervalSeconds} seconds. Tx: ${receipt.hash}`
    );
    return receipt.hash;
  } catch (err: any) {
    const parsed = parseCustomError(err);
    if (parsed) {
      throw new Error(
        `setDrawInterval reverted with custom error ${
          parsed.name
        } ${JSON.stringify(parsed.args ?? [])}`
      );
    }
    throw err;
  }
}

/**
 * Admin withdraw all ETH from contract (only funds admin can call)
 */
export async function adminWithdrawAllETH(): Promise<string> {
  if (!signer) {
    throw new Error("Signer required to withdraw ETH");
  }

  try {
    const contractAddress = await lottery.getAddress();
    const balanceBefore = await provider.getBalance(contractAddress);
    console.log(
      `💰 Contract balance before withdrawal: ${ethers.formatEther(
        balanceBefore
      )} ETH`
    );

    const tx = await lottery.adminWithdrawAllETH();
    const receipt = await tx.wait(2);

    if (!receipt) {
      throw new Error("Transaction receipt is null");
    }

    const balanceAfter = await provider.getBalance(contractAddress);
    console.log(`✅ ETH withdrawn successfully. Tx: ${receipt.hash}`);
    console.log(
      `💰 Contract balance after withdrawal: ${ethers.formatEther(
        balanceAfter
      )} ETH`
    );

    return receipt.hash;
  } catch (err: any) {
    const parsed = parseCustomError(err);
    if (parsed) {
      throw new Error(
        `adminWithdrawAllETH reverted with custom error ${
          parsed.name
        } ${JSON.stringify(parsed.args ?? [])}`
      );
    }
    throw err;
  }
}

/**
 * Send ETH to the lottery contract for prize pools
 */
export async function fundPrizePool(amountEth: string): Promise<string> {
  if (!signer) {
    throw new Error("Signer required to fund prize pool");
  }

  try {
    const amount = ethers.parseEther(amountEth);
    const contractAddress = await lottery.getAddress();
    const balanceBefore = await provider.getBalance(contractAddress);

    const tx = await signer.sendTransaction({
      to: contractAddress,
      value: amount,
    });

    const receipt = await tx.wait(2);

    if (!receipt) {
      throw new Error("Transaction receipt is null");
    }

    const balanceAfter = await provider.getBalance(contractAddress);
    console.log(
      `✅ Prize pool funded with ${amountEth} ETH. Tx: ${receipt.hash}`
    );
    console.log(
      `💰 Contract balance: ${ethers.formatEther(
        balanceBefore
      )} → ${ethers.formatEther(balanceAfter)} ETH`
    );

    return receipt.hash;
  } catch (err: any) {
    console.error("❌ Failed to fund prize pool:", err);
    throw err;
  }
}

/* ---------- View Functions ---------- */

/**
 * Get the current funds admin address
 */
export async function getFundsAdmin(): Promise<string> {
  try {
    return await robustRpcProvider.call(async (provider) => {
      const lotteryWithProvider = new ethers.Contract(
        LOTTERY,
        lotteryAbi as any,
        provider
      );
      return await lotteryWithProvider.getFundsAdmin();
    });
  } catch (e) {
    console.warn("Failed to get funds admin:", e);
    throw new Error("Could not retrieve funds admin address");
  }
}

/**
 * Get the current contract owner address
 */
export async function getContractOwner(): Promise<string> {
  try {
    return await robustRpcProvider.call(async (provider) => {
      const lotteryWithProvider = new ethers.Contract(
        LOTTERY,
        lotteryAbi as any,
        provider
      );
      return await lotteryWithProvider.owner();
    });
  } catch (e) {
    console.warn("Failed to get contract owner:", e);
    throw new Error("Could not retrieve contract owner address");
  }
}

/**
 * Get the current draw interval in seconds
 */
export async function getDrawInterval(): Promise<number> {
  try {
    return await robustRpcProvider.call(async (provider) => {
      const lotteryWithProvider = new ethers.Contract(
        LOTTERY,
        lotteryAbi as any,
        provider
      );
      const interval = await lotteryWithProvider.s_automationInterval();
      return Number(interval);
    });
  } catch (e) {
    console.warn("Failed to get draw interval:", e);
    throw new Error("Could not retrieve draw interval");
  }
}

/**
 * Get the contract's current ETH balance
 */
export async function getContractBalance(): Promise<string> {
  try {
    const contractAddress = await lottery.getAddress();
    const balance = await provider.getBalance(contractAddress);
    return ethers.formatEther(balance);
  } catch (e) {
    console.warn("Failed to get contract balance:", e);
    throw new Error("Could not retrieve contract balance");
  }
}

/**
 * Validate that an address is an EOA (Externally Owned Account) and not a contract
 */
export async function isValidWinner(address: string): Promise<boolean> {
  if (!ethers.isAddress(address)) {
    return false;
  }

  if (address === ethers.ZeroAddress) {
    return false;
  }

  try {
    // Check if the address has contract code
    const code = await provider.getCode(address);
    return code === "0x"; // EOA accounts have no code
  } catch (e) {
    console.warn(`Failed to check if ${address} is EOA:`, e);
    return false;
  }
}

export async function createInstantRound(windowSeconds = 0): Promise<number> {
  if (!signer) {
    throw new Error("Signer required to create rounds");
  }

  const now = Math.floor(Date.now() / 1000);
  const startTs = now - 5; // open already
  const endTs = now + Math.max(0, windowSeconds); // 0 = immediate end

  const tx = await lottery.createRound(startTs, endTs);
  const receipt = await tx.wait(2); // wait 2 confs to beat RPC lag

  // derive the new round id from the event
  let createdRound: number | undefined;
  try {
    for (const log of receipt.logs) {
      try {
        const parsed = lottery.interface.parseLog(log);
        if (parsed?.name === "RoundCreated") {
          createdRound = Number(parsed.args.round);
          break;
        }
      } catch {}
    }
  } catch {}

  // fallback to s_currentRound()
  if (!createdRound) {
    try {
      const curr = (await lottery.s_currentRound()) as bigint;
      if (curr > 0n) createdRound = Number(curr);
    } catch {}
  }

  if (!createdRound || createdRound === 0) {
    throw new Error("Could not determine created round id");
  }

  console.log(`✅ Created round ${createdRound} window: ${startTs} → ${endTs}`);
  return createdRound;
}

async function getRoundView(round: number) {
  try {
    return await robustRpcProvider.call(async (provider) => {
      const lotteryWithProvider = new ethers.Contract(
        LOTTERY,
        lotteryAbi as any,
        provider
      );
      const rd = await lotteryWithProvider.getRound(round);
      return {
        start: rd[0] as bigint,
        end: rd[1] as bigint,
        isActive: rd[2] as boolean,
        isCompleted: rd[3] as boolean,
        winner: rd[4] as string,
        winningTokenId: rd[5] as bigint,
        totalEntries: rd[6] as bigint,
      };
    });
  } catch (e) {
    console.warn(`Failed to get round ${round}:`, e);
    return null;
  }
}

// Define the return type for getRound
export interface RoundData {
  start: string;
  end: string;
  isActive: boolean;
  isCompleted: boolean;
  winner: string;
  winningTokenId: string;
  totalEntries: string;
}

/** Public: stringified fields for easy logging/UI */
export async function getRound(round: number): Promise<RoundData> {
  const cacheKey = `round_${round}`;

  // ✅ TEMPORARY FIX: Disable cache to force fresh blockchain data
  // Try cache first (30 second TTL for active rounds, 5 minutes for completed)
  // const cached = rpcCache.get<RoundData>(cacheKey);
  // if (cached) {
  //   console.log(`📦 Cache hit for round ${round}`);
  //   return cached;
  // }

  console.log(`🔄 Fetching fresh data for round ${round} from blockchain`);
  const rd = await getRoundView(round);
  if (!rd) throw new Error(`getRound(${round}) failed`);

  const result: RoundData = {
    start: rd.start.toString(),
    end: rd.end.toString(),
    isActive: rd.isActive,
    isCompleted: rd.isCompleted,
    winner: rd.winner,
    winningTokenId: rd.winningTokenId.toString(),
    totalEntries: rd.totalEntries.toString(),
  };

  // Cache with appropriate TTL (reduced completed round cache from 5min to 30s for faster round transitions)
  const ttl = rd.isCompleted ? 30 : 30; // 30s for both completed and active rounds
  rpcCache.set(cacheKey, result, ttl);

  return result;
}
export async function getWinnerFor(round: number) {
  const r: any = await (lottery as any)["getRound(uint256)"](round);
  return {
    winner: r.winner ?? r[4],
    tokenId: (r.winningTokenId ?? r[5]) as bigint,
  };
}

// Track which rounds have already been logged to prevent repeated winner logs
const loggedWinners = new Set<number>();

// Track which rounds have already had fee payout success logged to prevent repetition
const loggedFeePayouts = new Set<number>();

/**
 * Check for recent VRF completion events and invalidate cache for completed rounds
 * This enables faster detection of round completions
 * Uses chunked querying to respect RPC provider's 500-block limit
 * Now handles NoWinnerPicked, FeePayoutSuccess, FeePayoutFailed, FundsAdminChanged, DrawIntervalChanged events
 * Events are cached for 5 minutes to reduce redundant blockchain calls
 */
export async function checkAndInvalidateCompletedRounds(
  fromBlock: number = -200
): Promise<number[]> {
  try {
    const completedRounds: number[] = [];

    // Listen for various completion and status events
    if (lottery.runner?.provider) {
      const provider = lottery.runner.provider;
      const currentBlock = await provider.getBlockNumber();

      // Calculate actual fromBlock
      const actualFromBlock =
        fromBlock < 0 ? currentBlock + fromBlock : fromBlock;
      const toBlock = currentBlock;

      // Create cache key for this block range
      const cacheKey = `events_${actualFromBlock}_${toBlock}`;

      // Check cache first (5 minute TTL)
      const cachedEvents = rpcCache.get<any[]>(cacheKey);
      let allEvents: any[] = [];

      if (cachedEvents) {
        console.log(
          `📋 Using cached events for blocks ${actualFromBlock}-${toBlock}`
        );
        allEvents = cachedEvents;
      } else {
        console.log(
          `🔍 Querying fresh events for blocks ${actualFromBlock}-${toBlock}`
        );

        // Chunk the query to respect 500-block limit
        const CHUNK_SIZE = 450; // Use 450 to be safe

        for (
          let start = actualFromBlock;
          start <= toBlock;
          start += CHUNK_SIZE
        ) {
          const end = Math.min(start + CHUNK_SIZE - 1, toBlock);

          try {
            // Query multiple event types in parallel
            const [
              roundCompletedEvents,
              noWinnerEvents,
              feePayoutSuccessEvents,
              feePayoutFailedEvents,
              fundsAdminChangedEvents,
              drawIntervalChangedEvents,
            ] = await Promise.all([
              (lottery as any).filters?.RoundCompleted
                ? lottery.queryFilter(
                    (lottery as any).filters.RoundCompleted(),
                    start,
                    end
                  )
                : [],
              (lottery as any).filters?.NoWinnerPicked
                ? lottery.queryFilter(
                    (lottery as any).filters.NoWinnerPicked(),
                    start,
                    end
                  )
                : [],
              (lottery as any).filters?.FeePayoutSuccess
                ? lottery.queryFilter(
                    (lottery as any).filters.FeePayoutSuccess(),
                    start,
                    end
                  )
                : [],
              (lottery as any).filters?.FeePayoutFailed
                ? lottery.queryFilter(
                    (lottery as any).filters.FeePayoutFailed(),
                    start,
                    end
                  )
                : [],
              (lottery as any).filters?.FundsAdminChanged
                ? lottery.queryFilter(
                    (lottery as any).filters.FundsAdminChanged(),
                    start,
                    end
                  )
                : [],
              (lottery as any).filters?.DrawIntervalChanged
                ? lottery.queryFilter(
                    (lottery as any).filters.DrawIntervalChanged(),
                    start,
                    end
                  )
                : [],
            ]);

            allEvents.push(
              ...roundCompletedEvents,
              ...noWinnerEvents,
              ...feePayoutSuccessEvents,
              ...feePayoutFailedEvents,
              ...fundsAdminChangedEvents,
              ...drawIntervalChangedEvents
            );
          } catch (chunkError: any) {
            console.warn(
              `⚠️ Failed to query events for blocks ${start}-${end}: ${chunkError?.message}`
            );
            // Continue with other chunks
          }
        }

        // Cache the events for 5 minutes (300 seconds)
        rpcCache.set(cacheKey, allEvents, 300);
        console.log(
          `💾 Cached ${allEvents.length} events for blocks ${actualFromBlock}-${toBlock}`
        );
      }

      for (const event of allEvents) {
        const eventName =
          (event as any).eventName || (event as any).fragment?.name;

        if (eventName === "RoundCompleted") {
          const roundNumber = Number(
            (event as any).args?.round ?? (event as any).args?.[0]
          );
          const winner = (event as any).args?.[1];
          const winningTokenId = (event as any).args?.[2];

          if (roundNumber && !isNaN(roundNumber)) {
            // Invalidate cache for this round and event caches
            rpcCache.invalidateRound(roundNumber);
            rpcCache.invalidateEventCaches(); // Clear event caches when new completion detected
            completedRounds.push(roundNumber);

            // Only log winner information if we haven't logged this round before
            if (!loggedWinners.has(roundNumber)) {
              // Decode the token ID to show the actual NFT ID
              let displayTokenId = "N/A";
              if (winningTokenId) {
                try {
                  const bigIntId = BigInt(winningTokenId.toString());
                  const ID_PREFIX = BigInt(1) << BigInt(255);
                  const actualNftId =
                    bigIntId >= ID_PREFIX ? bigIntId - ID_PREFIX : bigIntId;
                  displayTokenId = actualNftId.toString();
                } catch {
                  displayTokenId = winningTokenId.toString();
                }
              }

              // Log winner information (only once per round)
              console.log(`🏆 WINNER DETECTED - Round ${roundNumber}:`);
              console.log(`   Winner: ${winner}`);
              console.log(`   Winning Token ID: ${displayTokenId}`);
              console.log(`   Tx: ${(event as any).transactionHash}`);
              console.log(`   Block: ${(event as any).blockNumber}`);

              // Mark this round as logged
              loggedWinners.add(roundNumber);
            }
          }
        } else if (eventName === "NoWinnerPicked") {
          const roundNumber = Number(
            (event as any).args?.round ?? (event as any).args?.[0]
          );
          const winningTokenId = (event as any).args?.[1];
          const randomWord = (event as any).args?.[2];

          if (roundNumber && !isNaN(roundNumber)) {
            // Invalidate cache for this round
            rpcCache.invalidateRound(roundNumber);
            completedRounds.push(roundNumber);

            // Only log no winner information if we haven't logged this round before
            if (!loggedWinners.has(roundNumber)) {
              // Decode the token ID to show the actual NFT ID
              let displayTokenId = "N/A";
              if (winningTokenId) {
                try {
                  const bigIntId = BigInt(winningTokenId.toString());
                  const ID_PREFIX = BigInt(1) << BigInt(255);
                  const actualNftId =
                    bigIntId >= ID_PREFIX ? bigIntId - ID_PREFIX : bigIntId;
                  displayTokenId = actualNftId.toString();
                } catch {
                  displayTokenId = winningTokenId.toString();
                }
              }

              // Log no winner information (only once per round)
              console.log(`❌ NO WINNER - Round ${roundNumber}:`);
              console.log(`   Selected Token ID: ${displayTokenId}`);
              console.log(`   Random Word: ${randomWord?.toString() || "N/A"}`);
              console.log(`   Tx: ${(event as any).transactionHash}`);
              console.log(`   Block: ${(event as any).blockNumber}`);
              console.log(`   Reason: Token owner not found or invalid`);

              // Mark this round as logged
              loggedWinners.add(roundNumber);
            }
          }
        } else if (eventName === "FeePayoutSuccess") {
          const roundNumber = Number(
            (event as any).args?.round ?? (event as any).args?.[0]
          );
          const recipient = (event as any).args?.[1];
          const amount = (event as any).args?.[2];

          // Only log fee payout success if we haven't logged this round before
          if (!loggedFeePayouts.has(roundNumber)) {
            console.log(`💰 FEE PAYOUT SUCCESS - Round ${roundNumber}:`);
            console.log(`   Recipient: ${recipient}`);
            console.log(`   Amount: ${amount?.toString() || "N/A"}`);
            console.log(`   Tx: ${(event as any).transactionHash}`);
            console.log(`   Block: ${(event as any).blockNumber}`);

            // Mark this round as logged
            loggedFeePayouts.add(roundNumber);
          }
        } else if (eventName === "FeePayoutFailed") {
          const roundNumber = Number(
            (event as any).args?.round ?? (event as any).args?.[0]
          );
          const recipient = (event as any).args?.[1];
          const reason = (event as any).args?.[2];

          console.log(`💸 FEE PAYOUT FAILED - Round ${roundNumber}:`);
          console.log(`   Recipient: ${recipient}`);
          console.log(`   Reason: ${reason || "Unknown"}`);
          console.log(`   Tx: ${(event as any).transactionHash}`);
          console.log(`   Block: ${(event as any).blockNumber}`);
        } else if (eventName === "FundsAdminChanged") {
          const oldAdmin = (event as any).args?.[0];
          const newAdmin = (event as any).args?.[1];

          console.log(`🔐 FUNDS ADMIN CHANGED:`);
          console.log(`   Old Admin: ${oldAdmin}`);
          console.log(`   New Admin: ${newAdmin}`);
          console.log(`   Tx: ${(event as any).transactionHash}`);
          console.log(`   Block: ${(event as any).blockNumber}`);
        } else if (eventName === "DrawIntervalChanged") {
          const oldInterval = (event as any).args?.[0];
          const newInterval = (event as any).args?.[1];

          console.log(`⏰ DRAW INTERVAL CHANGED:`);
          console.log(
            `   Old Interval: ${oldInterval?.toString() || "N/A"} seconds`
          );
          console.log(
            `   New Interval: ${newInterval?.toString() || "N/A"} seconds`
          );
          console.log(`   Tx: ${(event as any).transactionHash}`);
          console.log(`   Block: ${(event as any).blockNumber}`);
        }
      }
    }

    return completedRounds;
  } catch (error: any) {
    console.warn(
      `⚠️ Could not check completion events: ${error?.message || error}`
    );
    return [];
  }
}

const COORD_ABI = [
  "function getSubscription(uint256) view returns (uint256 linkBalance, uint256 nativeBalance, uint64 reqCount, address owner, address[] consumers)",
  "function addConsumer(uint256,address) external",
  "event RandomWordsRequested(bytes32 keyHash, uint256 requestId, uint256 preSeed, uint64 subId, uint16 minimumRequestConfirmations, uint32 callbackGasLimit, uint32 numWords, address sender)",
  "event RandomWordsFulfilled(uint256 indexed requestId, uint256 outputSeed, uint96 payment, bool success, bool onlyPremium)",
];

const LINK_ABI = [
  "function transferAndCall(address to, uint256 value, bytes data) public returns (bool)",
];

const coordinator = new ethers.Contract(VRF_COORDINATOR, COORD_ABI, signer);
const link = new ethers.Contract(LINK_TOKEN, LINK_ABI, signer);

/** Build a topics filter for a specific requestId on the VRF coordinator */
function buildFulfilledFilter(requestId: bigint) {
  const EVENT_SIG = "RandomWordsFulfilled(uint256,uint256,uint96,bool,bool)";

  // v6-safe event topic
  const topic = (ethers as any).id
    ? (ethers as any).id(EVENT_SIG)
    : ethers.keccak256(ethers.toUtf8Bytes(EVENT_SIG));

  const reqTopic = ethers.zeroPadValue(ethers.toBeHex(requestId), 32);
  return {
    address: VRF_COORDINATOR,
    topics: [topic, reqTopic],
  };
}

/** Safely parse a log; returns null if it doesn't match the ABI/event */
function safeParseLog(
  iface: ethers.Interface,
  log: any
): ReturnType<typeof iface.parseLog> | null {
  try {
    return iface.parseLog(log);
  } catch {
    return null;
  }
}

/** Query past logs (useful if the fulfillment already happened before we start watching) */
export async function getFulfillmentLog(requestId: bigint) {
  const iface = new ethers.Interface(COORD_ABI);
  const filter = buildFulfilledFilter(requestId);

  const latest = await provider.getBlockNumber();
  const from = Math.max(0, latest - 5_000); // recent window; widen if needed
  const logs = await provider.getLogs({
    ...filter,
    fromBlock: from,
    toBlock: "latest",
  });
  if (logs.length === 0) return null;

  const parsed = safeParseLog(iface, logs[0]);
  if (!parsed) return null;

  const { outputSeed, payment, success } = parsed.args as unknown as {
    requestId: bigint;
    outputSeed: bigint;
    payment: bigint;
    success: boolean;
    onlyPremium: boolean;
  };

  return {
    blockNumber: logs[0].blockNumber,
    txHash: logs[0].transactionHash,
    success,
    paymentJuels: payment,
    outputSeed,
  };
}

/** Poll the coordinator for RandomWordsFulfilled(requestId) up to timeoutMs (no eth_newFilter) */
export async function waitForFulfillment(
  requestId: bigint,
  timeoutMs = 5 * 60_000,
  pollMs = 3_000,
  fromBlockHint?: number // optional: start from a known block (e.g., draw tx block)
): Promise<{
  blockNumber: number;
  txHash: string;
  success: boolean;
  paymentJuels: bigint;
  outputSeed: bigint;
}> {
  const iface = new ethers.Interface(COORD_ABI);
  const filter = buildFulfilledFilter(requestId);

  const startTime = Date.now();
  let fromBlock =
    fromBlockHint ?? Math.max(0, (await provider.getBlockNumber()) - 5_000);

  while (Date.now() - startTime < timeoutMs) {
    // Always query logs directly; no installed filters
    const logs = await provider.getLogs({
      ...filter,
      fromBlock,
      toBlock: "latest",
    });

    // Move the window forward next iteration
    if (logs.length > 0) {
      const lastBlock = logs[logs.length - 1].blockNumber;
      fromBlock = Math.max(fromBlock, lastBlock);
    }

    // Find our fulfillment in the batch
    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "RandomWordsFulfilled") {
          const { outputSeed, payment, success } = parsed.args as unknown as {
            requestId: bigint;
            outputSeed: bigint;
            payment: bigint;
            success: boolean;
            onlyPremium: boolean;
          };
          return {
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            success,
            paymentJuels: payment,
            outputSeed,
          };
        }
      } catch {
        // not our event; ignore
      }
    }

    await sleep(pollMs);
  }

  throw new Error("No RandomWordsFulfilled seen within timeout");
}

/* ---------- VRF helper ---------- */
export async function ensureVrfReady(minLink = "0.2") {
  const subId = ethers.toBigInt(SUB_ID_STR);
  const sub = await coordinator.getSubscription(subId);
  const linkBal = sub.linkBalance as bigint;
  const nativeBal = sub.nativeBalance as bigint;
  const owner = (sub.owner as string).toLowerCase();
  const consumers = (sub.consumers as string[]).map((c) => c.toLowerCase());
  if (!signer) {
    throw new Error("Signer required for VRF operations");
  }
  const me = (await signer.getAddress()).toLowerCase();

  if (owner !== me) {
    console.warn("⚠️ Signer is not VRF sub owner; addConsumer may revert.");
  }

  const addr = (await lottery.getAddress()).toLowerCase();
  if (!consumers.includes(addr)) {
    const tx = await coordinator.addConsumer(subId, addr);
    await tx.wait();
    console.log(`✅ Added consumer ${addr} to sub ${SUB_ID_STR}`);
  } else {
    console.log("ℹ️ Lottery already a consumer.");
  }

  if (VRF_NATIVE) {
    console.log(
      "ℹ️ Using native VRF payment. Native(wei):",
      nativeBal.toString()
    );
  } else {
    const min = ethers.parseUnits(minLink, 18);
    if (linkBal < min) {
      console.log("ℹ️ Funding sub with 1 LINK via transferAndCall…");
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256"],
        [subId]
      );
      const tx = await link.transferAndCall(
        VRF_COORDINATOR,
        ethers.parseUnits("1", 18),
        data
      );
      await tx.wait();
      console.log("✅ Funded subscription with LINK.");
    } else {
      console.log("ℹ️ Subscription has sufficient LINK:", linkBal.toString());
    }
  }
}

/* ---------- Polling-based draw (waits for end-of-round) ---------- */
export async function drawAndWait(
  round: number,
  timeoutMs = 10 * 60_000,
  pollMs = 3_000
): Promise<{ winner: string; tokenId: bigint }> {
  if (!signer) {
    throw new Error("Signer required to draw winners");
  }

  // ---- Preflight: check & log round status ----
  let rd0 = await getRoundView(round);
  if (!rd0) throw new Error(`getRound(${round}) view failed`);
  console.log("🧭 Round", round, {
    start: rd0.start.toString(),
    end: rd0.end.toString(),
    isActive: rd0.isActive,
    isCompleted: rd0.isCompleted,
    totalEntries: rd0.totalEntries.toString(),
  });

  if (!rd0.isActive) throw new Error(`Round ${round} not active`);
  if (rd0.isCompleted) throw new Error(`Round ${round} already completed`);
  if (rd0.totalEntries === 0n) throw new Error(`Round ${round} has no entries`);

  // ---- Wait until round closes (avoid "round still open") ----
  const now = Math.floor(Date.now() / 1000);
  const endTs = Number(rd0.end);
  if (Number.isFinite(endTs) && now < endTs) {
    const waitMs = (endTs - now + 3) * 1000; // +3s cushion
    console.log(
      `⏳ Waiting ${Math.ceil(
        waitMs / 1000
      )}s until round ${round} closes at ${endTs}…`
    );
    await sleep(waitMs);
    // re-read after waiting
    rd0 = await getRoundView(round);
    if (!rd0) throw new Error(`getRound(${round}) view failed after wait`);
  }

  // ---- Draw ----
  console.log("🎲 drawWinner(", round, ") …");
  let receipt;
  try {
    const drawTx = await lottery.drawWinner(round);
    receipt = await drawTx.wait();
  } catch (err: any) {
    const parsed = parseCustomError(err);
    if (parsed) {
      throw new Error(
        `drawWinner reverted with custom error ${parsed.name} ${JSON.stringify(
          parsed.args ?? []
        )}`
      );
    }
    throw err;
  }

  // Try to log RandomnessRequested(requestId, round)
  let reqId: bigint | null = null;
  try {
    const iface = lottery.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "RandomnessRequested") {
          reqId = parsed.args.requestId as bigint;
          console.log("📦 VRF requestId:", reqId.toString());
          break;
        }
      } catch {}
    }
  } catch {}

  if (!reqId) {
    throw new Error("Could not find RandomnessRequested event in receipt");
  }

  // ---- Poll for completion ----
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rd = await getRoundView(round);
    if (
      rd?.isCompleted &&
      rd.winner !== ethers.ZeroAddress &&
      rd.winningTokenId !== 0n
    ) {
      console.log(
        "🏆 Winner:",
        rd.winner,
        "token",
        rd.winningTokenId.toString()
      );
      return { winner: rd.winner, tokenId: rd.winningTokenId };
    }
    await sleep(pollMs);
  }
  throw new Error("Timeout waiting for round completion (VRF still pending?)");
}
