"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getXStatus = exports.budget = exports.xLimiter = void 0;
class XRateLimiter {
    constructor() {
        this.buckets = new Map();
        this.pendingCalls = new Map();
        this.buckets.set("mentions", {
            capacity: 10,
            tokens: 10,
            refillRate: 10 / 900,
            lastRefill: Date.now(),
        });
        this.buckets.set("tweetLookup", {
            capacity: 15,
            tokens: 15,
            refillRate: 15 / 900,
            lastRefill: Date.now(),
        });
    }
    refillBucket(bucket) {
        const now = Date.now();
        const timePassed = (now - bucket.lastRefill) / 1000;
        const tokensToAdd = timePassed * bucket.refillRate;
        bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
    }
    consumeTokens(bucketName, cost) {
        const bucket = this.buckets.get(bucketName);
        if (!bucket) {
            throw new Error(`Unknown bucket: ${bucketName}`);
        }
        this.refillBucket(bucket);
        if (bucket.tokens >= cost) {
            bucket.tokens -= cost;
            return null;
        }
        const tokensNeeded = cost - bucket.tokens;
        const delayMs = Math.ceil((tokensNeeded / bucket.refillRate) * 1000);
        return delayMs;
    }
    async budget(bucketName, cost, fn) {
        const delay = this.consumeTokens(bucketName, cost);
        if (delay === null) {
            return await fn();
        }
        return new Promise((resolve, reject) => {
            const execute = async () => {
                try {
                    const result = await fn();
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            };
            setTimeout(execute, delay);
        });
    }
    getStatus() {
        const status = {};
        for (const [name, bucket] of this.buckets) {
            this.refillBucket(bucket);
            status[name] = {
                tokens: Math.floor(bucket.tokens * 100) / 100,
                capacity: bucket.capacity,
                refillRate: bucket.refillRate,
            };
        }
        return status;
    }
    forceRefill() {
        for (const bucket of this.buckets.values()) {
            bucket.tokens = bucket.capacity;
            bucket.lastRefill = Date.now();
        }
    }
}
exports.xLimiter = new XRateLimiter();
const budget = (bucketName, cost, fn) => exports.xLimiter.budget(bucketName, cost, fn);
exports.budget = budget;
const getXStatus = () => exports.xLimiter.getStatus();
exports.getXStatus = getXStatus;
//# sourceMappingURL=xLimiter.js.map