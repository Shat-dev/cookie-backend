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
Object.defineProperty(exports, "__esModule", { value: true });
exports.lotteryController = void 0;
const lotteryQueries_1 = require("../db/lotteryQueries");
exports.lotteryController = {
    async createRound(req, res) {
        try {
            const { start_time, end_time } = req.body;
            if (!start_time) {
                res.status(400).json({
                    success: false,
                    message: "Start time is required",
                });
                return;
            }
            const nextRoundNumber = await lotteryQueries_1.lotteryQueries.getNextRoundNumber();
            const round = await lotteryQueries_1.lotteryQueries.createRound(nextRoundNumber, new Date(start_time), end_time ? new Date(end_time) : undefined);
            const syncedCount = await lotteryQueries_1.lotteryQueries.syncEntriesFromCurrentPool(round.id);
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
            console.error("Error creating lottery round:", error);
            res.status(500).json({
                success: false,
                message: "Failed to create lottery round",
                error: error.message,
            });
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
            console.error("Error fetching lottery rounds:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch lottery rounds",
                error: error.message,
            });
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
            console.error("Error fetching active round:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch active round",
                error: error.message,
            });
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
            console.error("Error fetching lottery round:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch lottery round",
                error: error.message,
            });
        }
    },
    async drawWinner(req, res) {
        try {
            const { round_id } = req.body;
            if (!round_id) {
                res.status(400).json({
                    success: false,
                    message: "Round ID is required",
                });
                return;
            }
            const round = await lotteryQueries_1.lotteryQueries.getRound(round_id);
            if (!round) {
                res.status(404).json({
                    success: false,
                    message: "Lottery round not found",
                });
                return;
            }
            if (round.status !== "active") {
                res.status(400).json({
                    success: false,
                    message: "Can only draw winners for active rounds",
                });
                return;
            }
            const entries = await lotteryQueries_1.lotteryQueries.getRoundEntries(round_id);
            if (entries.length === 0) {
                res.status(400).json({
                    success: false,
                    message: "No entries found for this round",
                });
                return;
            }
            const randomIndex = Math.floor(Math.random() * entries.length);
            const winner = entries[randomIndex];
            await lotteryQueries_1.lotteryQueries.updateRoundStatus(round_id, "completed", winner.wallet_address, winner.token_id);
            const winnerRecord = await lotteryQueries_1.lotteryQueries.addWinner(round_id, winner.wallet_address, winner.token_id, winner.image_url);
            res.json({
                success: true,
                data: {
                    round_id,
                    winner: winnerRecord,
                    total_entries: entries.length,
                },
                message: `Winner drawn for round ${round.round_number}`,
            });
        }
        catch (error) {
            console.error("Error drawing winner:", error);
            res.status(500).json({
                success: false,
                message: "Failed to draw winner",
                error: error.message,
            });
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
            console.error("Error fetching winners:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch winners",
                error: error.message,
            });
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
            console.error("Error fetching lottery stats:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch lottery stats",
                error: error.message,
            });
        }
    },
    async getPrizePool(req, res) {
        try {
            const { provider, lottery } = await Promise.resolve().then(() => __importStar(require("../lotteryClient")));
            const { ethers } = await Promise.resolve().then(() => __importStar(require("ethers")));
            let balanceWei;
            let balanceEth;
            let ethPriceUsd;
            let prizePoolUsd;
            try {
                const lotteryAddress = await lottery.getAddress();
                balanceWei = await provider.getBalance(lotteryAddress);
                balanceEth = ethers.formatEther(balanceWei);
                try {
                    const priceResponse = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=false");
                    if (priceResponse.ok) {
                        const priceData = (await priceResponse.json());
                        ethPriceUsd = priceData.ethereum?.usd || 2000;
                    }
                    else {
                        throw new Error("Price API failed");
                    }
                }
                catch (priceError) {
                    console.warn("Failed to fetch ETH price, using fallback:", priceError);
                    ethPriceUsd = 2000;
                }
                prizePoolUsd = parseFloat(balanceEth) * ethPriceUsd;
                console.log(`📊 Prize Pool: ${balanceEth} ETH ($${prizePoolUsd.toFixed(2)}) @ $${ethPriceUsd}/ETH`);
            }
            catch (contractError) {
                console.warn("Failed to fetch contract balance, using fallback values:", contractError);
                balanceWei = BigInt("0");
                balanceEth = "0.0";
                ethPriceUsd = 2000;
                prizePoolUsd = 0;
            }
            const prizePoolData = {
                balance_eth: balanceEth,
                balance_wei: balanceWei.toString(),
                eth_price_usd: ethPriceUsd,
                prize_pool_usd: prizePoolUsd,
                last_updated: new Date().toISOString(),
            };
            res.json({
                success: true,
                data: prizePoolData,
            });
        }
        catch (error) {
            console.error("Error fetching prize pool:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch prize pool",
                error: error.message,
            });
        }
    },
    async getLotteryResults(req, res) {
        try {
            const rounds = await lotteryQueries_1.lotteryQueries.getAllRounds();
            const results = [];
            for (const round of rounds) {
                if (round.status === "completed" && round.winner_address) {
                    const entries = await lotteryQueries_1.lotteryQueries.getRoundEntries(round.id);
                    results.push({
                        roundNumber: round.round_number,
                        winner: round.winner_address,
                        winningTokenId: round.winner_token_id,
                        totalEntries: entries.length.toString(),
                        startTime: round.start_time,
                        endTime: round.end_time,
                        isCompleted: round.status === "completed",
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
            console.error("Error fetching lottery results:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch lottery results",
                error: error.message,
            });
        }
    },
    async syncEntries(req, res) {
        try {
            const activeRound = await lotteryQueries_1.lotteryQueries.getActiveRound();
            if (!activeRound) {
                res.status(400).json({
                    success: false,
                    message: "No active lottery round found",
                });
                return;
            }
            const syncedCount = await lotteryQueries_1.lotteryQueries.syncEntriesFromCurrentPool(activeRound.id);
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
            console.error("Error syncing entries:", error);
            res.status(500).json({
                success: false,
                message: "Failed to sync entries",
                error: error.message,
            });
        }
    },
};
//# sourceMappingURL=lotteryController.js.map