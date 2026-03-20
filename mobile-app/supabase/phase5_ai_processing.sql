-- =============================================
-- Phase 5: AI Processing Setup
-- Run this in Supabase SQL Editor
-- =============================================

-- Add a processing status to track AI summarization
ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending'
CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'));

-- Add processing metadata
ALTER TABLE recordings
ADD COLUMN IF NOT EXISTS processing_error TEXT,
ADD COLUMN IF NOT EXISTS processing_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Create an index on processing status for efficient queries
CREATE INDEX IF NOT EXISTS idx_recordings_processing_status ON recordings(processing_status);

-- =============================================
-- Postgres NOTIFY trigger for new recordings
-- =============================================

-- Create a function that notifies when a new recording is ready for processing
CREATE OR REPLACE FUNCTION notify_new_recording()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify when status changes to 'completed' and processing is 'pending'
  IF NEW.status = 'completed' AND (NEW.processing_status IS NULL OR NEW.processing_status = 'pending') THEN
    PERFORM pg_notify(
      'new_recording',
      json_build_object(
        'id', NEW.id,
        'shift_id', NEW.shift_id,
        'employee_id', NEW.employee_id,
        'storage_url', NEW.storage_url,
        'egress_id', NEW.egress_id
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on recordings table
DROP TRIGGER IF EXISTS trigger_notify_new_recording ON recordings;
CREATE TRIGGER trigger_notify_new_recording
AFTER INSERT OR UPDATE ON recordings
FOR EACH ROW
EXECUTE FUNCTION notify_new_recording();

-- =============================================
-- Helper function to mark recording as processing
-- =============================================
CREATE OR REPLACE FUNCTION mark_recording_processing(recording_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE recordings
  SET processing_status = 'processing',
      processing_attempts = processing_attempts + 1
  WHERE id = recording_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Helper function to update recording summary
-- =============================================
CREATE OR REPLACE FUNCTION update_recording_summary(
  recording_id UUID,
  summary_text TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE recordings
  SET summary = summary_text,
      processing_status = 'completed',
      processed_at = NOW()
  WHERE id = recording_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Helper function to mark recording processing failed
-- =============================================
CREATE OR REPLACE FUNCTION mark_recording_failed(
  recording_id UUID,
  error_message TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE recordings
  SET processing_status = 'failed',
      processing_error = error_message
  WHERE id = recording_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- View for pending recordings (for monitoring)
-- =============================================
CREATE OR REPLACE VIEW pending_recordings AS
SELECT
  r.id,
  r.shift_id,
  r.employee_id,
  r.egress_id,
  r.storage_url,
  r.status,
  r.processing_status,
  r.processing_attempts,
  r.started_at,
  r.ended_at,
  u.name as employee_name,
  u.email as employee_email
FROM recordings r
JOIN users u ON r.employee_id = u.id
WHERE r.status = 'completed'
  AND (r.processing_status = 'pending' OR r.processing_status IS NULL)
ORDER BY r.ended_at ASC;

-- Grant necessary permissions
GRANT SELECT, UPDATE ON recordings TO authenticated;
GRANT EXECUTE ON FUNCTION mark_recording_processing TO service_role;
GRANT EXECUTE ON FUNCTION update_recording_summary TO service_role;
GRANT EXECUTE ON FUNCTION mark_recording_failed TO service_role;
