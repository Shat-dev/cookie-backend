import { Request, Response } from "express";
import { lotteryQueries } from "../db/lotteryQueries";
import { CreateRoundRequest, DrawWinnerRequest } from "../types/lottery";

export const lotteryController = {
  // Create a new lottery round
  async createRound(
    req: Request<{}, {}, CreateRoundRequest>,
    res: Response
  ): Promise<void> {
    try {
      const { start_time, end_time } = req.body;

      if (!start_time) {
        res.status(400).json({
          success: false,
          message: "Start time is required",
        });
        return;
      }

      const nextRoundNumber = await lotteryQueries.getNextRoundNumber();
      const round = await lotteryQueries.createRound(
        nextRoundNumber,
        new Date(start_time),
        end_time ? new Date(end_time) : undefined
      );

      // Automatically sync entries from current pool
      const syncedCount = await lotteryQueries.syncEntriesFromCurrentPool(
        round.id
      );

      res.status(201).json({
        success: true,
        data: {
          round,
          synced_entries: syncedCount,
        },
        message: `Lottery round ${nextRoundNumber} created with ${syncedCount} entries`,
      });
    } catch (error: any) {
      console.error("Error creating lottery round:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create lottery round",
        error: error.message,
      });
    }
  },

  // Get all lottery rounds
  async getAllRounds(req: Request, res: Response): Promise<void> {
    try {
      const rounds = await lotteryQueries.getAllRounds();
      res.json({
        success: true,
        data: rounds,
      });
    } catch (error: any) {
      console.error("Error fetching lottery rounds:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch lottery rounds",
        error: error.message,
      });
    }
  },

  // Get active lottery round
  async getActiveRound(req: Request, res: Response): Promise<void> {
    try {
      const round = await lotteryQueries.getActiveRound();

      if (!round) {
        res.status(404).json({
          success: false,
          message: "No active lottery round found",
        });
        return;
      }

      // Get entries for this round
      const entries = await lotteryQueries.getRoundEntries(round.id);

      res.json({
        success: true,
        data: {
          round,
          entries,
        },
      });
    } catch (error: any) {
      console.error("Error fetching active round:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch active round",
        error: error.message,
      });
    }
  },

  // Get lottery round by ID
  async getRoundById(req: Request, res: Response): Promise<void> {
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

      const round = await lotteryQueries.getRound(roundId);

      if (!round) {
        res.status(404).json({
          success: false,
          message: "Lottery round not found",
        });
        return;
      }

      // Get entries for this round
      const entries = await lotteryQueries.getRoundEntries(roundId);

      res.json({
        success: true,
        data: {
          round,
          entries,
        },
      });
    } catch (error: any) {
      console.error("Error fetching lottery round:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch lottery round",
        error: error.message,
      });
    }
  },

  // Draw winner for a lottery round
  async drawWinner(
    req: Request<{}, {}, DrawWinnerRequest>,
    res: Response
  ): Promise<void> {
    try {
      const { round_id } = req.body;

      if (!round_id) {
        res.status(400).json({
          success: false,
          message: "Round ID is required",
        });
        return;
      }

      const round = await lotteryQueries.getRound(round_id);

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

      const entries = await lotteryQueries.getRoundEntries(round_id);

      if (entries.length === 0) {
        res.status(400).json({
          success: false,
          message: "No entries found for this round",
        });
        return;
      }

      // Simple random selection (in production, use Chainlink VRF)
      const randomIndex = Math.floor(Math.random() * entries.length);
      const winner = entries[randomIndex];

      // Update round status and set winner
      await lotteryQueries.updateRoundStatus(
        round_id,
        "completed",
        winner.wallet_address,
        winner.token_id
      );

      // Add winner to winners table
      const winnerRecord = await lotteryQueries.addWinner(
        round_id,
        winner.wallet_address,
        winner.token_id,
        winner.image_url
      );

      res.json({
        success: true,
        data: {
          round_id,
          winner: winnerRecord,
          total_entries: entries.length,
        },
        message: `Winner drawn for round ${round.round_number}`,
      });
    } catch (error: any) {
      console.error("Error drawing winner:", error);
      res.status(500).json({
        success: false,
        message: "Failed to draw winner",
        error: error.message,
      });
    }
  },

  // Get lottery winners
  async getWinners(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const winners = await lotteryQueries.getWinners(limit);

      res.json({
        success: true,
        data: winners,
      });
    } catch (error: any) {
      console.error("Error fetching winners:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch winners",
        error: error.message,
      });
    }
  },

  // Get lottery statistics
  async getLotteryStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await lotteryQueries.getLotteryStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error("Error fetching lottery stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch lottery stats",
        error: error.message,
      });
    }
  },

  // Get prize pool information
  async getPrizePool(req: Request, res: Response): Promise<void> {
    try {
      // Import at the top level to avoid circular dependencies
      const { provider, lottery } = await import("../lotteryClient");
      const { ethers } = await import("ethers");

      // Get actual contract balance
      let balanceWei: bigint;
      let balanceEth: string;
      let ethPriceUsd: number;
      let prizePoolUsd: number;

      try {
        // Get the lottery contract address
        const lotteryAddress = await lottery.getAddress();

        // Get the contract's ETH balance
        balanceWei = await provider.getBalance(lotteryAddress);
        balanceEth = ethers.formatEther(balanceWei);

        // Fetch current ETH price from a reliable API
        try {
          const priceResponse = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=false"
          );
          if (priceResponse.ok) {
            const priceData = (await priceResponse.json()) as {
              ethereum?: { usd?: number };
            };
            ethPriceUsd = priceData.ethereum?.usd || 2000; // fallback to $2000
          } else {
            throw new Error("Price API failed");
          }
        } catch (priceError) {
          console.warn(
            "Failed to fetch ETH price, using fallback:",
            priceError
          );
          ethPriceUsd = 2000; // fallback price
        }

        // Calculate USD value of the prize pool
        prizePoolUsd = parseFloat(balanceEth) * ethPriceUsd;

        console.log(
          `📊 Prize Pool: ${balanceEth} ETH ($${prizePoolUsd.toFixed(
            2
          )}) @ $${ethPriceUsd}/ETH`
        );
      } catch (contractError) {
        console.warn(
          "Failed to fetch contract balance, using fallback values:",
          contractError
        );
        // Fallback values when contract interaction fails
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
    } catch (error: any) {
      console.error("Error fetching prize pool:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch prize pool",
        error: error.message,
      });
    }
  },

  // Get lottery results for frontend
  async getLotteryResults(req: Request, res: Response): Promise<void> {
    try {
      const rounds = await lotteryQueries.getAllRounds();
      const results = [];

      for (const round of rounds) {
        if (round.status === "completed" && round.winner_address) {
          const entries = await lotteryQueries.getRoundEntries(round.id);

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

      // Sort by round number (newest first)
      results.sort((a, b) => b.roundNumber - a.roundNumber);

      res.json({
        success: true,
        data: results,
      });
    } catch (error: any) {
      console.error("Error fetching lottery results:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch lottery results",
        error: error.message,
      });
    }
  },

  // Sync entries from current pool to active round
  async syncEntries(req: Request, res: Response): Promise<void> {
    try {
      const activeRound = await lotteryQueries.getActiveRound();

      if (!activeRound) {
        res.status(400).json({
          success: false,
          message: "No active lottery round found",
        });
        return;
      }

      const syncedCount = await lotteryQueries.syncEntriesFromCurrentPool(
        activeRound.id
      );

      res.json({
        success: true,
        data: {
          round_id: activeRound.id,
          synced_entries: syncedCount,
        },
        message: `Synced ${syncedCount} entries to round ${activeRound.round_number}`,
      });
    } catch (error: any) {
      console.error("Error syncing entries:", error);
      res.status(500).json({
        success: false,
        message: "Failed to sync entries",
        error: error.message,
      });
    }
  },
};
