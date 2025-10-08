import { ethers } from "ethers";
declare class RobustRpcProvider {
    private endpoints;
    private providers;
    private currentProviderIndex;
    private networkConfig;
    constructor();
    private resetRateLimit;
    private canMakeRequest;
    private incrementRequestCount;
    private executeWithRetry;
    call<T>(operation: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T>;
    getProvider(): ethers.JsonRpcProvider;
    getStatus(): {
        name: string;
        available: boolean;
        requestsUsed: number;
        maxRequests: number;
    }[];
}
export declare const robustRpcProvider: RobustRpcProvider;
export default robustRpcProvider;
//# sourceMappingURL=rpcProvider.d.ts.map