-- =========================
-- Tables
-- =========================

-- Lottery Rounds
CREATE TABLE IF NOT EXISTS lottery_rounds (
  id SERIAL PRIMARY KEY,
  round_number INTEGER UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'drawing', 'completed')),
  winner_address VARCHAR(42),
  winner_token_id VARCHAR(255),
  total_entries INTEGER DEFAULT 0,
  funds_admin_address VARCHAR(42),
  vrf_transaction_hash VARCHAR(66), -- VRF requestRandomWinner transaction hash
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lottery Entries
CREATE TABLE IF NOT EXISTS lottery_entries (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  wallet_address VARCHAR(42) NOT NULL,
  token_id VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  tweet_url TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (round_id, wallet_address, token_id)
);

-- Lottery Winners
CREATE TABLE IF NOT EXISTS lottery_winners (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES lottery_rounds(id) ON DELETE CASCADE,
  wallet_address VARCHAR(42) NOT NULL,
  token_id VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  prize_amount VARCHAR(255),
  payout_amount VARCHAR(255),
  payout_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'success', 'failed')),
  payout_failure_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- Indexes (safe re-runs)
-- =========================
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_status ON lottery_rounds(status);
CREATE INDEX IF NOT EXISTS idx_lottery_rounds_number ON lottery_rounds(round_number);
CREATE INDEX IF NOT EXISTS idx_lottery_entries_round_id ON lottery_entries(round_id);
CREATE INDEX IF NOT EXISTS idx_lottery_entries_wallet ON lottery_entries(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lottery_winners_round_id ON lottery_winners(round_id);
CREATE INDEX IF NOT EXISTS idx_lottery_winners_wallet_status ON lottery_winners(wallet_address, payout_status);

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
-- Migration: Add VRF transaction hash column (safe for existing tables)
-- =========================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'lottery_rounds' 
        AND column_name = 'vrf_transaction_hash'
    ) THEN
        ALTER TABLE lottery_rounds ADD COLUMN vrf_transaction_hash VARCHAR(66);
        RAISE NOTICE 'Added vrf_transaction_hash column to lottery_rounds table';
    ELSE
        RAISE NOTICE 'vrf_transaction_hash column already exists in lottery_rounds table';
    END IF;
END $$;
