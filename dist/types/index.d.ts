export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}
export interface EntryToken {
    id: number;
    tweet_id: string;
    wallet_address: string;
    token_id: string;
    image_url: string | null;
    verified: boolean | null;
    tweet_url: string;
    created_at: string;
    pushed_round?: number | null;
    pushed_tx?: string | null;
    pushed_at?: string | null;
}
export interface Winner {
    id: number;
    draw_number: number;
    winner_address: string;
    prize_amount: string;
    token_id: string;
    image_url: string;
    created_at: Date;
}
export interface SubmitEntryRequest {
    tokenId: string;
}
export interface VerifyEntryRequest {
    tweetUrl: string;
    walletAddress: string;
    tokenId: string;
}
export interface UpsertEntriesPayload {
    tweet_id: string;
    wallet_address: string;
    token_ids: string[];
    tweet_url: string;
}
//# sourceMappingURL=index.d.ts.map