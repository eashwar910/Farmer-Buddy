-- =============================================
-- Phase 4: Recordings Table
-- Run this in Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS recordings (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id        UUID        NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  employee_id     UUID        NOT NULL REFERENCES auth.users(id),
  egress_id       TEXT        UNIQUE,
  chunk_index     INTEGER     NOT NULL DEFAULT 0,
  storage_url     TEXT,
  status          TEXT        NOT NULL DEFAULT 'recording'
                              CHECK (status IN ('recording', 'completed', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  summary         TEXT
);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all recordings (manager sees everything)
CREATE POLICY "Authenticated users can read recordings"
  ON recordings FOR SELECT
  TO authenticated
  USING (true);

-- Only service role can insert recordings (edge functions use service key)
CREATE POLICY "Service role can insert recordings"
  ON recordings FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Only service role can update recordings (webhook finalizes them)
CREATE POLICY "Service role can update recordings"
  ON recordings FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================
-- Realtime (so manager sees new chunks live)
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE recordings;

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_recordings_shift_id     ON recordings(shift_id);
CREATE INDEX IF NOT EXISTS idx_recordings_employee_id  ON recordings(employee_id);
CREATE INDEX IF NOT EXISTS idx_recordings_egress_id    ON recordings(egress_id);
CREATE INDEX IF NOT EXISTS idx_recordings_status       ON recordings(status);
