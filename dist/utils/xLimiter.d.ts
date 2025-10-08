declare class XRateLimiter {
    private buckets;
    private pendingCalls;
    constructor();
    private refillBucket;
    private consumeTokens;
    budget<T>(bucketName: string, cost: number, fn: () => Promise<T>): Promise<T>;
    getStatus(): Record<string, {
        tokens: number;
        capacity: number;
        refillRate: number;
    }>;
    forceRefill(): void;
}
export declare const xLimiter: XRateLimiter;
export declare const budget: (bucketName: string, cost: number, fn: () => Promise<any>) => Promise<any>;
export declare const getXStatus: () => Record<string, {
    tokens: number;
    capacity: number;
    refillRate: number;
}>;
export {};
//# sourceMappingURL=xLimiter.d.ts.map