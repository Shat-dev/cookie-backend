declare class RpcCache {
    private cache;
    set<T>(key: string, data: T, ttlSeconds?: number): void;
    get<T>(key: string): T | null;
    has(key: string): boolean;
    clear(): void;
    getStats(): {
        totalEntries: number;
        validEntries: number;
        expiredEntries: number;
    };
    cleanup(): void;
}
export declare const rpcCache: RpcCache;
export {};
//# sourceMappingURL=rpcCache.d.ts.map