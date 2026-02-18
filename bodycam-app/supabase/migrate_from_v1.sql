-- =============================================
-- Migration: Remove organizations and simplify schema
-- Run this ONLY if you already ran the old schema.sql
-- =============================================

-- Drop old RLS policies on users
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Managers can read org members" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;

-- Drop old RLS policies on organizations
DROP POLICY IF EXISTS "Authenticated users can read organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Managers can update their own organization" ON organizations;

-- Drop org_id column and index from users
DROP INDEX IF EXISTS idx_users_org_id;
ALTER TABLE users DROP COLUMN IF EXISTS org_id;

-- Drop organizations table
DROP TABLE IF EXISTS organizations;

-- Re-create correct RLS policies
CREATE POLICY "Authenticated users can read profiles"
  ON users FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
