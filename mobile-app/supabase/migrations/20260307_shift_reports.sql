-- ============================================================
-- shift_reports table — Phase 6
-- Run this in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_reports (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id      uuid        NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  employee_id   uuid        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  report_url    text        NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id, employee_id)
);

ALTER TABLE shift_reports ENABLE ROW LEVEL SECURITY;

-- Managers can read all shift reports in their org
CREATE POLICY "Managers can read shift reports"
  ON shift_reports
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'manager'
    )
  );

-- Service role inserts/upserts (Edge Functions use service role key — bypasses RLS automatically)
-- No additional policy needed for INSERT; service role bypasses RLS.
