import { Request, Response } from "express";
import { WinnerRepository } from "../db/winnerRepository";
import { ApiResponse } from "../types";
import {
  auditAction,
  auditSuccess,
  auditFailure,
  AuditActionType,
  auditLogger,
  sanitizeErrorResponse,
  createErrorResponse,
} from "../utils/auditLogger";

const winnerRepo = new WinnerRepository();

export const winnerController = {
  // Get recent winners
  async getPreviousWinners(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const winners = await winnerRepo.getRecentWinners(limit);

      const response: ApiResponse<typeof winners> = {
        success: true,
        data: winners,
      };

      res.json(response);
    } catch (error: any) {
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to fetch previous winners"
      );
      console.error("Error fetching previous winners:", logDetails);
      const response: ApiResponse<null> = createErrorResponse(
        error,
        "Failed to fetch previous winners"
      );
      res.status(500).json(response);
    }
  },

  // Create a new winner (for admin/internal use)
  async createWinner(req: Request, res: Response): Promise<void> {
    const startTime = auditLogger.startTimer();

    try {
      const { drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl } =
        req.body;

      // Audit log for critical admin action
      auditAction(AuditActionType.CREATE_WINNER, req, {
        drawNumber,
        winnerAddress,
        prizeAmount,
        tokenId,
        imageUrl,
      });

      // Validate input
      if (
        !drawNumber ||
        !winnerAddress ||
        !prizeAmount ||
        !tokenId ||
        !imageUrl
      ) {
        const errorMsg =
          "All fields are required: drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl";

        auditFailure(
          AuditActionType.CREATE_WINNER,
          req,
          errorMsg,
          {
            drawNumber: !!drawNumber,
            winnerAddress: !!winnerAddress,
            prizeAmount: !!prizeAmount,
            tokenId: !!tokenId,
            imageUrl: !!imageUrl,
          },
          startTime
        );

        const response: ApiResponse<null> = {
          success: false,
          error: errorMsg,
        };
        res.status(400).json(response);
        return;
      }

      const newWinner = await winnerRepo.createWinner(
        drawNumber,
        winnerAddress,
        prizeAmount,
        tokenId,
        imageUrl
      );

      // Log successful winner creation
      auditSuccess(
        AuditActionType.CREATE_WINNER,
        req,
        {
          winnerId: newWinner.id,
          drawNumber,
          winnerAddress,
          prizeAmount,
          tokenId,
          created: true,
        },
        startTime
      );

      const response: ApiResponse<typeof newWinner> = {
        success: true,
        data: newWinner,
      };

      res.status(201).json(response);
    } catch (error: any) {
      const { logDetails } = sanitizeErrorResponse(
        error,
        "Failed to create winner"
      );
      console.error("Error creating winner:", logDetails);

      auditFailure(
        AuditActionType.CREATE_WINNER,
        req,
        logDetails.message || "Unknown error",
        {
          error: logDetails.message,
          stack: logDetails.stack?.split("\n")?.[0], // First line only for security
        },
        startTime
      );

      const response: ApiResponse<null> = createErrorResponse(
        error,
        "Failed to create winner"
      );
      res.status(500).json(response);
    }
  },
};
