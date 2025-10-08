import { Winner } from "../types";
export declare class WinnerRepository {
    private readonly db;
    constructor(db?: import("pg").Pool);
    getRecentWinners(limit?: number): Promise<Winner[]>;
    createWinner(drawNumber: number, winnerAddress: string, prizeAmount: string, tokenId: string, imageUrl: string): Promise<Winner>;
    getWinnersByDraw(drawNumber: number): Promise<Winner[]>;
    deleteWinnersByDraw(drawNumber: number): Promise<void>;
    getAllDrawNumbers(): Promise<number[]>;
}
//# sourceMappingURL=winnerRepository.d.ts.map