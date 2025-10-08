import { Request, Response } from "express";
import { ethers } from "ethers";
import { lottery, getRound, RoundData } from "../lotteryClient";
import { entryRepository } from "../db/entryRepository";

export const automationController = {
  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const [enabled, nextAt, currentRound, unpushedCount] = await Promise.all([
        lottery.s_automationEnabled(),
        lottery.s_nextAllowedPerformAt(),
        lottery.s_currentRound(),
        entryRepository.countUnpushed(),
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

      // Check if we have an active round
      let activeRound = null;
      let needsRoundCreation = false;

      if (currentRound > 0n) {
        try {
          const rd = await getRound(Number(currentRound));
          const now = BigInt(currentTime);
          if (
            rd.isActive &&
            BigInt(rd.start) <= now &&
            BigInt(rd.end) > now &&
            !rd.isCompleted
          ) {
            activeRound = {
              round: Number(currentRound),
              startTime: Number(rd.start),
              endTime: Number(rd.end),
              totalEntries: Number(rd.totalEntries),
              secondsRemaining: Number(BigInt(rd.end) - now),
            };
          }
        } catch {}
      }

      // If no active round and we have unpushed entries, we need to create a round
      if (!activeRound && unpushedCount > 0) {
        needsRoundCreation = true;
      }

      res.json({
        success: true,
        data: {
          automationEnabled: enabled,
          currentRound: Number(currentRound),
          upkeepNeeded,
          reason: reason || undefined,
          nextAllowedPerformAt: nextAllowedTime,
          timeUntilNext,
          activeRound,
          needsRoundCreation,
          unpushedEntries: unpushedCount,
        },
      });
    } catch (error: any) {
      console.error("Error getting automation status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get automation status",
      });
    }
  },

  async getUnifiedStatus(_req: Request, res: Response): Promise<void> {
    try {
      const [enabled, nextAt, currentRound, unpushedCount] = await Promise.all([
        lottery.s_automationEnabled(),
        lottery.s_nextAllowedPerformAt(),
        lottery.s_currentRound(),
        entryRepository.countUnpushed(),
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

      // Check if we have an active round
      let activeRound = null;
      let roundData = null;

      if (currentRound > 0n) {
        try {
          const rd = await getRound(Number(currentRound));
          const now = BigInt(currentTime);
          if (
            rd.isActive &&
            BigInt(rd.start) <= now &&
            BigInt(rd.end) > now &&
            !rd.isCompleted
          ) {
            activeRound = {
              round: Number(currentRound),
              startTime: Number(rd.start),
              endTime: Number(rd.end),
              totalEntries: Number(rd.totalEntries),
              secondsRemaining: Number(BigInt(rd.end) - now),
            };

            roundData = {
              roundNumber: Number(currentRound),
              startTime: Number(rd.start),
              endTime: Number(rd.end),
              isActive: true,
              timeLeft: Number(BigInt(rd.end) - now),
              totalEntries: Number(rd.totalEntries),
            };
          }
        } catch (error) {
          console.error("Error fetching round data:", error);
        }
      }

      // Automation status object
      const automation = {
        automationEnabled: enabled,
        currentRound: Number(currentRound),
        upkeepNeeded,
        reason: reason || undefined,
        nextAllowedPerformAt: nextAllowedTime,
        timeUntilNext,
        activeRound,
        unpushedEntries: unpushedCount,
      };

      res.json({
        success: true,
        data: {
          automation,
          roundData,
        },
      });
    } catch (error: any) {
      console.error("Error getting unified status:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get unified status",
      });
    }
  },

  async getNextDraw(_req: Request, res: Response): Promise<void> {
    try {
      const currentRound = await lottery.s_currentRound();
      const currentTime = Math.floor(Date.now() / 1000);

      if (currentRound > 0n) {
        const rd = await getRound(Number(currentRound));
        const now = BigInt(currentTime);

        if (
          rd.isActive &&
          BigInt(rd.start) <= now &&
          BigInt(rd.end) > now &&
          !rd.isCompleted
        ) {
          const endTime = Number(rd.end);
          const secondsRemaining = endTime - currentTime;

          // Get database entry count (what will actually be used in next lottery)
          const databaseEntries = await entryRepository.getAllEntries();

          // Deduplicate entries by wallet and token (same logic as current-pool API)
          const byWallet = new Map<string, Set<string>>();
          for (const r of databaseEntries) {
            const w = r.wallet_address.toLowerCase();
            if (!byWallet.has(w)) byWallet.set(w, new Set());
            byWallet.get(w)!.add(r.token_id);
          }

          // Count unique tokens across all wallets
          const actualEntryCount = Array.from(byWallet.values()).reduce(
            (total, tokenSet) => total + tokenSet.size,
            0
          );

          res.json({
            success: true,
            data: {
              hasActiveDraw: true,
              round: Number(currentRound),
              drawTime: endTime,
              secondsRemaining: Math.max(0, secondsRemaining),
              totalEntries: actualEntryCount, // Use database count instead of on-chain count
              onChainEntries: Number(rd.totalEntries), // Keep original for reference
            },
          });
          return;
        }
      }

      // No active round
      const unpushedCount = await entryRepository.countUnpushed();
      res.json({
        success: true,
        data: {
          hasActiveDraw: false,
          message:
            unpushedCount > 0
              ? "No active round. First entry will create a new round."
              : "No active round and no pending entries.",
        },
      });
    } catch (error: any) {
      console.error("Error getting next draw:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get next draw info",
      });
    }
  },

  async getSchedule(_req: Request, res: Response): Promise<void> {
    try {
      const currentRound = await lottery.s_currentRound();
      const currentTime = Math.floor(Date.now() / 1000);
      const schedule = [];

      if (currentRound > 0n) {
        const rd = await getRound(Number(currentRound));
        const now = BigInt(currentTime);

        if (
          rd.isActive &&
          BigInt(rd.start) <= now &&
          BigInt(rd.end) > now &&
          !rd.isCompleted
        ) {
          schedule.push({
            round: Number(currentRound),
            type: "draw",
            scheduledTime: Number(rd.end),
            status: "scheduled",
            totalEntries: Number(rd.totalEntries),
          });
        }
      }

      res.json({
        success: true,
        data: {
          schedule,
          message:
            schedule.length === 0
              ? "No scheduled draws. Rounds are created on first entry."
              : undefined,
        },
      });
    } catch (error: any) {
      console.error("Error getting schedule:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get schedule",
      });
    }
  },
};
