-- Scheduler heartbeat monitoring table
-- Tracks when each background service last ran to detect stalls

CREATE TABLE IF NOT EXISTS scheduler_heartbeats (
  service TEXT PRIMARY KEY,
  last_run TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_duration_ms INTEGER, -- How long the last run took
  total_runs INTEGER DEFAULT 0, -- Total successful runs
  total_errors INTEGER DEFAULT 0, -- Total errors encountered
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_scheduler_heartbeats_last_run ON scheduler_heartbeats(last_run);

-- Function to update heartbeat with duration
CREATE OR REPLACE FUNCTION update_scheduler_heartbeat(
  p_service TEXT,
  p_duration_ms INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO scheduler_heartbeats (service, last_run, last_run_duration_ms, total_runs, updated_at)
  VALUES (p_service, NOW(), p_duration_ms, 1, NOW())
  ON CONFLICT (service) DO UPDATE SET
    last_run = NOW(),
    last_run_duration_ms = p_duration_ms,
    total_runs = scheduler_heartbeats.total_runs + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to record an error
CREATE OR REPLACE FUNCTION record_scheduler_error(p_service TEXT) RETURNS VOID AS $$
BEGIN
  INSERT INTO scheduler_heartbeats (service, last_run, total_errors, updated_at)
  VALUES (p_service, NOW(), 1, NOW())
  ON CONFLICT (service) DO UPDATE SET
    last_run = NOW(),
    total_errors = scheduler_heartbeats.total_errors + 1,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- View for health monitoring
CREATE OR REPLACE VIEW scheduler_health AS
SELECT 
  service,
  last_run,
  EXTRACT(EPOCH FROM (NOW() - last_run)) AS age_seconds,
  last_run_duration_ms,
  total_runs,
  total_errors,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - last_run)) > 300 THEN 'STALLED' -- 5+ minutes
    WHEN EXTRACT(EPOCH FROM (NOW() - last_run)) > 180 THEN 'WARNING' -- 3+ minutes
    ELSE 'HEALTHY'
  END AS status
FROM scheduler_heartbeats
ORDER BY last_run ASC; 