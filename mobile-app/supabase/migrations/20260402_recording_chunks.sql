-- =============================================
-- Recording Chunks Table
-- Run this in Supabase SQL Editor before deploying
-- the updated process-recording edge function.
-- =============================================

CREATE TABLE IF NOT EXISTS recording_chunks (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  recording_id      UUID        NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
  chunk_index       INTEGER     NOT NULL,
  storage_url       TEXT,
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,
  summary           TEXT,
  processing_status TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error  TEXT,
  processed_at      TIMESTAMPTZ,
  UNIQUE (recording_id, chunk_index)
);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE recording_chunks ENABLE ROW LEVEL SECURITY;

-- Managers and employees can read all chunk rows
CREATE POLICY "Authenticated users can read recording_chunks"
  ON recording_chunks FOR SELECT TO authenticated USING (true);

-- Only service role (edge functions) can write
CREATE POLICY "Service role can write recording_chunks"
  ON recording_chunks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_recording_chunks_recording_id ON recording_chunks(recording_id);
CREATE INDEX IF NOT EXISTS idx_recording_chunks_processing_status ON recording_chunks(processing_status);

-- =============================================
-- Realtime (manager sees new chunks live)
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE recording_chunks;
