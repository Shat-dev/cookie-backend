import { Pool } from "pg";

export class AppStateRepository {
  constructor(private pool: Pool) {}

  async get(key: string): Promise<string | null> {
    const { rows } = await this.pool.query(
      `SELECT value FROM app_state WHERE key = $1`,
      [key]
    );
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO app_state (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }

  async del(key: string): Promise<void> {
    await this.pool.query(`DELETE FROM app_state WHERE key = $1`, [key]);
  }
}
