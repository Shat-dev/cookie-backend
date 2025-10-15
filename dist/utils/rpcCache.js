"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcCache = void 0;
class RpcCache {
    constructor() {
        this.cache = new Map();
    }
    set(key, data, ttlSeconds = 30) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: ttlSeconds * 1000,
        });
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return null;
        const now = Date.now();
        if (now - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        return entry.data;
    }
    has(key) {
        return this.get(key) !== null;
    }
    clear() {
        this.cache.clear();
    }
    delete(key) {
        return this.cache.delete(key);
    }
    invalidateRound(roundNumber) {
        const roundKey = `round_${roundNumber}`;
        if (this.cache.has(roundKey)) {
            this.cache.delete(roundKey);
            console.log(`🔄 Cache invalidated for round ${roundNumber} due to VRF event`);
        }
    }
    invalidateEventCaches() {
        let invalidatedCount = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith("events_")) {
                this.cache.delete(key);
                invalidatedCount++;
            }
        }
        if (invalidatedCount > 0) {
            console.log(`🔄 Invalidated ${invalidatedCount} event cache entries due to new blockchain events`);
        }
    }
    getStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                expiredEntries++;
            }
            else {
                validEntries++;
            }
        }
        return {
            totalEntries: this.cache.size,
            validEntries,
            expiredEntries,
        };
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }
}
exports.rpcCache = new RpcCache();
setInterval(() => {
    exports.rpcCache.cleanup();
}, 5 * 60 * 1000);
//# sourceMappingURL=rpcCache.js.map