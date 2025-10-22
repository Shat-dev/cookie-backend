BEGIN;

-- Truncate all data but keep schema
TRUNCATE TABLE
  entries,
  winners,
  lottery_rounds,
  lottery_entries,
  lottery_winners,
  app_state
RESTART IDENTITY CASCADE;

-- Keep app_state table but clear volatile keys
DELETE FROM app_state WHERE key LIKE 'snapshot_tx_round_%';
DELETE FROM app_state WHERE key LIKE 'freeze_flag_round_%';
DELETE FROM app_state WHERE key LIKE 'vrf_requested_round_%';
DELETE FROM app_state WHERE key LIKE '%_since_id';
DELETE FROM app_state WHERE key LIKE '%last_%';

COMMIT;

-- Verify cleanup
SELECT '✅ Database reset complete. All tables truncated, schema preserved.' AS status;
SELECT COUNT(*) AS entries_rows FROM entries;
SELECT COUNT(*) AS winners_rows FROM winners;
SELECT COUNT(*) AS lottery_rounds_rows FROM lottery_rounds;
SELECT COUNT(*) AS lottery_entries_rows FROM lottery_entries;
SELECT COUNT(*) AS lottery_winners_rows FROM lottery_winners;
