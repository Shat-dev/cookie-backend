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
