-- reset_entries.sql
BEGIN;

-- Make sure app_state exists (used by poller)
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Drop old entries and recreate with the new columns
DROP TABLE IF EXISTS entries;

CREATE TABLE entries (
  id SERIAL PRIMARY KEY,
  tweet_id TEXT NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  token_id TEXT NOT NULL,
  image_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  tweet_url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_entries_tweet_token
  ON entries (tweet_id, token_id);

CREATE INDEX IF NOT EXISTS idx_entries_wallet_address ON entries(wallet_address);
CREATE INDEX IF NOT EXISTS idx_entries_tweet_id ON entries(tweet_id);

COMMIT;
