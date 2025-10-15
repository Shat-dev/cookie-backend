export declare class DistributedLock {
    private lockId;
    private lockName;
    private acquired;
    constructor(lockName: string);
    private hashStringToNumber;
    acquire(timeoutMs?: number): Promise<boolean>;
    release(): Promise<void>;
    isAcquired(): boolean;
}
export declare function withLock<T>(lockName: string, timeoutMs: number, fn: () => Promise<T>): Promise<T | null>;
//# sourceMappingURL=distributedLock.d.ts.map