import pool from "../db/connection";

export interface CountdownState {
  id: number;
  phase: "starting" | "countdown" | "selecting" | "winner" | "new_round";
  ends_at: Date | null;
  is_active: boolean;
  updated_at: Date;
}

/**
 * Get the current countdown state from the database
 * @returns Promise<CountdownState> The current countdown state
 */
export async function getCountdownState(): Promise<CountdownState> {
  try {
    const result = await pool.query(
      "SELECT id, phase, ends_at, is_active, updated_at FROM countdown_state WHERE id = 1"
    );

    if (result.rows.length === 0) {
      // If no row exists, create the default state
      console.log("🔄 No countdown state found, creating default state...");
      await resetCountdownState();
      return getCountdownState(); // Recursive call to get the newly created state
    }

    const row = result.rows[0];
    return {
      id: row.id,
      phase: row.phase,
      ends_at: row.ends_at,
      is_active: row.is_active,
      updated_at: row.updated_at,
    };
  } catch (error) {
    console.error("❌ Error getting countdown state:", error);
    throw new Error("Failed to get countdown state from database");
  }
}

/**
 * Update the countdown state in the database
 * @param state Partial countdown state to update
 */
export async function setCountdownState(state: {
  phase?: CountdownState["phase"];
  ends_at?: Date | null;
  is_active?: boolean;
}): Promise<void> {
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (state.phase !== undefined) {
      updates.push(`phase = $${paramIndex}`);
      values.push(state.phase);
      paramIndex++;
    }

    if (state.ends_at !== undefined) {
      updates.push(`ends_at = $${paramIndex}`);
      values.push(state.ends_at);
      paramIndex++;
    }

    if (state.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(state.is_active);
      paramIndex++;
    }

    if (updates.length === 0) {
      console.warn("⚠️ No updates provided to setCountdownState");
      return;
    }

    // Always update the timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE countdown_state 
      SET ${updates.join(", ")} 
      WHERE id = 1
    `;

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      console.warn(
        "⚠️ No countdown state row found to update, creating default..."
      );
      await resetCountdownState();
      // Retry the update
      await setCountdownState(state);
    }

    console.log(`✅ Countdown state updated: ${JSON.stringify(state)}`);
  } catch (error) {
    console.error("❌ Error setting countdown state:", error);
    throw new Error("Failed to update countdown state in database");
  }
}

/**
 * Reset the countdown state to default values
 */
export async function resetCountdownState(): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO countdown_state (id, phase, ends_at, is_active, updated_at)
      VALUES (1, 'starting', NULL, FALSE, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        phase = 'starting',
        ends_at = NULL,
        is_active = FALSE,
        updated_at = CURRENT_TIMESTAMP
    `);

    console.log("✅ Countdown state reset to default values");
  } catch (error) {
    console.error("❌ Error resetting countdown state:", error);
    throw new Error("Failed to reset countdown state in database");
  }
}
