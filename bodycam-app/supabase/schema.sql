-- =============================================
-- BodyCam App - Phase 1 Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- Users (Profiles) Table
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('manager', 'employee')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Row Level Security (RLS) Policies
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read profiles (small-scale app, no org isolation needed)
CREATE POLICY "Authenticated users can read profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================
-- Shifts Table (Phase 2)
-- =============================================
CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manager_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read shifts
CREATE POLICY "Authenticated users can read shifts"
  ON shifts FOR SELECT
  TO authenticated
  USING (true);

-- Only managers can create shifts
CREATE POLICY "Managers can create shifts"
  ON shifts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = manager_id);

-- Only the shift creator can update their shift
CREATE POLICY "Managers can update own shifts"
  ON shifts FOR UPDATE
  TO authenticated
  USING (auth.uid() = manager_id)
  WITH CHECK (auth.uid() = manager_id);

-- =============================================
-- Enable Realtime on shifts table
-- Run this separately if it fails in the batch:
--   ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_manager_id ON shifts(manager_id);
