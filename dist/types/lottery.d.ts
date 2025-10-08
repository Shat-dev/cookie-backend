export interface LotteryRound {
    id: number;
    round_number: number;
    status: "active" | "drawing" | "completed";
    start_time: Date;
    end_time?: Date;
    draw_time?: Date;
    winner_address?: string;
    winner_token_id?: string;
    total_entries: number;
    created_at: Date;
    updated_at: Date;
}
export interface LotteryEntry {
    id: number;
    round_id: number;
    wallet_address: string;
    token_id: string;
    image_url: string;
    tweet_url?: string;
    verified: boolean;
    created_at: Date;
}
export interface LotteryWinner {
    id: number;
    round_id: number;
    wallet_address: string;
    token_id: string;
    image_url: string;
    prize_amount?: string;
    created_at: Date;
}
export interface CreateRoundRequest {
    start_time: Date;
    end_time?: Date;
}
export interface DrawWinnerRequest {
    round_id: number;
}
export interface LotteryStats {
    total_rounds: number;
    active_rounds: number;
    total_winners: number;
    total_entries: number;
    current_round?: LotteryRound;
}
//# sourceMappingURL=lottery.d.ts.map