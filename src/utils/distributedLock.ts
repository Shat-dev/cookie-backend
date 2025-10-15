import pool from "../db/connection";

/**
 * Distributed lock using PostgreSQL advisory locks
 */
export class DistributedLock {
  private lockId: number;
  private lockName: string;
  private acquired: boolean = false;

  constructor(lockName: string) {
    this.lockName = lockName;
    // Convert lock name to a numeric ID using hash
    this.lockId = this.hashStringToNumber(lockName);
  }

  /**
   * Convert string to a numeric lock ID
   */
  private hashStringToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure positive number within PostgreSQL bigint range
    return Math.abs(hash);
  }

  /**
   * Attempt to acquire the lock with timeout
   */
  async acquire(timeoutMs: number = 15000): Promise<boolean> {
    try {
      const { rows } = await pool.query("SELECT pg_try_advisory_lock($1)", [
        this.lockId,
      ]);

      this.acquired = rows?.[0]?.pg_try_advisory_lock === true;

      if (this.acquired) {
        console.log(`🔒 Lock acquired: ${this.lockName} (ID: ${this.lockId})`);
      } else {
        console.log(`⏳ Lock busy: ${this.lockName} (ID: ${this.lockId})`);
      }

      return this.acquired;
    } catch (error) {
      console.error(`❌ Failed to acquire lock ${this.lockName}:`, error);
      return false;
    }
  }

  /**
   * Release the lock
   */
  async release(): Promise<void> {
    if (!this.acquired) {
      return;
    }

    try {
      await pool.query("SELECT pg_advisory_unlock($1)", [this.lockId]);
      console.log(`🔓 Lock released: ${this.lockName} (ID: ${this.lockId})`);
      this.acquired = false;
    } catch (error) {
      console.error(`❌ Failed to release lock ${this.lockName}:`, error);
    }
  }

  /**
   * Check if lock is currently held
   */
  isAcquired(): boolean {
    return this.acquired;
  }
}

/**
 * Helper function to execute code with a distributed lock
 */
export async function withLock<T>(
  lockName: string,
  timeoutMs: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const lock = new DistributedLock(lockName);

  const acquired = await lock.acquire(timeoutMs);
  if (!acquired) {
    console.warn(`⚠️ Could not acquire lock ${lockName} within ${timeoutMs}ms`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}
