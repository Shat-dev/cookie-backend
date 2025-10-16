import { LotteryRound, LotteryEntry, LotteryWinner, LotteryStats } from "../types/lottery";
export declare const lotteryQueries: {
    createRound(roundNumber: number): Promise<LotteryRound>;
    getRound(roundId: number): Promise<LotteryRound | null>;
    getRoundByNumber(roundNumber: number): Promise<LotteryRound | null>;
    getActiveRound(): Promise<LotteryRound | null>;
    getAllRounds(): Promise<LotteryRound[]>;
    getNextRoundNumber(): Promise<number>;
    completeRound(roundId: number, winnerAddress: string, winnerTokenId: string): Promise<void>;
    recordFailedDraw(roundId: number, reason: string): Promise<void>;
    addEntry(roundId: number, walletAddress: string, tokenId: string, imageUrl: string, tweetUrl?: string): Promise<LotteryEntry>;
    getRoundEntries(roundId: number): Promise<LotteryEntry[]>;
    getEntry(roundId: number, walletAddress: string, tokenId: string): Promise<LotteryEntry | null>;
    removeEntry(roundId: number, walletAddress: string, tokenId: string): Promise<void>;
    addWinner(roundId: number, walletAddress: string, tokenId: string, imageUrl: string, prizeAmount?: string, payoutAmount?: string, payoutStatus?: "pending" | "success" | "failed"): Promise<LotteryWinner>;
    updatePayoutStatus(winnerId: number, status: "pending" | "success" | "failed", failureReason?: string): Promise<void>;
    recordPayout(winnerId: number, amount: string): Promise<void>;
    getPayoutHistory(limit?: number): Promise<LotteryWinner[]>;
    getRoundWinner(roundId: number): Promise<LotteryWinner | null>;
    getRecentWinners(limit?: number): Promise<LotteryWinner[]>;
    getLotteryStats(): Promise<LotteryStats>;
    syncEntriesFromCurrentPool(roundId: number): Promise<number>;
    updateFundsAdmin(roundId: number, fundsAdminAddress: string): Promise<void>;
    getFundsAdmin(roundId: number): Promise<string | null>;
    getWinners(limit?: number): Promise<LotteryWinner[]>;
};
//# sourceMappingURL=lotteryQueries.d.ts.map