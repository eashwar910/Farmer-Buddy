-- =============================================
-- Phase 2: Shifts Table + Realtime
-- Run this in Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read shifts"
  ON shifts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can create shifts"
  ON shifts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = manager_id);

CREATE POLICY "Managers can update own shifts"
  ON shifts FOR UPDATE
  TO authenticated
  USING (auth.uid() = manager_id)
  WITH CHECK (auth.uid() = manager_id);

-- Enable Realtime on shifts table
-- If this line errors, run it separately:
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;

CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_manager_id ON shifts(manager_id);
