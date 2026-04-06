-- =============================================
-- Migration: Add 'gardener' role
-- Run this in the Supabase SQL Editor
-- =============================================

-- 1. Drop the existing role check constraint and add an updated one
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('manager', 'employee', 'gardener'));

-- 2. (Optional) Update the index comment — the index itself is fine as-is
-- No data changes needed: existing rows with role 'manager' or 'employee' are unaffected.

-- =============================================
-- DONE
-- Gardeners can now use agriculture-assistance
-- features (leaf detection, IoT sensor XAI,
-- agronomist chatbot) but cannot access bodycam,
-- streams, reports, or manager screens.
-- =============================================
