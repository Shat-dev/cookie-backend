"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotteryController = void 0;
const lotteryQueries_1 = require("../db/lotteryQueries");
const auditLogger_1 = require("../utils/auditLogger");
const lotteryClient_1 = require("../lotteryClient");
const ethers_1 = require("ethers");
const connection_1 = __importDefault(require("../db/connection"));
const appStateRepository_1 = require("../db/appStateRepository");
exports.lotteryController = {
    async createRound(req, res) {
        try {
            const startTime = auditLogger_1.auditLogger.startTimer();
            (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.CREATE_ROUND, req, {});
            const nextRoundNumber = await lotteryQueries_1.lotteryQueries.getNextRoundNumber();
            const round = await lotteryQueries_1.lotteryQueries.createRound(nextRoundNumber);
            const syncedCount = await lotteryQueries_1.lotteryQueries.syncEntriesFromCurrentPool(round.id);
            (0, auditLogger_1.auditSuccess)(auditLogger_1.AuditActionType.CREATE_ROUND, req, {
                round_number: nextRoundNumber,
                round_id: round.id,
                synced_entries: syncedCount,
            }, startTime);
            res.status(201).json({
                success: true,
                data: {
                    round,
                    synced_entries: syncedCount,
                },
                message: `Lottery round ${nextRoundNumber} created with ${syncedCount} entries`,
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to create lottery round");
            console.error("Error creating lottery round:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to create lottery round"));
        }
    },
    async getAllRounds(req, res) {
        try {
            const rounds = await lotteryQueries_1.lotteryQueries.getAllRounds();
            res.json({
                success: true,
                data: rounds,
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch lottery rounds");
            console.error("Error fetching lottery rounds:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to fetch lottery rounds"));
        }
    },
    async getActiveRound(req, res) {
        try {
            const round = await lotteryQueries_1.lotteryQueries.getActiveRound();
            if (!round) {
                res.status(404).json({
                    success: false,
                    message: "No active lottery round found",
                });
                return;
            }
            const entries = await lotteryQueries_1.lotteryQueries.getRoundEntries(round.id);
            res.json({
                success: true,
                data: {
                    round,
                    entries,
                },
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch active round");
            console.error("Error fetching active round:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to fetch active round"));
        }
    },
    async getRoundById(req, res) {
        try {
            const { id } = req.params;
            const roundId = parseInt(id);
            if (isNaN(roundId)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid round ID",
                });
                return;
            }
            const round = await lotteryQueries_1.lotteryQueries.getRound(roundId);
            if (!round) {
                res.status(404).json({
                    success: false,
                    message: "Lottery round not found",
                });
                return;
            }
            const entries = await lotteryQueries_1.lotteryQueries.getRoundEntries(roundId);
            res.json({
                success: true,
                data: {
                    round,
                    entries,
                },
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch lottery round");
            console.error("Error fetching lottery round:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to fetch lottery round"));
        }
    },
    async setFundsAdmin(req, res) {
        try {
            const { funds_admin_address } = req.body;
            const startTime = auditLogger_1.auditLogger.startTimer();
            (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.CREATE_ROUND, req, {
                funds_admin_address,
            });
            if (!funds_admin_address) {
                res.status(400).json({
                    success: false,
                    message: "Funds admin address is required",
                });
                return;
            }
            if (!ethers_1.ethers.isAddress(funds_admin_address)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid funds admin address",
                });
                return;
            }
            const activeRound = await lotteryQueries_1.lotteryQueries.getActiveRound();
            if (!activeRound) {
                res.status(400).json({
                    success: false,
                    message: "No active lottery round found",
                });
                return;
            }
            await lotteryQueries_1.lotteryQueries.updateFundsAdmin(activeRound.id, funds_admin_address);
            (0, auditLogger_1.auditSuccess)(auditLogger_1.AuditActionType.CREATE_ROUND, req, {
                round_id: activeRound.id,
                funds_admin_address,
                action: "set_funds_admin",
            }, startTime);
            res.json({
                success: true,
                data: {
                    round_id: activeRound.id,
                    funds_admin_address,
                },
                message: "Funds admin address updated successfully",
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to set funds admin");
            console.error("Error setting funds admin:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to set funds admin"));
        }
    },
    async getFundsAdmin(req, res) {
        try {
            const activeRound = await lotteryQueries_1.lotteryQueries.getActiveRound();
            if (!activeRound) {
                res.status(404).json({
                    success: false,
                    message: "No active lottery round found",
                });
                return;
            }
            const fundsAdmin = await lotteryQueries_1.lotteryQueries.getFundsAdmin(activeRound.id);
            res.json({
                success: true,
                data: {
                    round_id: activeRound.id,
                    funds_admin_address: fundsAdmin,
                },
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to get funds admin");
            console.error("Error getting funds admin:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to get funds admin"));
        }
    },
    async getPayoutHistory(req, res) {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit) : 50;
            const round_id = req.params.round_id
                ? parseInt(req.params.round_id)
                : undefined;
            if (limit <= 0 || limit > 100) {
                res.status(400).json({
                    success: false,
                    message: "Limit must be between 1 and 100",
                });
                return;
            }
            let payouts;
            if (round_id) {
                const winner = await lotteryQueries_1.lotteryQueries.getRoundWinner(round_id);
                payouts = winner ? [winner] : [];
            }
            else {
                payouts = await lotteryQueries_1.lotteryQueries.getPayoutHistory(limit);
            }
            res.json({
                success: true,
                data: {
                    payouts,
                    count: payouts.length,
                },
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to get payout history");
            console.error("Error getting payout history:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to get payout history"));
        }
    },
    async getContractBalance(req, res) {
        try {
            const balance = await lotteryClient_1.lottery.getBalance();
            const balanceEth = ethers_1.ethers.formatEther(balance);
            let additionalInfo = {};
            try {
                const currentRound = await lotteryClient_1.lottery.s_currentRound();
            }
            catch (error) {
                console.warn("Could not fetch additional contract info:", error);
            }
            res.json({
                success: true,
                data: {
                    balance_wei: balance.toString(),
                    balance_eth: balanceEth,
                    contract_address: await lotteryClient_1.lottery.getAddress(),
                    ...additionalInfo,
                },
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to get contract balance");
            console.error("Error getting contract balance:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to get contract balance"));
        }
    },
    async getWinners(req, res) {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit) : 10;
            const winners = await lotteryQueries_1.lotteryQueries.getWinners(limit);
            res.json({
                success: true,
                data: winners,
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch winners");
            console.error("Error fetching winners:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to fetch winners"));
        }
    },
    async getLotteryStats(req, res) {
        try {
            const stats = await lotteryQueries_1.lotteryQueries.getLotteryStats();
            res.json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch lottery stats");
            console.error("Error fetching lottery stats:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to fetch lottery stats"));
        }
    },
    async getLotteryResults(req, res) {
        try {
            const rounds = await lotteryQueries_1.lotteryQueries.getAllRounds();
            const results = [];
            const stateRepo = new appStateRepository_1.AppStateRepository(connection_1.default);
            for (const round of rounds) {
                if (round.status === "completed" && round.winner_address) {
                    const { rows: entries } = await connection_1.default.query("SELECT wallet_address, token_id FROM entries WHERE verified = true");
                    const dedup = new Map();
                    for (const entry of entries) {
                        const key = `${entry.wallet_address.toLowerCase()}-${entry.token_id}`;
                        if (!dedup.has(key))
                            dedup.set(key, entry);
                    }
                    const uniqueEntries = Array.from(dedup.values());
                    let payoutAmount = null;
                    let payoutAmountUsd = null;
                    let snapshotTxHash = null;
                    try {
                        const snapshotTxKey = `round_${round.round_number}_snapshot_tx`;
                        snapshotTxHash = await stateRepo.get(snapshotTxKey);
                    }
                    catch (snapshotError) {
                        console.warn(`Failed to fetch snapshot TX hash for round ${round.round_number}:`, snapshotError);
                    }
                    results.push({
                        roundNumber: round.round_number,
                        winner: round.winner_address,
                        winningTokenId: round.winner_token_id,
                        totalEntries: uniqueEntries.length.toString(),
                        isCompleted: round.status === "completed",
                        payoutAmount: payoutAmount,
                        payoutAmountUsd: payoutAmountUsd,
                        snapshotTxHash: snapshotTxHash,
                        vrfTransactionHash: round.vrf_transaction_hash,
                        createdAt: round.created_at,
                        updatedAt: round.updated_at,
                    });
                }
            }
            results.sort((a, b) => b.roundNumber - a.roundNumber);
            res.json({
                success: true,
                data: results,
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch lottery results");
            console.error("Error fetching lottery results:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to fetch lottery results"));
        }
    },
    async syncEntries(req, res) {
        try {
            const startTime = auditLogger_1.auditLogger.startTimer();
            (0, auditLogger_1.auditAction)(auditLogger_1.AuditActionType.SYNC_ENTRIES, req, {
                action: "manual_sync",
            });
            const activeRound = await lotteryQueries_1.lotteryQueries.getActiveRound();
            if (!activeRound) {
                res.status(400).json({
                    success: false,
                    message: "No active lottery round found",
                });
                return;
            }
            const syncedCount = await lotteryQueries_1.lotteryQueries.syncEntriesFromCurrentPool(activeRound.id);
            (0, auditLogger_1.auditSuccess)(auditLogger_1.AuditActionType.SYNC_ENTRIES, req, {
                round_id: activeRound.id,
                round_number: activeRound.round_number,
                synced_entries: syncedCount,
                action: "manual_sync",
            }, startTime);
            res.json({
                success: true,
                data: {
                    round_id: activeRound.id,
                    synced_entries: syncedCount,
                },
                message: `Synced ${syncedCount} entries to round ${activeRound.round_number}`,
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to sync entries");
            console.error("Error syncing entries:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to sync entries"));
        }
    },
    async getPrizePool(req, res) {
        try {
            const balance = await lotteryClient_1.lottery.getAddress().then(async (address) => {
                const provider = lotteryClient_1.lottery.runner?.provider;
                if (!provider)
                    throw new Error("Provider not available");
                return await provider.getBalance(address);
            });
            const balanceEth = ethers_1.ethers.formatEther(balance);
            const balanceEthNumber = parseFloat(balanceEth);
            let ethPriceUsd = 0;
            let prizePoolUsd = 0;
            try {
                const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
                if (response.ok) {
                    const data = (await response.json());
                    ethPriceUsd = data.ethereum?.usd || 0;
                    prizePoolUsd = balanceEthNumber * ethPriceUsd;
                }
            }
            catch (priceError) {
                console.warn("Failed to fetch ETH price, using 0:", priceError);
            }
            res.json({
                success: true,
                data: {
                    balance_eth: balanceEth,
                    balance_wei: balance.toString(),
                    eth_price_usd: ethPriceUsd,
                    prize_pool_usd: prizePoolUsd,
                    last_updated: new Date().toISOString(),
                },
            });
        }
        catch (error) {
            const { logDetails } = (0, auditLogger_1.sanitizeErrorResponse)(error, "Failed to fetch prize pool");
            console.error("Error fetching prize pool:", logDetails);
            res
                .status(500)
                .json((0, auditLogger_1.createErrorResponseWithMessage)(error, "Failed to fetch prize pool"));
        }
    },
};
//# sourceMappingURL=lotteryController.js.map