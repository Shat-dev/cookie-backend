"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lottery = exports.signer = exports.provider = void 0;
exports.createInstantRound = createInstantRound;
exports.getRound = getRound;
exports.getWinnerFor = getWinnerFor;
exports.getFulfillmentLog = getFulfillmentLog;
exports.waitForFulfillment = waitForFulfillment;
exports.ensureVrfReady = ensureVrfReady;
exports.drawAndWait = drawAndWait;
require("dotenv/config");
const ethers_1 = require("ethers");
const LotteryVrfV25ABI_json_1 = __importDefault(require("./constants/LotteryVrfV25ABI.json"));
const LotteryVrfV25Address_json_1 = __importDefault(require("./constants/LotteryVrfV25Address.json"));
const rpcProvider_1 = require("./utils/rpcProvider");
const rpcCache_1 = require("./utils/rpcCache");
function requireEnv(name) {
    const v = process.env[name];
    if (!v || !v.trim())
        throw new Error(`Missing required env: ${name}`);
    return v.trim();
}
function getEnv(name, defaultValue) {
    return process.env[name] || defaultValue;
}
const NETWORK = process.env.NETWORK || "base-sepolia";
const RPC = NETWORK === "base-mainnet"
    ? process.env.BASE_MAINNET_RPC_URL || "not-needed-in-production"
    : process.env.BASE_SEPOLIA_RPC_URL || "not-needed-in-production";
