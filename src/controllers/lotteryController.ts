import { Request, Response } from "express";
import crypto from "crypto";
import { lotteryQueries } from "../db/lotteryQueries";
import { DrawWinnerRequest, SetFundsAdminRequest } from "../types/lottery";
import {
  auditAction,
  auditSuccess,
  auditFailure,
  AuditActionType,
  auditLogger,
  sanitizeErrorResponse,
  createErrorResponseWithMessage,
} from "../utils/auditLogger";
import { lottery } from "../lotteryClient";
import { ethers } from "ethers";
import pool from "../db/connection";
import { AppStateRepository } from "../db/appStateRepository";

export const lotteryController = {
  // Create a new lottery round
  async createRound(req: Request, res: Response): Promise<void> {
    try {
      // Audit log for admin action using new system
      const startTime = auditLogger.startTimer();
      auditAction(AuditActionType.CREATE_ROUND, req, {});

      const nextRoundNumber = await lotteryQueries.getNextRoundNumber();
      const round = await lotteryQueries.createRound(nextRoundNumber);

      // Automatically sync entries from current pool
      const syncedCount = await lotteryQueries.syncEntriesFromCurrentPool(
        round.id
      );

      // Log successful round creation using new system
      auditSuccess(
        AuditActionType.CREATE_ROUND,
        req,
        {
          round_number: nextRoundNumber,
          round_id: round.id,
          synced_entries: syncedCount,
        },
        startTime
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to create lottery round"
      );
      console.error("Error creating lottery round:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(
            error,
            "Failed to create lottery round"
          )
        );
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch lottery rounds"
      );
      console.error("Error fetching lottery rounds:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(
            error,
            "Failed to fetch lottery rounds"
          )
        );
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch active round"
      );
      console.error("Error fetching active round:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(error, "Failed to fetch active round")
        );
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch lottery round"
      );
      console.error("Error fetching lottery round:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(error, "Failed to fetch lottery round")
        );
    }
  },

  // Set funds admin for the lottery system
  async setFundsAdmin(
    req: Request<{}, {}, SetFundsAdminRequest>,
    res: Response
  ): Promise<void> {
    try {
      const { funds_admin_address } = req.body;

      const startTime = auditLogger.startTimer();
      auditAction(AuditActionType.CREATE_ROUND, req, {
        // Reusing CREATE_ROUND for admin actions
        funds_admin_address,
      });

      if (!funds_admin_address) {
        res.status(400).json({
          success: false,
          message: "Funds admin address is required",
        });
        return;
      }

      if (!ethers.isAddress(funds_admin_address)) {
        res.status(400).json({
          success: false,
          message: "Invalid funds admin address",
        });
        return;
      }

      // Get active round to update
      const activeRound = await lotteryQueries.getActiveRound();
      if (!activeRound) {
        res.status(400).json({
          success: false,
          message: "No active lottery round found",
        });
        return;
      }

      await lotteryQueries.updateFundsAdmin(
        activeRound.id,
        funds_admin_address
      );

      auditSuccess(
        AuditActionType.CREATE_ROUND,
        req,
        {
          round_id: activeRound.id,
          funds_admin_address,
          action: "set_funds_admin",
        },
        startTime
      );

      res.json({
        success: true,
        data: {
          round_id: activeRound.id,
          funds_admin_address,
        },
        message: "Funds admin address updated successfully",
      });
    } catch (error: any) {
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to set funds admin"
      );
      console.error("Error setting funds admin:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(error, "Failed to set funds admin")
        );
    }
  },

  // Get funds admin for the lottery system
  async getFundsAdmin(req: Request, res: Response): Promise<void> {
    try {
      // Get active round
      const activeRound = await lotteryQueries.getActiveRound();
      if (!activeRound) {
        res.status(404).json({
          success: false,
          message: "No active lottery round found",
        });
        return;
      }

      const fundsAdmin = await lotteryQueries.getFundsAdmin(activeRound.id);

      res.json({
        success: true,
        data: {
          round_id: activeRound.id,
          funds_admin_address: fundsAdmin,
        },
      });
    } catch (error: any) {
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to get funds admin"
      );
      console.error("Error getting funds admin:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(error, "Failed to get funds admin")
        );
    }
  },

  // Get payout history
  async getPayoutHistory(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
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
        // Get payout for specific round
        const winner = await lotteryQueries.getRoundWinner(round_id);
        payouts = winner ? [winner] : [];
      } else {
        // Get general payout history
        payouts = await lotteryQueries.getPayoutHistory(limit);
      }

      res.json({
        success: true,
        data: {
          payouts,
          count: payouts.length,
        },
      });
    } catch (error: any) {
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to get payout history"
      );
      console.error("Error getting payout history:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(error, "Failed to get payout history")
        );
    }
  },

  // Get contract balance
  async getContractBalance(req: Request, res: Response): Promise<void> {
    try {
      // Get contract balance from blockchain
      const balance = await lottery.getBalance();
      const balanceBnb = ethers.formatEther(balance);

      // Get additional contract info if possible
      let additionalInfo = {};
      try {
        const currentRound = await lottery.s_currentRound();
      } catch (error) {
        console.warn("Could not fetch additional contract info:", error);
      }

      res.json({
        success: true,
        data: {
          balance_wei: balance.toString(),
          balance_bnb: balanceBnb,
          contract_address: await lottery.getAddress(),
          ...additionalInfo,
        },
      });
    } catch (error: any) {
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to get contract balance"
      );
      console.error("Error getting contract balance:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(
            error,
            "Failed to get contract balance"
          )
        );
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch winners"
      );
      console.error("Error fetching winners:", logDetails);
      res
        .status(500)
        .json(createErrorResponseWithMessage(error, "Failed to fetch winners"));
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch lottery stats"
      );
      console.error("Error fetching lottery stats:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(error, "Failed to fetch lottery stats")
        );
    }
  },

  // Get lottery results for frontend
  async getLotteryResults(req: Request, res: Response): Promise<void> {
    try {
      const rounds = await lotteryQueries.getAllRounds();
      const results = [];
      const stateRepo = new AppStateRepository(pool);

      // Fetch BNB price once per function call and reuse for all rounds
      let bnbPriceUsd = 0;
      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd"
        );
        if (response.ok) {
          const data = (await response.json()) as any;
          bnbPriceUsd = data.binancecoin?.usd || 0;
        }
      } catch (priceError) {
        console.warn(
          "Failed to fetch BNB price for payout calculations:",
          priceError
        );
      }

      for (const round of rounds) {
        if (round.status === "completed" && round.winner_address) {
          // ✅ FIX: Use same query as manual-vrf-draw.ts to get verified entries
          const { rows: entries } = await pool.query(
            "SELECT wallet_address, token_id FROM entries WHERE verified = true"
          );

          // ✅ FIX: Deduplicate entries using same logic as snapshot creation
          const dedup = new Map<string, any>();
          for (const entry of entries) {
            const key = `${entry.wallet_address.toLowerCase()}-${
              entry.token_id
            }`;
            if (!dedup.has(key)) dedup.set(key, entry);
          }
          const uniqueEntries = Array.from(dedup.values());

          // Get payout amount - prioritize database, fallback to blockchain events
          let payoutAmount = null;
          let payoutAmountUsd = null;

          try {
            // Step 1: Try to get payout from database (lottery_winners table)
            const winner = await lotteryQueries.getRoundWinner(round.id);
            if (winner && winner.payout_amount) {
              // Convert wei to BNB using ethers formatEther
              payoutAmount = ethers.formatEther(winner.payout_amount);

              // Calculate USD value if BNB price is available
              if (bnbPriceUsd > 0) {
                payoutAmountUsd = parseFloat(payoutAmount) * bnbPriceUsd;
              }

              console.log(
                `✅ Found payout in database for round ${round.round_number}: ${payoutAmount} BNB (source: DB, round_id: ${round.id})`
              );
            } else {
              // Step 2: Fallback to blockchain events if database record is missing/incomplete
              console.log(
                `⚠️ No payout amount in database for round ${round.round_number}, querying blockchain events...`
              );

              try {
                // Use a reduced block range for better performance and accuracy
                const currentBlock =
                  await lottery.runner?.provider?.getBlockNumber();
                const fromBlock = currentBlock
                  ? Math.max(0, currentBlock - 1000)
                  : -1000; // Reduced from 10,000
                const toBlock = "latest";
                console.log(
                  `📍 Using block range: ${fromBlock} to latest for round ${round.round_number}`
                );

                const feePayoutEvents = await lottery.queryFilter(
                  (lottery as any).filters.FeePayoutSuccess(),
                  fromBlock,
                  toBlock
                );

                console.log(
                  `🔍 Found ${feePayoutEvents.length} FeePayoutSuccess events in block range`
                );

                let roundPayoutEvent = null;

                // Step 2a: Try transaction hash correlation first (most reliable)
                if (round.vrf_transaction_hash) {
                  roundPayoutEvent = feePayoutEvents.find((event: any) => {
                    return (
                      event.transactionHash?.toLowerCase() ===
                      round.vrf_transaction_hash?.toLowerCase()
                    );
                  });

                  if (roundPayoutEvent) {
                    console.log(
                      `✅ Found payout via transaction hash correlation for round ${round.round_number} (tx: ${round.vrf_transaction_hash})`
                    );
                  } else {
                    console.log(
                      `⚠️ No payout event found with matching transaction hash ${round.vrf_transaction_hash} for round ${round.round_number}`
                    );
                  }
                }

                // Step 2b: Fallback to winner address + block range filtering
                if (!roundPayoutEvent) {
                  const winnerEvents = feePayoutEvents.filter((event: any) => {
                    const eventWinner = event.args?.[0]?.toLowerCase();
                    return eventWinner === round.winner_address?.toLowerCase();
                  });

                  console.log(
                    `🔍 Found ${winnerEvents.length} FeePayoutSuccess events for winner ${round.winner_address} in block range`
                  );

                  if (winnerEvents.length === 1) {
                    roundPayoutEvent = winnerEvents[0];
                    console.log(
                      `✅ Found single payout event for winner in block range for round ${round.round_number} (block: ${roundPayoutEvent.blockNumber})`
                    );
                  } else if (winnerEvents.length > 1) {
                    console.warn(
                      `⚠️ Multiple (${winnerEvents.length}) FeePayoutSuccess events found for winner ${round.winner_address} in block range - this may cause incorrect payout amounts`
                    );
                    // Use the first event but log the ambiguity
                    roundPayoutEvent = winnerEvents[0];
                    winnerEvents.forEach((evt: any, idx: number) => {
                      console.warn(
                        `   Event ${idx + 1}: tx=${
                          evt.transactionHash
                        }, block=${
                          evt.blockNumber
                        }, amount=${evt.args?.[1]?.toString()}`
                      );
                    });
                  } else {
                    console.warn(
                      `⚠️ No FeePayoutSuccess events found for winner ${round.winner_address} in block range for round ${round.round_number}`
                    );
                  }
                }

                // Extract payout amount if event found
                if (roundPayoutEvent) {
                  const amountWei = (roundPayoutEvent as any).args?.[1];
                  if (amountWei) {
                    // Convert wei to BNB
                    payoutAmount = ethers.formatEther(amountWei);

                    // Calculate USD value if BNB price is available
                    if (bnbPriceUsd > 0) {
                      payoutAmountUsd = parseFloat(payoutAmount) * bnbPriceUsd;
                    }

                    console.log(
                      `✅ Found payout in blockchain events for round ${round.round_number}: ${payoutAmount} BNB (source: Blockchain, tx: ${roundPayoutEvent.transactionHash}, block: ${roundPayoutEvent.blockNumber}, round_id: ${round.id})`
                    );
                  }
                }
              } catch (blockchainError) {
                console.warn(
                  `Failed to query blockchain events for round ${round.round_number}:`,
                  blockchainError
                );
              }
            }
          } catch (payoutError) {
            console.warn(
              `Failed to retrieve payout amount for round ${round.round_number}:`,
              payoutError
            );
          }

          // Get snapshot transaction hash from app_state table
          let snapshotTxHash = null;
          try {
            const snapshotTxKey = `round_${round.round_number}_snapshot_tx`;
            snapshotTxHash = await stateRepo.get(snapshotTxKey);
          } catch (snapshotError) {
            console.warn(
              `Failed to fetch snapshot TX hash for round ${round.round_number}:`,
              snapshotError
            );
          }

          results.push({
            roundNumber: round.round_number,
            winner: round.winner_address,
            winningTokenId: round.winner_token_id,
            totalEntries: uniqueEntries.length.toString(), // ✅ Use deduplicated count
            isCompleted: round.status === "completed",
            payoutAmount: payoutAmount, // BNB amount
            payoutAmountUsd: payoutAmountUsd, // USD amount (optional)
            snapshotTxHash: snapshotTxHash, // Snapshot transaction hash for BscScan link
            vrfTxHash: round.vrf_transaction_hash, // VRF requestRandomWinner transaction hash
            createdAt: round.created_at,
            updatedAt: round.updated_at,
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch lottery results"
      );
      console.error("Error fetching lottery results:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(
            error,
            "Failed to fetch lottery results"
          )
        );
    }
  },

  // Sync entries from current pool to active round
  async syncEntries(req: Request, res: Response): Promise<void> {
    try {
      // Audit log for admin action using new system
      const startTime = auditLogger.startTimer();
      auditAction(AuditActionType.SYNC_ENTRIES, req, {
        action: "manual_sync",
      });

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

      // Log successful entry sync using new system
      auditSuccess(
        AuditActionType.SYNC_ENTRIES,
        req,
        {
          round_id: activeRound.id,
          round_number: activeRound.round_number,
          synced_entries: syncedCount,
          action: "manual_sync",
        },
        startTime
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
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to sync entries"
      );
      console.error("Error syncing entries:", logDetails);
      res
        .status(500)
        .json(createErrorResponseWithMessage(error, "Failed to sync entries"));
    }
  },

  // Get current prize pool balance in BNB and USD
  async getPrizePool(req: Request, res: Response): Promise<void> {
    try {
      // Get contract balance in BNB
      const balance = await lottery.getAddress().then(async (address) => {
        const provider = lottery.runner?.provider;
        if (!provider) throw new Error("Provider not available");
        return await provider.getBalance(address);
      });

      const balanceBnb = ethers.formatEther(balance);
      const balanceBnbNumber = parseFloat(balanceBnb);

      // Fetch BNB price from CoinGecko API
      let bnbPriceUsd = 0;
      let prizePoolUsd = 0;

      try {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd"
        );

        if (response.ok) {
          const data = (await response.json()) as any;
          bnbPriceUsd = data.binancecoin?.usd || 0;
          prizePoolUsd = balanceBnbNumber * bnbPriceUsd;
        }
      } catch (priceError) {
        console.warn("Failed to fetch BNB price, using 0:", priceError);
      }

      res.json({
        success: true,
        data: {
          balance_bnb: balanceBnb,
          balance_wei: balance.toString(),
          bnb_price_usd: bnbPriceUsd,
          prize_pool_usd: prizePoolUsd,
          last_updated: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch prize pool"
      );
      console.error("Error fetching prize pool:", logDetails);
      res
        .status(500)
        .json(
          createErrorResponseWithMessage(error, "Failed to fetch prize pool")
        );
    }
  },
};
