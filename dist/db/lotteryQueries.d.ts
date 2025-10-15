import { LotteryRound, LotteryEntry, LotteryWinner, LotteryStats } from "../types/lottery";
export declare const lotteryQueries: {
    createRound(roundNumber: number, startTime: Date, endTime?: Date): Promise<LotteryRound>;
    getRound(roundId: number): Promise<LotteryRound | null>;
    getRoundByNumber(roundNumber: number): Promise<LotteryRound | null>;
    getActiveRound(): Promise<LotteryRound | null>;
    getAllRounds(): Promise<LotteryRound[]>;
    getNextRoundNumber(): Promise<number>;
    updateFundsAdmin(roundId: number, fundsAdminAddress: string): Promise<void>;
    getFundsAdmin(roundId: number): Promise<string | null>;
    updateDrawInterval(roundId: number, intervalHours: number): Promise<void>;
    getDrawInterval(roundId: number): Promise<number | null>;
    recordPayout(winnerId: number, amount: string): Promise<void>;
    updatePayoutStatus(winnerId: number, status: "pending" | "success" | "failed", failureReason?: string): Promise<void>;
    getPayoutHistory(limit?: number): Promise<LotteryWinner[]>;
    recordFailedDraw(roundId: number, reason: string): Promise<void>;
    addEntry(roundId: number, walletAddress: string, tokenId: string, imageUrl: string, tweetUrl?: string): Promise<LotteryEntry>;
    getRoundEntries(roundId: number): Promise<LotteryEntry[]>;
    getEntry(roundId: number, walletAddress: string, tokenId: string): Promise<LotteryEntry | null>;
    removeEntry(roundId: number, walletAddress: string, tokenId: string): Promise<void>;
    addWinner(roundId: number, walletAddress: string, tokenId: string, imageUrl: string, prizeAmount?: string, payoutAmount?: string, payoutStatus?: "pending" | "success" | "failed"): Promise<LotteryWinner>;
    getWinners(limit?: number): Promise<LotteryWinner[]>;
    getRoundWinner(roundId: number): Promise<LotteryWinner | null>;
    getLotteryStats(): Promise<LotteryStats>;
    syncEntriesFromCurrentPool(roundId: number): Promise<number>;
};
//# sourceMappingURL=lotteryQueries.d.ts.map