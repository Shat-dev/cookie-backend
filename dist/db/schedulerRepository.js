"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulerRepository = exports.SchedulerRepository = void 0;
const connection_1 = __importDefault(require("./connection"));
class SchedulerRepository {
    async updateHeartbeat(service, durationMs) {
        const query = `
      SELECT update_scheduler_heartbeat($1, $2)
    `;
        await connection_1.default.query(query, [service, durationMs]);
    }
    async recordError(service) {
        const query = `
      SELECT record_scheduler_error($1)
    `;
        await connection_1.default.query(query, [service]);
    }
    async getHealthStatus() {
        const query = `
      SELECT * FROM scheduler_health
      ORDER BY age_seconds DESC
    `;
        const result = await connection_1.default.query(query);
        return result.rows.map((row) => ({
            ...row,
            last_run: new Date(row.last_run),
            age_seconds: parseFloat(row.age_seconds),
        }));
    }
    async getServiceHealth(service) {
        const query = `
      SELECT * FROM scheduler_health
      WHERE service = $1
    `;
        const result = await connection_1.default.query(query, [service]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        return {
            ...row,
            last_run: new Date(row.last_run),
            age_seconds: parseFloat(row.age_seconds),
        };
    }
    async isServiceStalled(service, expectedIntervalMs) {
        const health = await this.getServiceHealth(service);
        if (!health)
            return true;
        const maxAllowedAge = (expectedIntervalMs * 2) / 1000;
        return health.age_seconds > maxAllowedAge;
    }
    async getStalledServices(expectedIntervals) {
        const stalled = [];
        for (const [service, intervalMs] of Object.entries(expectedIntervals)) {
            if (await this.isServiceStalled(service, intervalMs)) {
                stalled.push(service);
            }
        }
        return stalled;
    }
    async cleanupOldRecords() {
        const query = `
      DELETE FROM scheduler_heartbeats
      WHERE updated_at < NOW() - INTERVAL '30 days'
    `;
        const result = await connection_1.default.query(query);
        return result.rowCount || 0;
    }
}
exports.SchedulerRepository = SchedulerRepository;
exports.schedulerRepository = new SchedulerRepository();
//# sourceMappingURL=schedulerRepository.js.map