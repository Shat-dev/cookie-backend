/**
 * Token bucket rate limiter for Twitter API calls
 * Prevents blocking the event loop while respecting rate limits
 */

interface TokenBucket {
  capacity: number;
  tokens: number;
  refillRate: number; // tokens per second
  lastRefill: number;
}

class XRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private pendingCalls: Map<string, Array<() => void>> = new Map();

  constructor() {
    // Mentions: 10 requests per 15 minutes = 10/900 = 0.0111 tokens/sec
    this.buckets.set("mentions", {
      capacity: 10,
      tokens: 10,
      refillRate: 10 / 900,
      lastRefill: Date.now(),
    });

    // Tweet lookup: 15 requests per 15 minutes = 15/900 = 0.0167 tokens/sec
    this.buckets.set("tweetLookup", {
      capacity: 15,
      tokens: 15,
      refillRate: 15 / 900,
      lastRefill: Date.now(),
    });
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = (now - bucket.lastRefill) / 1000; // seconds
    const tokensToAdd = timePassed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Consume tokens from a bucket, returns delay in ms if no tokens available
   */
  private consumeTokens(bucketName: string, cost: number): number | null {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) {
      throw new Error(`Unknown bucket: ${bucketName}`);
    }

    this.refillBucket(bucket);

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return null; // No delay needed
    }

    // Calculate when we'll have enough tokens
    const tokensNeeded = cost - bucket.tokens;
    const delayMs = Math.ceil((tokensNeeded / bucket.refillRate) * 1000);

    return delayMs;
  }

  /**
   * Wait for budget to be available, then execute the call
   */
  async budget<T>(
    bucketName: string,
    cost: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const delay = this.consumeTokens(bucketName, cost);

    if (delay === null) {
      // We have tokens, execute immediately
      return await fn();
    }

    // No tokens available, schedule for later
    return new Promise((resolve, reject) => {
      const execute = async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      // Schedule execution after delay
      setTimeout(execute, delay);
    });
  }

  /**
   * Get current token counts for monitoring
   */
  getStatus(): Record<
    string,
    { tokens: number; capacity: number; refillRate: number }
  > {
    const status: Record<
      string,
      { tokens: number; capacity: number; refillRate: number }
    > = {};

    for (const [name, bucket] of this.buckets) {
      this.refillBucket(bucket);
      status[name] = {
        tokens: Math.floor(bucket.tokens * 100) / 100, // Round to 2 decimal places
        capacity: bucket.capacity,
        refillRate: bucket.refillRate,
      };
    }

    return status;
  }

  /**
   * Force refill all buckets (useful for testing)
   */
  forceRefill(): void {
    for (const bucket of this.buckets.values()) {
      bucket.tokens = bucket.capacity;
      bucket.lastRefill = Date.now();
    }
  }
}

// Export singleton instance
export const xLimiter = new XRateLimiter();

// Convenience functions
export const budget = (
  bucketName: string,
  cost: number,
  fn: () => Promise<any>
) => xLimiter.budget(bucketName, cost, fn);

export const getXStatus = () => xLimiter.getStatus();