const PK = getEnv("PRIVATE_KEY", "");
const LOTTERY = LotteryVrfV25Address_json_1.default.LotteryVrfV25;
if (!ethers_1.ethers.isAddress(LOTTERY)) {
    throw new Error(`Invalid lottery address: ${LOTTERY}`);
}
const SUB_ID_STR = getEnv("SUB_ID", "");
const VRF_COORDINATOR = getEnv("VRF_COORDINATOR", "");
const LINK_TOKEN = getEnv("LINK_TOKEN", "");
const VRF_NATIVE = (process.env.VRF_NATIVE || "false").toLowerCase() === "true";
exports.provider = rpcProvider_1.robustRpcProvider.getProvider();
exports.signer = PK ? new ethers_1.ethers.Wallet(PK, exports.provider) : null;
exports.lottery = exports.signer
    ? new ethers_1.ethers.Contract(LOTTERY, LotteryVrfV25ABI_json_1.default, exports.signer)
    : new ethers_1.ethers.Contract(LOTTERY, LotteryVrfV25ABI_json_1.default, exports.provider);
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function parseCustomError(err) {
    const data = err?.data ?? err?.info?.error?.data;
    if (!data)
        return null;
    try {
        const parsed = exports.lottery.interface.parseError(data);
        return { name: parsed?.name, args: parsed?.args };
    }
    catch {
        return null;
    }
}
async function createInstantRound(windowSeconds = 0) {
    if (!exports.signer) {
        throw new Error("Signer required to create rounds");
    }
    const now = Math.floor(Date.now() / 1000);
    const startTs = now - 5;
    const endTs = now + Math.max(0, windowSeconds);
    const tx = await exports.lottery.createRound(startTs, endTs);
    const receipt = await tx.wait(2);
    let createdRound;
    try {
        for (const log of receipt.logs) {
            try {
                const parsed = exports.lottery.interface.parseLog(log);
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
        try {
            const curr = (await exports.lottery.s_currentRound());
            if (curr > 0n)
                createdRound = Number(curr);
        }
        catch { }
    }
    if (!createdRound || createdRound === 0) {
        throw new Error("Could not determine created round id");
    }
    console.log(`✅ Created round ${createdRound} window: ${startTs} → ${endTs}`);
    return createdRound;
}
async function getRoundView(round) {
    try {
        return await rpcProvider_1.robustRpcProvider.call(async (provider) => {
            const lotteryWithProvider = new ethers_1.ethers.Contract(LOTTERY, LotteryVrfV25ABI_json_1.default, provider);
            const rd = await lotteryWithProvider.getRound(round);
            return {
                start: rd[0],
                end: rd[1],
                isActive: rd[2],
                isCompleted: rd[3],
                winner: rd[4],
                winningTokenId: rd[5],
                totalEntries: rd[6],
            };
        });
    }
    catch (e) {
        console.warn(`Failed to get round ${round}:`, e);
        return null;
    }
}
async function getRound(round) {
    const cacheKey = `round_${round}`;
    const cached = rpcCache_1.rpcCache.get(cacheKey);
    if (cached) {
        console.log(`📦 Cache hit for round ${round}`);
        return cached;
    }
    const rd = await getRoundView(round);
    if (!rd)
        throw new Error(`getRound(${round}) failed`);
    const result = {
        start: rd.start.toString(),
        end: rd.end.toString(),
        isActive: rd.isActive,
        isCompleted: rd.isCompleted,
        winner: rd.winner,
        winningTokenId: rd.winningTokenId.toString(),
        totalEntries: rd.totalEntries.toString(),
    };
    const ttl = rd.isCompleted ? 300 : 30;
    rpcCache_1.rpcCache.set(cacheKey, result, ttl);
    return result;
}
async function getWinnerFor(round) {
    const r = await exports.lottery["getRound(uint256)"](round);
    return {
        winner: r.winner ?? r[4],
        tokenId: (r.winningTokenId ?? r[5]),
    };
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
const coordinator = new ethers_1.ethers.Contract(VRF_COORDINATOR, COORD_ABI, exports.signer);
const link = new ethers_1.ethers.Contract(LINK_TOKEN, LINK_ABI, exports.signer);
function buildFulfilledFilter(requestId) {
    const EVENT_SIG = "RandomWordsFulfilled(uint256,uint256,uint96,bool,bool)";
    const topic = ethers_1.ethers.id
        ? ethers_1.ethers.id(EVENT_SIG)
        : ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(EVENT_SIG));
    const reqTopic = ethers_1.ethers.zeroPadValue(ethers_1.ethers.toBeHex(requestId), 32);
    return {
        address: VRF_COORDINATOR,
        topics: [topic, reqTopic],
    };
}
function safeParseLog(iface, log) {
    try {
        return iface.parseLog(log);
    }
    catch {
        return null;
    }
}
async function getFulfillmentLog(requestId) {
    const iface = new ethers_1.ethers.Interface(COORD_ABI);
    const filter = buildFulfilledFilter(requestId);
    const latest = await exports.provider.getBlockNumber();
    const from = Math.max(0, latest - 5000);
    const logs = await exports.provider.getLogs({
        ...filter,
        fromBlock: from,
        toBlock: "latest",
    });
    if (logs.length === 0)
        return null;
    const parsed = safeParseLog(iface, logs[0]);
    if (!parsed)
        return null;
    const { outputSeed, payment, success } = parsed.args;
    return {
        blockNumber: logs[0].blockNumber,
        txHash: logs[0].transactionHash,
        success,
        paymentJuels: payment,
        outputSeed,
    };
}
async function waitForFulfillment(requestId, timeoutMs = 5 * 60000, pollMs = 3000, fromBlockHint) {
    const iface = new ethers_1.ethers.Interface(COORD_ABI);
    const filter = buildFulfilledFilter(requestId);
    const startTime = Date.now();
    let fromBlock = fromBlockHint ?? Math.max(0, (await exports.provider.getBlockNumber()) - 5000);
    while (Date.now() - startTime < timeoutMs) {
        const logs = await exports.provider.getLogs({
            ...filter,
            fromBlock,
            toBlock: "latest",
        });
        if (logs.length > 0) {
            const lastBlock = logs[logs.length - 1].blockNumber;
            fromBlock = Math.max(fromBlock, lastBlock);
        }
        for (const log of logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed?.name === "RandomWordsFulfilled") {
                    const { outputSeed, payment, success } = parsed.args;
                    return {
                        blockNumber: log.blockNumber,
                        txHash: log.transactionHash,
                        success,
                        paymentJuels: payment,
                        outputSeed,
                    };
                }
            }
            catch {
            }
        }
        await sleep(pollMs);
    }
    throw new Error("No RandomWordsFulfilled seen within timeout");
}
async function ensureVrfReady(minLink = "0.2") {
    const subId = ethers_1.ethers.toBigInt(SUB_ID_STR);
    const sub = await coordinator.getSubscription(subId);
    const linkBal = sub.linkBalance;
    const nativeBal = sub.nativeBalance;
    const owner = sub.owner.toLowerCase();
    const consumers = sub.consumers.map((c) => c.toLowerCase());
    if (!exports.signer) {
        throw new Error("Signer required for VRF operations");
    }
    const me = (await exports.signer.getAddress()).toLowerCase();
    if (owner !== me) {
        console.warn("⚠️ Signer is not VRF sub owner; addConsumer may revert.");
    }
    const addr = (await exports.lottery.getAddress()).toLowerCase();
    if (!consumers.includes(addr)) {
        const tx = await coordinator.addConsumer(subId, addr);
        await tx.wait();
        console.log(`✅ Added consumer ${addr} to sub ${SUB_ID_STR}`);
    }
    else {
        console.log("ℹ️ Lottery already a consumer.");
    }
    if (VRF_NATIVE) {
        console.log("ℹ️ Using native VRF payment. Native(wei):", nativeBal.toString());
    }
    else {
        const min = ethers_1.ethers.parseUnits(minLink, 18);
        if (linkBal < min) {
            console.log("ℹ️ Funding sub with 1 LINK via transferAndCall…");
            const data = ethers_1.ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [subId]);
            const tx = await link.transferAndCall(VRF_COORDINATOR, ethers_1.ethers.parseUnits("1", 18), data);
            await tx.wait();
            console.log("✅ Funded subscription with LINK.");
        }
        else {
            console.log("ℹ️ Subscription has sufficient LINK:", linkBal.toString());
        }
    }
}
async function drawAndWait(round, timeoutMs = 10 * 60000, pollMs = 3000) {
    if (!exports.signer) {
        throw new Error("Signer required to draw winners");
    }
    let rd0 = await getRoundView(round);
    if (!rd0)
        throw new Error(`getRound(${round}) view failed`);
    console.log("🧭 Round", round, {
        start: rd0.start.toString(),
        end: rd0.end.toString(),
        isActive: rd0.isActive,
        isCompleted: rd0.isCompleted,
        totalEntries: rd0.totalEntries.toString(),
    });
    if (!rd0.isActive)
        throw new Error(`Round ${round} not active`);
    if (rd0.isCompleted)
        throw new Error(`Round ${round} already completed`);
    if (rd0.totalEntries === 0n)
        throw new Error(`Round ${round} has no entries`);
    const now = Math.floor(Date.now() / 1000);
    const endTs = Number(rd0.end);
    if (Number.isFinite(endTs) && now < endTs) {
        const waitMs = (endTs - now + 3) * 1000;
        console.log(`⏳ Waiting ${Math.ceil(waitMs / 1000)}s until round ${round} closes at ${endTs}…`);
        await sleep(waitMs);
        rd0 = await getRoundView(round);
        if (!rd0)
            throw new Error(`getRound(${round}) view failed after wait`);
    }
    console.log("🎲 drawWinner(", round, ") …");
    let receipt;
    try {
        const drawTx = await exports.lottery.drawWinner(round);
        receipt = await drawTx.wait();
    }
    catch (err) {
        const parsed = parseCustomError(err);
        if (parsed) {
            throw new Error(`drawWinner reverted with custom error ${parsed.name} ${JSON.stringify(parsed.args ?? [])}`);
        }
        throw err;
    }
    let reqId = null;
    try {
        const iface = exports.lottery.interface;
        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed?.name === "RandomnessRequested") {
                    reqId = parsed.args.requestId;
                    console.log("📦 VRF requestId:", reqId.toString());
                    break;
                }
            }
            catch { }
        }
    }
    catch { }
    if (!reqId) {
        throw new Error("Could not find RandomnessRequested event in receipt");
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const rd = await getRoundView(round);
        if (rd?.isCompleted &&
            rd.winner !== ethers_1.ethers.ZeroAddress &&
            rd.winningTokenId !== 0n) {
            console.log("🏆 Winner:", rd.winner, "token", rd.winningTokenId.toString());
            return { winner: rd.winner, tokenId: rd.winningTokenId };
        }
        await sleep(pollMs);
    }
    throw new Error("Timeout waiting for round completion (VRF still pending?)");
}
//# sourceMappingURL=lotteryClient.js.map