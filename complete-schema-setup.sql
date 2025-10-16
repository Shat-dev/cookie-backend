-- =========================
-- COMPLETE DATABASE SCHEMA SETUP
-- =========================
-- Run this script in your Supabase SQL Editor to set up all required tables
-- This will resolve the "Tenant or user not found" error

-- ==============
-- Core tables
-- ==============

-- Entries: one row per token per tweet (NEW SHAPE)
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY,
  tweet_id TEXT NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  token_id TEXT NOT NULL,          -- single token per row
  image_url TEXT,                  -- optional if you store per-token image
  verified BOOLEAN DEFAULT FALSE,  -- optional, for your validation pipeline
  tweet_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Push tracking fields
  pushed_round INTEGER,
  pushed_tx TEXT,
  pushed_at TIMESTAMP
);

-- Winners (unchanged)
CREATE TABLE IF NOT EXISTS winners (
  id SERIAL PRIMARY KEY,
  draw_number INTEGER NOT NULL,
  winner_address VARCHAR(42) NOT NULL,
  prize_amount VARCHAR(255) NOT NULL,
  token_id VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- App state: tiny key/value store for poller high-water marks
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ==============
-- Constraints & Indexes
-- ==============

-- Prevent duplicate rows for the same tweet + token
CREATE UNIQUE INDEX IF NOT EXISTS uniq_entries_tweet_token
  ON entries (tweet_id, token_id);

-- Helpful lookups
CREATE INDEX IF NOT EXISTS idx_entries_wallet_address ON entries(wallet_address);
CREATE INDEX IF NOT EXISTS idx_entries_tweet_id ON entries(tweet_id);

CREATE INDEX IF NOT EXISTS idx_winners_draw_number ON winners(draw_number);
CREATE INDEX IF NOT EXISTS idx_winners_winner_address ON winners(winner_address);

-- =========================
-- LOTTERY SCHEMA
-- =========================

-- Lottery Rounds table
CREATE TABLE IF NOT EXISTS lottery_rounds (
  id SERIAL PRIMARY KEY,
  round_number INTEGER UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'drawing', 'completed')),
  winner_address VARCHAR(42),
  winner_token_id VARCHAR(255),
  total_entries INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lottery Entries table (links current-pool entries to lottery rounds)
CREATE TABLE IF NOT EXISTS lottery_entries (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  wallet_address VARCHAR(42) NOT NULL,
  token_id VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  tweet_url TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(round_id, wallet_address, token_id)
);

-- Lottery Winners table
CREATE TABLE IF NOT EXISTS lottery_winners (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  wallet_address VARCHAR(42) NOT NULL,
  token_id VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  prize_amount VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Lottery Indexes
-- =========================
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_status ON lottery_rounds(status);
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_round_number ON lottery_rounds(round_number);
CREATE INDEX IF NOT EXISTS idx_lottery_entries_round_id ON lottery_entries(round_id);
CREATE INDEX IF NOT EXISTS idx_lottery_entries_wallet ON lottery_entries(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lottery_winners_round_id ON lottery_winners(round_id);

-- =========================
-- Trigger function
-- =========================
CREATE OR REPLACE FUNCTION update_round_entries_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lottery_rounds
       SET total_entries = total_entries + 1,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = NEW.round_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lottery_rounds
       SET total_entries = GREATEST(total_entries - 1, 0),
           updated_at = CURRENT_TIMESTAMP
     WHERE id = OLD.round_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- =========================
-- Trigger (idempotent)
-- =========================
DROP TRIGGER IF EXISTS trigger_update_round_entries_count ON lottery_entries;

CREATE TRIGGER trigger_update_round_entries_count
AFTER INSERT OR DELETE ON lottery_entries
FOR EACH ROW
EXECUTE FUNCTION update_round_entries_count();

-- =========================
-- Initialize app_state
-- =========================
INSERT INTO app_state (key, value) VALUES 
('twitter_last_id', '0'),
('last_processed_tweet', '0')
ON CONFLICT (key) DO NOTHING;

-- =========================
-- Verification queries
-- =========================
-- Run these to verify everything is set up correctly:

-- Check all tables exist
SELECT 
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND table_schema = 'public') as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check app_state is initialized
SELECT * FROM app_state;

-- Success message
SELECT 'Database schema setup completed successfully!' as status; 

-- ======================================
-- PATCH: Add payout tracking fields
-- ======================================

-- Add payout columns to lottery_winners if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lottery_winners' AND column_name = 'payout_amount'
  ) THEN
    ALTER TABLE lottery_winners
    ADD COLUMN payout_amount VARCHAR(255);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lottery_winners' AND column_name = 'payout_status'
  ) THEN
    ALTER TABLE lottery_winners
    ADD COLUMN payout_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'success', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'lottery_winners' AND column_name = 'payout_failure_reason'
  ) THEN
    ALTER TABLE lottery_winners
    ADD COLUMN payout_failure_reason TEXT;
  END IF;
END $$;

-- Add an index for efficient payout lookups
CREATE INDEX IF NOT EXISTS idx_lottery_winners_payout_status
ON lottery_winners(payout_status);
