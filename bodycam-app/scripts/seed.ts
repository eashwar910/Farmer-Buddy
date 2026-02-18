/**
 * Seed Script for BodyCam App
 * 
 * Creates test users (1 manager, 1 employee) in Supabase Auth
 * and sets up their profiles with roles.
 * 
 * Usage:
 *   npx ts-node scripts/seed.ts
 * 
 * Prerequisites:
 *   - Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 *   - The service role key (NOT anon key) is required to create auth users
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SERVICE_ROLE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_PASSWORD = 'Test1234!';

const TEST_USERS = [
  { email: 'manager@test.com', name: 'Test Manager', role: 'manager' as const },
  { email: 'employee@test.com', name: 'Test Employee', role: 'employee' as const },
];

async function seed() {
  console.log('🌱 Starting seed...\n');

  const authUsers: { id: string; email: string; name: string; role: 'manager' | 'employee' }[] = [];

  for (const user of TEST_USERS) {
    console.log(`Creating auth user: ${user.email}`);

    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { name: user.name },
    });

    if (error) {
      if (error.message.includes('already been registered')) {
        console.log(`  ⚠️  User ${user.email} already exists, fetching...`);
        const { data: listData } = await supabase.auth.admin.listUsers();
        const existing = listData?.users?.find((u) => u.email === user.email);
        if (existing) {
          authUsers.push({ id: existing.id, email: user.email, name: user.name, role: user.role });
        }
        continue;
      }
      console.error(`  ❌ Error creating ${user.email}:`, error.message);
      continue;
    }

    if (data.user) {
      authUsers.push({ id: data.user.id, email: user.email, name: user.name, role: user.role });
      console.log(`  ✅ Created: ${data.user.id}`);
    }
  }

  if (authUsers.length === 0) {
    console.error('\n❌ No users created. Check your Supabase credentials.');
    process.exit(1);
  }

  // Create profiles with roles
  console.log('\nCreating user profiles...');
  for (const user of authUsers) {
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    if (error) {
      console.error(`  ❌ Error creating profile for ${user.email}:`, error.message);
    } else {
      console.log(`  ✅ Profile: ${user.name} (${user.role})`);
    }
  }

  console.log('\n🎉 Seed complete!\n');
  console.log('Test Credentials:');
  console.log('─────────────────────────────────────');
  console.log(`Manager:  manager@test.com / ${TEST_PASSWORD}`);
  console.log(`Employee: employee@test.com / ${TEST_PASSWORD}`);
  console.log('─────────────────────────────────────');
}

seed().catch(console.error);
