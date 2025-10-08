import { Request, Response } from "express";
import { WinnerRepository } from "../db/winnerRepository";
import { ApiResponse } from "../types";

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
    } catch (error) {
      console.error("Error fetching previous winners:", error);
      const response: ApiResponse<null> = {
        success: false,
        error: "Failed to fetch previous winners",
      };
      res.status(500).json(response);
    }
  },

  // Create a new winner (for admin/internal use)
  async createWinner(req: Request, res: Response): Promise<void> {
    try {
      const { drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl } =
        req.body;

      // Validate input
      if (
        !drawNumber ||
        !winnerAddress ||
        !prizeAmount ||
        !tokenId ||
        !imageUrl
      ) {
        const response: ApiResponse<null> = {
          success: false,
          error:
            "All fields are required: drawNumber, winnerAddress, prizeAmount, tokenId, imageUrl",
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

      const response: ApiResponse<typeof newWinner> = {
        success: true,
        data: newWinner,
      };

      res.status(201).json(response);
    } catch (error) {
      console.error("Error creating winner:", error);
      const response: ApiResponse<null> = {
        success: false,
        error: "Failed to create winner",
      };
      res.status(500).json(response);
    }
  },
};
