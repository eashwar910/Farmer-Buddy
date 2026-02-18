-- =============================================
-- Assign roles to users manually
-- Run this in Supabase SQL Editor AFTER users have signed up
-- =============================================

-- Assign manager role to manager@test.com
UPDATE users
SET role = 'manager'
WHERE email = 'manager@test.com';

-- Assign employee role to employee@test.com
UPDATE users
SET role = 'employee'
WHERE email = 'employee@test.com';
