BEGIN;

-- Drop all major tables
DROP TABLE IF EXISTS lottery_winners CASCADE;
DROP TABLE IF EXISTS lottery_entries CASCADE;
DROP TABLE IF EXISTS lottery_rounds CASCADE;
DROP TABLE IF EXISTS entries CASCADE;
DROP TABLE IF EXISTS winners CASCADE;
DROP TABLE IF EXISTS app_state CASCADE;

-- Recreate app_state (so backend starts clean)
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

COMMIT;

-- Reset only public schema sequences
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I RESTART WITH 1;',
                   r.sequence_schema, r.sequence_name);
  END LOOP;
END$$;


-- Remove cached transaction / state flags
DELETE FROM app_state WHERE key LIKE 'snapshot_tx_round_%';
DELETE FROM app_state WHERE key LIKE 'freeze_flag_round_%';
DELETE FROM app_state WHERE key LIKE 'vrf_requested_round_%';
DELETE FROM app_state WHERE key LIKE '%_since_id';
DELETE FROM app_state WHERE key LIKE '%last_%';

-- Verify cleanup
SELECT '✅ Database reset complete. Remaining app_state keys:' AS status;
SELECT key, value FROM app_state ORDER BY key;
