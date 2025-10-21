"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCountdownState = getCountdownState;
exports.setCountdownState = setCountdownState;
exports.resetCountdownState = resetCountdownState;
const connection_1 = __importDefault(require("../db/connection"));
async function getCountdownState() {
    try {
        const result = await connection_1.default.query("SELECT id, phase, ends_at, is_active, updated_at FROM countdown_state WHERE id = 1");
        if (result.rows.length === 0) {
            console.log("🔄 No countdown state found, creating default state...");
            await resetCountdownState();
            return getCountdownState();
        }
        const row = result.rows[0];
        return {
            id: row.id,
            phase: row.phase,
            ends_at: row.ends_at,
            is_active: row.is_active,
            updated_at: row.updated_at,
        };
    }
    catch (error) {
        console.error("❌ Error getting countdown state:", error);
        throw new Error("Failed to get countdown state from database");
    }
}
async function setCountdownState(state) {
    try {
        const updates = [];
        const values = [];
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
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        const query = `
      UPDATE countdown_state 
      SET ${updates.join(", ")} 
      WHERE id = 1
    `;
        const result = await connection_1.default.query(query, values);
        if (result.rowCount === 0) {
            console.warn("⚠️ No countdown state row found to update, creating default...");
            await resetCountdownState();
            await setCountdownState(state);
        }
        console.log(`✅ Countdown state updated: ${JSON.stringify(state)}`);
    }
    catch (error) {
        console.error("❌ Error setting countdown state:", error);
        throw new Error("Failed to update countdown state in database");
    }
}
async function resetCountdownState() {
    try {
        await connection_1.default.query(`
      INSERT INTO countdown_state (id, phase, ends_at, is_active, updated_at)
      VALUES (1, 'starting', NULL, FALSE, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        phase = 'starting',
        ends_at = NULL,
        is_active = FALSE,
        updated_at = CURRENT_TIMESTAMP
    `);
        console.log("✅ Countdown state reset to default values");
    }
    catch (error) {
        console.error("❌ Error resetting countdown state:", error);
        throw new Error("Failed to reset countdown state in database");
    }
}
//# sourceMappingURL=countdownRepository.js.map