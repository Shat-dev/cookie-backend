import pool from "./connection";

export interface SchedulerHeartbeat {
  service: string;
  last_run: Date;
  last_run_duration_ms: number | null;
  total_runs: number;
  total_errors: number;
  created_at: Date;
  updated_at: Date;
}

export interface SchedulerHealth {
  service: string;
  last_run: Date;
  age_seconds: number;
  last_run_duration_ms: number | null;
  total_runs: number;
  total_errors: number;
  status: "HEALTHY" | "WARNING" | "STALLED";
}

export class SchedulerRepository {
  /**
   * Update heartbeat for a service
   */
  async updateHeartbeat(service: string, durationMs?: number): Promise<void> {
    const query = `
      SELECT update_scheduler_heartbeat($1, $2)
    `;

    await pool.query(query, [service, durationMs]);
  }

  /**
   * Record an error for a service
   */
  async recordError(service: string): Promise<void> {
    const query = `
      SELECT record_scheduler_error($1)
    `;

    await pool.query(query, [service]);
  }

  /**
   * Get current health status for all services
   */
  async getHealthStatus(): Promise<SchedulerHealth[]> {
    const query = `
      SELECT * FROM scheduler_health
      ORDER BY age_seconds DESC
    `;

    const result = await pool.query(query);
    return result.rows.map((row) => ({
      ...row,
      last_run: new Date(row.last_run),
      age_seconds: parseFloat(row.age_seconds),
    }));
  }

  /**
   * Get health status for a specific service
   */
  async getServiceHealth(service: string): Promise<SchedulerHealth | null> {
    const query = `
      SELECT * FROM scheduler_health
      WHERE service = $1
    `;

    const result = await pool.query(query, [service]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      ...row,
      last_run: new Date(row.last_run),
      age_seconds: parseFloat(row.age_seconds),
    };
  }

  /**
   * Check if a service is stalled (no run in 2x expected interval)
   */
  async isServiceStalled(
    service: string,
    expectedIntervalMs: number
  ): Promise<boolean> {
    const health = await this.getServiceHealth(service);
    if (!health) return true; // No heartbeat record means stalled

    const maxAllowedAge = (expectedIntervalMs * 2) / 1000; // Convert to seconds
    return health.age_seconds > maxAllowedAge;
  }

  /**
   * Get services that are stalled
   */
  async getStalledServices(
    expectedIntervals: Record<string, number>
  ): Promise<string[]> {
    const stalled: string[] = [];

    for (const [service, intervalMs] of Object.entries(expectedIntervals)) {
      if (await this.isServiceStalled(service, intervalMs)) {
        stalled.push(service);
      }
    }

    return stalled;
  }

  /**
   * Clean up old heartbeat records (older than 30 days)
   */
  async cleanupOldRecords(): Promise<number> {
    const query = `
      DELETE FROM scheduler_heartbeats
      WHERE updated_at < NOW() - INTERVAL '30 days'
    `;

    const result = await pool.query(query);
    return result.rowCount || 0;
  }
}

export const schedulerRepository = new SchedulerRepository();
