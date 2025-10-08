-- Clear all lottery data for new contract deployment
DELETE FROM lottery_winners;
DELETE FROM lottery_entries; 
DELETE FROM lottery_rounds;

-- Reset sequences
ALTER SEQUENCE lottery_rounds_id_seq RESTART WITH 1;
ALTER SEQUENCE lottery_entries_id_seq RESTART WITH 1;
ALTER SEQUENCE lottery_winners_id_seq RESTART WITH 1;

-- Confirm cleanup
SELECT COUNT(*) as remaining_rounds FROM lottery_rounds;
SELECT COUNT(*) as remaining_entries FROM lottery_entries;
SELECT COUNT(*) as remaining_winners FROM lottery_winners; 