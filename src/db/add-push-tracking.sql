-- Add push tracking fields to entries table idempotently
ALTER TABLE entries ADD COLUMN IF NOT EXISTS pushed_round INTEGER;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS pushed_tx TEXT;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMP;

-- Add index for efficient querying of unpushed entries
CREATE INDEX IF NOT EXISTS idx_entries_pushed_round ON entries(pushed_round);
CREATE INDEX IF NOT EXISTS idx_entries_pushed_at ON entries(pushed_at); 