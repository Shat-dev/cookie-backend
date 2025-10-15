import { Winner } from "../types";
export declare class WinnerRepository {
    private readonly db;
    constructor(db?: import("pg").Pool);
    getRecentWinners(limit?: number): Promise<Winner[]>;
    createWinner(drawNumber: number, winnerAddress: string, prizeAmount: string, tokenId: string, imageUrl: string, payoutAmount?: string, payoutStatus?: "pending" | "success" | "failed", payoutFailureReason?: string): Promise<Winner>;
    updatePayoutStatus(winnerId: number, status: "pending" | "success" | "failed", payoutAmount?: string, failureReason?: string): Promise<Winner | null>;
    getPayoutsByStatus(status: "pending" | "success" | "failed", limit?: number): Promise<Winner[]>;
    getFailedPayouts(limit?: number): Promise<Winner[]>;
    getWinnersByDraw(drawNumber: number): Promise<Winner[]>;
    deleteWinnersByDraw(drawNumber: number): Promise<void>;
    getAllDrawNumbers(): Promise<number[]>;
}
//# sourceMappingURL=winnerRepository.d.ts.map