export declare class TwitterService {
    private bearerToken;
    constructor();
    doesTweetStillExist(tweetId: string): Promise<boolean>;
    getTweetText(tweetId: string): Promise<string | null>;
    getTweetsByIds(ids: string[]): Promise<Set<string>>;
    getMentions(userId: string, params: Record<string, any>): Promise<any>;
}
//# sourceMappingURL=twitterService.d.ts.map