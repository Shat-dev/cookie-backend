"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppStateRepository = void 0;
class AppStateRepository {
    constructor(pool) {
        this.pool = pool;
    }
    async get(key) {
        const { rows } = await this.pool.query(`SELECT value FROM app_state WHERE key = $1`, [key]);
        return rows[0]?.value ?? null;
    }
    async set(key, value) {
        await this.pool.query(`INSERT INTO app_state (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
    }
}
exports.AppStateRepository = AppStateRepository;
//# sourceMappingURL=appStateRepository.js.map