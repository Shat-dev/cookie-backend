"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistributedLock = void 0;
exports.withLock = withLock;
const connection_1 = __importDefault(require("../db/connection"));
class DistributedLock {
    constructor(lockName) {
        this.acquired = false;
        this.lockName = lockName;
        this.lockId = this.hashStringToNumber(lockName);
    }
    hashStringToNumber(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    async acquire(timeoutMs = 15000) {
        try {
            const { rows } = await connection_1.default.query("SELECT pg_try_advisory_lock($1)", [
                this.lockId,
            ]);
            this.acquired = rows?.[0]?.pg_try_advisory_lock === true;
            if (this.acquired) {
                console.log(`🔒 Lock acquired: ${this.lockName} (ID: ${this.lockId})`);
            }
            else {
                console.log(`⏳ Lock busy: ${this.lockName} (ID: ${this.lockId})`);
            }
            return this.acquired;
        }
        catch (error) {
            console.error(`❌ Failed to acquire lock ${this.lockName}:`, error);
            return false;
        }
    }
    async release() {
        if (!this.acquired) {
            return;
        }
        try {
            await connection_1.default.query("SELECT pg_advisory_unlock($1)", [this.lockId]);
            console.log(`🔓 Lock released: ${this.lockName} (ID: ${this.lockId})`);
            this.acquired = false;
        }
        catch (error) {
            console.error(`❌ Failed to release lock ${this.lockName}:`, error);
        }
    }
    isAcquired() {
        return this.acquired;
    }
}
exports.DistributedLock = DistributedLock;
async function withLock(lockName, timeoutMs, fn) {
    const lock = new DistributedLock(lockName);
    const acquired = await lock.acquire(timeoutMs);
    if (!acquired) {
        console.warn(`⚠️ Could not acquire lock ${lockName} within ${timeoutMs}ms`);
        return null;
    }
    try {
        return await fn();
    }
    finally {
        await lock.release();
    }
}
//# sourceMappingURL=distributedLock.js.map