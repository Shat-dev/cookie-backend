"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.robustRpcProvider = void 0;
const ethers_1 = require("ethers");
const dotenv_1 = __importDefault(require("dotenv"));
const networkConfig_1 = require("./networkConfig");
dotenv_1.default.config();
function getEnv(name, defaultValue) {
    return process.env[name] || defaultValue;
}
class RobustRpcProvider {
    constructor() {
        this.currentProviderIndex = 0;
        const RPC_URL_2 = getEnv("RPC_URL_2", "");
        const RPC_URL_3 = getEnv("RPC_URL_3", "");
        const RPC_URL_4 = getEnv("RPC_URL_4", "");
        const endpoints = [
            {
                url: networkConfig_1.RPC_URL,
                name: "Primary RPC",
                priority: 1,
                maxRequestsPerMinute: 100,
                currentRequests: 0,
                lastReset: Date.now(),
            },
        ];
        if (RPC_URL_2) {
            endpoints.push({
                url: RPC_URL_2,
                name: "Fallback RPC 2",
                priority: 2,
                maxRequestsPerMinute: 200,
                currentRequests: 0,
                lastReset: Date.now(),
            });
        }
        if (RPC_URL_3) {
            endpoints.push({
                url: RPC_URL_3,
                name: "Fallback RPC 3",
                priority: 3,
                maxRequestsPerMinute: 150,
                currentRequests: 0,
                lastReset: Date.now(),
            });
        }
        if (RPC_URL_4) {
            endpoints.push({
                url: RPC_URL_4,
                name: "Fallback RPC 4",
                priority: 4,
                maxRequestsPerMinute: 100,
                currentRequests: 0,
                lastReset: Date.now(),
            });
        }
        this.networkConfig = {
            chainId: networkConfig_1.CHAIN_ID,
            name: networkConfig_1.NETWORK_NAME,
            endpoints,
        };
        this.endpoints = this.networkConfig.endpoints.filter((endpoint) => endpoint.url);
        if (this.endpoints.length === 0) {
            throw new Error(`No valid RPC endpoints configured for ${networkConfig_1.NETWORK_NAME}. Please set RPC_URL`);
        }
        this.providers = new Map();
        this.endpoints.forEach((endpoint) => {
            const provider = new ethers_1.ethers.JsonRpcProvider(endpoint.url, {
                name: this.networkConfig.name,
                chainId: this.networkConfig.chainId,
            });
            provider.pollingInterval = 12000;
            this.providers.set(endpoint.name, provider);
        });
        console.log(`🌐 Network: ${this.networkConfig.name} (Chain ID: ${this.networkConfig.chainId})`);
        console.log(`🔗 Initialized ${this.endpoints.length} RPC endpoints`);
    }
    resetRateLimit(endpoint) {
        const now = Date.now();
        if (now - endpoint.lastReset > 60000) {
            endpoint.currentRequests = 0;
            endpoint.lastReset = now;
        }
    }
    canMakeRequest(endpoint) {
        this.resetRateLimit(endpoint);
        return endpoint.currentRequests < endpoint.maxRequestsPerMinute;
    }
    incrementRequestCount(endpoint) {
        endpoint.currentRequests++;
    }
    async executeWithRetry(operation, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            for (const endpoint of this.endpoints.sort((a, b) => a.priority - b.priority)) {
                if (!this.canMakeRequest(endpoint)) {
                    console.warn(`⚠️ Rate limit reached for ${endpoint.name}, trying next endpoint`);
                    continue;
                }
                const provider = this.providers.get(endpoint.name);
                try {
                    this.incrementRequestCount(endpoint);
                    console.log(`🔄 Attempt ${attempt + 1} using ${endpoint.name}`);
                    const result = await Promise.race([
                        operation(provider),
                        new Promise((_, reject) => setTimeout(() => reject(new Error("RPC timeout")), 10000)),
                    ]);
                    console.log(`✅ Success with ${endpoint.name}`);
                    return result;
                }
                catch (error) {
                    lastError = error;
                    console.warn(`❌ ${endpoint.name} failed:`, error?.shortMessage || error?.message);
                    if (error?.code === "SERVER_ERROR" && error?.status === 429) {
                        endpoint.currentRequests = endpoint.maxRequestsPerMinute;
                    }
                }
            }
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        throw new Error(`All RPC endpoints failed after ${maxRetries} attempts. Last error: ${lastError?.message || lastError}`);
    }
    async call(operation) {
        return this.executeWithRetry(operation);
    }
    getProvider() {
        return this.providers.get(this.endpoints[0].name);
    }
    getStatus() {
        return this.endpoints.map((endpoint) => ({
            name: endpoint.name,
            available: this.canMakeRequest(endpoint),
            requestsUsed: endpoint.currentRequests,
            maxRequests: endpoint.maxRequestsPerMinute,
        }));
    }
}
exports.robustRpcProvider = new RobustRpcProvider();
exports.default = exports.robustRpcProvider;
//# sourceMappingURL=rpcProvider.js.map