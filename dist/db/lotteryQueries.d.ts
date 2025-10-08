import { LotteryRound, LotteryEntry, LotteryWinner, LotteryStats } from "../types/lottery";
export declare const lotteryQueries: {
    createRound(roundNumber: number, startTime: Date, endTime?: Date): Promise<LotteryRound>;
    getRound(roundId: number): Promise<LotteryRound | null>;
    getRoundByNumber(roundNumber: number): Promise<LotteryRound | null>;
    getActiveRound(): Promise<LotteryRound | null>;
    getAllRounds(): Promise<LotteryRound[]>;
    updateRoundStatus(roundId: number, status: string, winnerAddress?: string, winnerTokenId?: string): Promise<void>;
    getNextRoundNumber(): Promise<number>;
    addEntry(roundId: number, walletAddress: string, tokenId: string, imageUrl: string, tweetUrl?: string): Promise<LotteryEntry>;
    getRoundEntries(roundId: number): Promise<LotteryEntry[]>;
    getEntry(roundId: number, walletAddress: string, tokenId: string): Promise<LotteryEntry | null>;
    removeEntry(roundId: number, walletAddress: string, tokenId: string): Promise<void>;
    addWinner(roundId: number, walletAddress: string, tokenId: string, imageUrl: string, prizeAmount?: string): Promise<LotteryWinner>;
    getWinners(limit?: number): Promise<LotteryWinner[]>;
    getRoundWinner(roundId: number): Promise<LotteryWinner | null>;
    getLotteryStats(): Promise<LotteryStats>;
    syncEntriesFromCurrentPool(roundId: number): Promise<number>;
};
//# sourceMappingURL=lotteryQueries.d.ts.map