type Key = "mentions" | "lookup";
export declare function beforeCall(key: Key): Promise<void>;
export declare function afterCall(key: Key, headers: any): void;
export declare function record429(key: Key, headers: any): void;
export declare function spacingMs(key: Key, targetCallsPerWindow: number): number;
export {};
//# sourceMappingURL=rateLimiter.d.ts.map