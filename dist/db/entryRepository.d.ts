import { EntryToken } from "../types";
export interface EntryRow {
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
export declare class EntryRepository {
    private readonly db;
    constructor(db?: import("pg").Pool);
    getAllEntries(): Promise<EntryToken[]>;
    upsertTokenEntry(entry: {
        tweet_id: string;
        wallet_address: string;
        token_id: string;
        tweet_url: string;
        image_url?: string | null;
        verified?: boolean | null;
    }): Promise<void>;
    upsertManyTokenEntries(args: {
        tweet_id: string;
        wallet_address: string;
        token_ids: string[];
        tweet_url: string;
        imageUrlForToken?: (tokenId: string) => string | null;
        verified?: boolean;
    }): Promise<void>;
    deleteEntriesByTweetId(tweetId: string): Promise<void>;
    doesTweetStillExist(tweetId: string): Promise<boolean>;
    getTokenIdsOwnedBy(walletAddress: string): Promise<string[]>;
    selectUnpushed(limit?: number): Promise<EntryRow[]>;
    markPushed(entryIds: number[], round: number, txHash: string): Promise<void>;
    countUnpushed(): Promise<number>;
    clearAllEntries(): Promise<number>;
    selectEligiblePool(): Promise<Array<{
        wallet_address: string;
        token_id: string;
        tweet_id: string;
        created_at: string;
        tweet_url: string;
    }>>;
    getDistinctTweetIds(limit?: number): Promise<string[]>;
    countDistinctTweetIds(): Promise<number>;
    poolIsNonEmpty(): Promise<boolean>;
    upsertMissingTokensForTweet(args: {
        tweet_id: string;
        wallet_address: string;
        tweet_url: string;
        token_ids: string[];
        imageUrlForToken?: (tokenId: string) => string | null;
        verified?: boolean;
    }): Promise<number>;
}
export declare const entryRepository: EntryRepository;
//# sourceMappingURL=entryRepository.d.ts.map