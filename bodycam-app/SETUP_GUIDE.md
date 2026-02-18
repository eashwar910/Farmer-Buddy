# BodyCam App - Phase 1 Setup Guide

## What's Been Built

Phase 1 delivers the foundational project structure, authentication system, and role-based access control:

- **Expo (React Native) project** with TypeScript and organized folder structure
- **Supabase Auth integration** (email/password sign-up and login)
- **Role selection flow**: Managers create an org and get a join code; employees enter the code to join
- **Navigation guards**: Managers route to Manager Dashboard; employees route to Employee Dashboard
- **Database schema**: `users` and `organizations` tables with Row Level Security (RLS)
- **Seed script** for test data (1 manager, 4 employees)

---

## Manual Setup Steps

### Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New Project**.
3. Choose your organization, give the project a name (e.g., `bodycam`), set a database password, and select a region.
4. Wait for the project to finish provisioning (~2 minutes).

### Step 2: Get Your Supabase Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**.
2. Copy these two values:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public** key (a long JWT string)
3. Open the file `src/services/supabase.ts` and replace the placeholders:

```typescript
const SUPABASE_URL = 'https://your-project-id.supabase.co';      // ← paste your Project URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...';             // ← paste your anon key
```

### Step 3: Run the Database Schema

1. In your Supabase dashboard, go to **SQL Editor**.
2. Click **New Query**.
3. Copy the entire contents of `supabase/schema.sql` and paste it into the editor.
4. Click **Run** (or press Cmd+Enter).
5. You should see "Success. No rows returned." — this means the tables and RLS policies were created.

### Step 4: Disable Email Confirmation (for Development)

By default, Supabase requires email verification. For local development, disable it:

1. Go to **Authentication** → **Providers** → **Email**.
2. Toggle **OFF** "Confirm email" (or "Enable email confirmations").
3. Click **Save**.

> **Note**: Re-enable this for production!

### Step 5: Seed Test Data (Optional)

You have two options:

#### Option A: Use the Seed Script (Recommended)

1. Get your **Service Role Key** from Supabase: **Settings** → **API** → **service_role** key.
2. Run the seed script:

```bash
cd bodycam-app
SUPABASE_URL=https://your-project-id.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npx ts-node scripts/seed.ts
```

This creates 5 test users and an organization automatically.

#### Option B: Create Users Manually

1. Go to **Authentication** → **Users** → **Add User** → **Create New User**.
2. Create these accounts (all with password `Test1234!`):

| Email | Name | Role |
|---|---|---|
| manager@bodycam.test | Alex Manager | Manager |
| employee1@bodycam.test | Jordan Smith | Employee |
| employee2@bodycam.test | Casey Jones | Employee |
| employee3@bodycam.test | Riley Brown | Employee |
| employee4@bodycam.test | Morgan Davis | Employee |

3. Then sign in with each account through the app to complete the role selection and org setup flow.

### Step 6: Run the App

```bash
cd bodycam-app
npx expo start
```

Then:
- Press **i** to open in iOS Simulator
- Press **a** to open in Android Emulator
- Scan the QR code with **Expo Go** on your physical device

---

## Project Structure

```
bodycam-app/
├── App.tsx                          # Root component with AuthProvider + NavigationContainer
├── src/
│   ├── hooks/
│   │   └── useAuth.tsx              # Auth context provider + hook (session, profile, signIn/Up/Out)
│   ├── navigation/
│   │   ├── types.ts                 # TypeScript types for all navigation stacks
│   │   ├── RootNavigator.tsx        # Root navigator with auth/role-based routing
│   │   ├── AuthStack.tsx            # Login + SignUp screens
│   │   ├── OnboardingStack.tsx      # Role selection + Create/Join org screens
│   │   ├── ManagerTabs.tsx          # Manager bottom tab navigator
│   │   └── EmployeeTabs.tsx         # Employee bottom tab navigator
│   ├── screens/
│   │   ├── LoginScreen.tsx          # Email/password login
│   │   ├── SignUpScreen.tsx         # Account creation
│   │   ├── RoleSelectionScreen.tsx  # Choose Manager or Employee
│   │   ├── CreateOrganizationScreen.tsx  # Manager creates org, gets join code
│   │   ├── JoinOrganizationScreen.tsx    # Employee enters join code
│   │   ├── ManagerDashboardScreen.tsx    # Manager home (employee list, org info)
│   │   ├── EmployeeDashboardScreen.tsx   # Employee home (shift status, placeholders)
│   │   └── SettingsScreen.tsx            # Profile info + sign out
│   ├── services/
│   │   └── supabase.ts             # Supabase client initialization
│   └── types/
│       └── index.ts                 # Shared TypeScript types
├── supabase/
│   ├── schema.sql                   # Database tables + RLS policies (run in SQL Editor)
│   └── seed.sql                     # Reference SQL for manual seeding
├── scripts/
│   └── seed.ts                      # Node.js seed script (creates auth users + profiles)
├── .env.example                     # Environment variable template
└── .eslintrc.json                   # ESLint configuration
```

---

## App Flow

```
App Launch
  │
  ├── Not logged in → Login Screen ↔ Sign Up Screen
  │
  ├── Logged in, no role/org → Role Selection Screen
  │   ├── "Manager" → Create Organization Screen → Manager Dashboard
  │   └── "Employee" → Join Organization Screen → Employee Dashboard
  │
  ├── Logged in, role=manager → Manager Dashboard (with bottom tabs)
  │
  └── Logged in, role=employee → Employee Dashboard (with bottom tabs)
```

---

## Database Schema

### `organizations` table
| Column | Type | Description |
|---|---|---|
| id | UUID (PK) | Auto-generated |
| name | TEXT | Organization name |
| join_code | TEXT (UNIQUE) | 6-char code for employees to join |
| created_by | UUID (FK → auth.users) | Manager who created it |
| created_at | TIMESTAMPTZ | Auto-set |

### `users` table
| Column | Type | Description |
|---|---|---|
| id | UUID (PK, FK → auth.users) | Matches Supabase Auth user ID |
| email | TEXT | User's email |
| name | TEXT | Display name |
| role | TEXT | `'manager'` or `'employee'` (nullable until chosen) |
| org_id | UUID (FK → organizations) | Nullable until org is joined/created |
| created_at | TIMESTAMPTZ | Auto-set |

### RLS Policies
- **Organizations**: All authenticated users can read (for join code lookup). Only creators can insert/update.
- **Users**: Users can read/update their own profile. Managers can read profiles of users in their org.

---

## Troubleshooting

### "Invalid login credentials"
- Make sure you disabled email confirmation (Step 4) or verified the email.
- Check that the user exists in Supabase **Authentication** → **Users**.

### "relation 'users' does not exist"
- You haven't run the schema SQL yet. Go to Step 3.

### "new row violates row-level security policy"
- The RLS policies require `auth.uid()` to match. Make sure you're authenticated before inserting.
- If using the seed script, ensure you're using the **service_role** key (not the anon key).

### App shows loading spinner forever
- Check that your `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct in `src/services/supabase.ts`.
- Open the Expo dev tools console for error messages.

---

## What's Next (Phase 2)

Phase 2 will add:
- `shifts` table with RLS policies
- Manager Start/End Shift toggle
- Supabase Realtime for push notifications to employees
- Employee shift status and timer
- Expo push notifications as fallback
