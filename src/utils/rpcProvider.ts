import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

interface RpcEndpoint {
  url: string;
  name: string;
  priority: number;
  maxRequestsPerMinute: number;
  currentRequests: number;
  lastReset: number;
}

interface NetworkConfig {
  chainId: number;
  name: string;
  endpoints: RpcEndpoint[];
}

class RobustRpcProvider {
  private endpoints: RpcEndpoint[];
  private providers: Map<string, ethers.JsonRpcProvider>;
  private currentProviderIndex: number = 0;
  private networkConfig: NetworkConfig;

  constructor() {
    // Determine which network to use
    const network = process.env.NETWORK || "base-sepolia";

    // Configure endpoints based on network
    if (network === "base-mainnet") {
      this.networkConfig = {
        chainId: 8453,
        name: "base-mainnet",
        endpoints: [
          {
            url: process.env.BASE_MAINNET_RPC_URL || "",
            name: "Alchemy Primary",
            priority: 1,
            maxRequestsPerMinute: 100,
            currentRequests: 0,
            lastReset: Date.now(),
          },
          {
            url: "https://mainnet.base.org",
            name: "Base Official",
            priority: 2,
            maxRequestsPerMinute: 200,
            currentRequests: 0,
            lastReset: Date.now(),
          },
          {
            url: "https://base-rpc.publicnode.com",
            name: "PublicNode",
            priority: 3,
            maxRequestsPerMinute: 150,
            currentRequests: 0,
            lastReset: Date.now(),
          },
        ],
      };
    } else {
      // Default to Base Sepolia
      this.networkConfig = {
        chainId: 84532,
        name: "base-sepolia",
        endpoints: [
          {
            url: process.env.BASE_SEPOLIA_RPC_URL || "",
            name: "Alchemy Primary",
            priority: 1,
            maxRequestsPerMinute: 100,
            currentRequests: 0,
            lastReset: Date.now(),
          },
          {
            url: "https://sepolia.base.org",
            name: "Base Official",
            priority: 2,
            maxRequestsPerMinute: 200,
            currentRequests: 0,
            lastReset: Date.now(),
          },
          {
            url: "https://base-sepolia-rpc.publicnode.com",
            name: "PublicNode",
            priority: 3,
            maxRequestsPerMinute: 150,
            currentRequests: 0,
            lastReset: Date.now(),
          },
          {
            url: "https://base-sepolia.blockpi.network/v1/rpc/public",
            name: "BlockPI",
            priority: 4,
            maxRequestsPerMinute: 100,
            currentRequests: 0,
            lastReset: Date.now(),
          },
        ],
      };
    }

    // Filter out endpoints without valid URLs
    this.endpoints = this.networkConfig.endpoints.filter(
      (endpoint) => endpoint.url
    );

    if (this.endpoints.length === 0) {
      throw new Error(
        `No valid RPC endpoints configured for ${network}. Please set ${
          network === "base-mainnet"
            ? "BASE_MAINNET_RPC_URL"
            : "BASE_SEPOLIA_RPC_URL"
        }`
      );
    }

    // Initialize providers
    this.providers = new Map();
    this.endpoints.forEach((endpoint) => {
      const provider = new ethers.JsonRpcProvider(endpoint.url, {
        name: this.networkConfig.name,
        chainId: this.networkConfig.chainId,
      });

      // Set timeouts
      provider.pollingInterval = 12000; // 12 seconds
      this.providers.set(endpoint.name, provider);
    });

    console.log(
      `🌐 Network: ${this.networkConfig.name} (Chain ID: ${this.networkConfig.chainId})`
    );
    console.log(`🔗 Initialized ${this.endpoints.length} RPC endpoints`);
  }

  private resetRateLimit(endpoint: RpcEndpoint) {
    const now = Date.now();
    if (now - endpoint.lastReset > 60000) {
      // Reset every minute
      endpoint.currentRequests = 0;
      endpoint.lastReset = now;
    }
  }

  private canMakeRequest(endpoint: RpcEndpoint): boolean {
    this.resetRateLimit(endpoint);
    return endpoint.currentRequests < endpoint.maxRequestsPerMinute;
  }

  private incrementRequestCount(endpoint: RpcEndpoint) {
    endpoint.currentRequests++;
  }

  private async executeWithRetry<T>(
    operation: (provider: ethers.JsonRpcProvider) => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    // Try each endpoint in priority order
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      for (const endpoint of this.endpoints.sort(
        (a, b) => a.priority - b.priority
      )) {
        if (!this.canMakeRequest(endpoint)) {
          console.warn(
            `⚠️ Rate limit reached for ${endpoint.name}, trying next endpoint`
          );
          continue;
        }

        const provider = this.providers.get(endpoint.name)!;

        try {
          this.incrementRequestCount(endpoint);
          console.log(`🔄 Attempt ${attempt + 1} using ${endpoint.name}`);

          const result = await Promise.race([
            operation(provider),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("RPC timeout")), 10000)
            ),
          ]);

          console.log(`✅ Success with ${endpoint.name}`);
          return result;
        } catch (error: any) {
          lastError = error;
          console.warn(
            `❌ ${endpoint.name} failed:`,
            error?.shortMessage || error?.message
          );

          // If it's a rate limit error, mark this endpoint as temporarily unavailable
          if (error?.code === "SERVER_ERROR" && error?.status === 429) {
            endpoint.currentRequests = endpoint.maxRequestsPerMinute; // Block this endpoint
          }
        }
      }

      // Wait before next attempt with exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error(
      `All RPC endpoints failed after ${maxRetries} attempts. Last error: ${
        lastError?.message || lastError
      }`
    );
  }

  async call<T>(
    operation: (provider: ethers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    return this.executeWithRetry(operation);
  }

  // Get a provider for contract instantiation (uses primary endpoint)
  getProvider(): ethers.JsonRpcProvider {
    return this.providers.get(this.endpoints[0].name)!;
  }

  // Get current endpoint status
  getStatus() {
    return this.endpoints.map((endpoint) => ({
      name: endpoint.name,
      available: this.canMakeRequest(endpoint),
      requestsUsed: endpoint.currentRequests,
      maxRequests: endpoint.maxRequestsPerMinute,
    }));
  }
}

// Export singleton instance
export const robustRpcProvider = new RobustRpcProvider();
export default robustRpcProvider;
