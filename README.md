# Farmer Buddy

Farmer Buddy is a farm operations platform that combines a field-worker mobile app with a manager web dashboard. Workers use the mobile app to live-stream bodycam footage, capture readings from IoT sensors, run AI-assisted leaf disease detection, and chat with an agronomist assistant. Managers use the web dashboard to monitor live streams in real time, review AI-generated shift summaries, and track conditions across the farm.

## Features

- **Live bodycam streaming** — workers stream video from the field via LiveKit; managers watch from the dashboard.
- **AI shift summaries** — completed recordings are processed by a worker that extracts keyframes with FFmpeg and sends them to Gemini for a structured summary.
- **Agronomist chat** — Gemini-backed assistant that answers crop and farming questions in-app.
- **Leaf detection** — image-based plant disease classification.
- **IoT sensor screen** — view real-time sensor readings from the field.
- **Irrigation timer** — schedule and track irrigation cycles.
- **Weather widget** — localized weather based on the device's location.
- **Shifts and recordings** — start, stop, and review shift recordings with auto-generated reports.
- **Roles** — separate experiences for managers, employees, and gardeners.

## Repository structure

```
Farmer-Buddy/
├── mobile-app/             Expo / React Native app for field workers
│   ├── src/                Screens, components, hooks, services
│   ├── supabase/           SQL schema, migrations, and Edge Functions
│   ├── processing-worker/  Standalone Node worker for video processing
│   └── app.json            Expo configuration
├── web/                    Next.js 16 manager dashboard
│   ├── app/                App Router pages and API routes
│   ├── components/         Dashboard UI components
│   └── lib/                Shared utilities
└── README.md
```

## Tech stack

- **Mobile app:** Expo SDK 54, React Native 0.81, React 19, React Navigation
- **Web dashboard:** Next.js 16 (App Router), React 19, Tailwind CSS
- **Backend:** Supabase (Postgres, Auth, Edge Functions)
- **Realtime video:** LiveKit
- **Object storage:** DigitalOcean Spaces (S3-compatible)
- **AI:** Google Gemini (1.5 Flash) for chat, leaf detection, and video summarization
- **Video processing:** Node.js worker + FFmpeg, triggered via Postgres `NOTIFY/LISTEN`

## Prerequisites

Install / sign up for the following before starting. Versions listed are the ones the project is pinned against — newer minor versions are usually fine, but stay on the same major.

| Requirement | Version / notes | Used by |
|---|---|---|
| Node.js | **18 LTS or newer** (Expo SDK 54 requires Node ≥ 18) | All packages |
| npm | Bundled with Node | All packages |
| Git | Any recent version | Cloning + contributing |
| Supabase CLI | `>= 1.190` — install via `npm i -g supabase` or [official guide](https://supabase.com/docs/guides/cli) | Edge Function deploy |
| EAS CLI | `>= 18.0.1` — install via `npm i -g eas-cli` | Mobile dev/prod builds |
| Xcode + CocoaPods | macOS only, Xcode 15+ | iOS development build |
| Android Studio | With an SDK 34 emulator or USB-debug device | Android development build |
| FFmpeg | Latest (`apt install ffmpeg` / `brew install ffmpeg`) | Processing worker only |

You will also need accounts and credentials for:

- **Supabase** project — [supabase.com](https://supabase.com)
- **LiveKit** server — [LiveKit Cloud](https://cloud.livekit.io) or self-hosted
- **DigitalOcean Spaces** bucket — used for recording storage (any S3-compatible service works)
- **Google Gemini API key** — [Google AI Studio](https://aistudio.google.com/app/apikey)

## Setup

The setup is split into five steps. Follow them in order — later steps depend on values produced by earlier ones.

### 1. Clone the repository

```bash
git clone https://github.com/eashwar910/Farmer-Buddy.git
cd Farmer-Buddy
```

The repo is a monorepo with two independently installed packages: [mobile-app/](mobile-app/) and [web/](web/). Run `npm install` separately inside each.

### 2. Create and seed the Supabase project

1. Create a new project at [supabase.com](https://supabase.com). Choose a strong database password and **save it** — you'll need it for `SUPABASE_DB_URL` in step 5.
2. In the Supabase SQL editor, run these files **in this exact order** (each builds on the previous):
   1. [mobile-app/supabase/schema.sql](mobile-app/supabase/schema.sql)
   2. [mobile-app/supabase/phase2_shifts.sql](mobile-app/supabase/phase2_shifts.sql)
   3. [mobile-app/supabase/phase4_recordings.sql](mobile-app/supabase/phase4_recordings.sql)
   4. [mobile-app/supabase/phase5_ai_processing.sql](mobile-app/supabase/phase5_ai_processing.sql)
3. Apply the migrations from [mobile-app/supabase/migrations/](mobile-app/supabase/migrations/) in filename order:
   1. `20260307_shift_reports.sql`
   2. `20260402_recording_chunks.sql`
   3. `20260406_add_gardener_role.sql`
4. (Optional) Run [mobile-app/supabase/seed.sql](mobile-app/supabase/seed.sql) to insert sample data.
5. From **Project Settings → API**, copy the values you'll reuse later:
   - **Project URL** → goes into `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → goes into `SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → goes into `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions and worker only — **never expose this in the mobile or web client**)

### 3. Deploy the Supabase Edge Functions

The Edge Functions in [mobile-app/supabase/functions/](mobile-app/supabase/functions/) generate LiveKit tokens, kick off recordings, and produce shift reports. Both clients call them via HTTP, so they must be deployed before the apps will work end-to-end.

```bash
# Authenticate the CLI (one-time)
supabase login

# Link the local repo to your project (run from mobile-app/)
cd mobile-app
supabase link --project-ref <your-project-ref>

# Set the secrets the functions need at runtime
supabase secrets set \
  LIVEKIT_API_KEY=your-livekit-api-key \
  LIVEKIT_API_SECRET=your-livekit-api-secret \
  LIVEKIT_URL=wss://your-livekit-server.com \
  DO_SPACES_ENDPOINT=https://your-region.digitaloceanspaces.com \
  DO_SPACES_BUCKET=your-bucket-name \
  DO_SPACES_KEY=your-spaces-key \
  DO_SPACES_SECRET=your-spaces-secret \
  S3_REGION=sgp1 \
  GEMINI_API_KEY=your-gemini-api-key

# Deploy each function
supabase functions deploy generate-livekit-token
supabase functions deploy generate-shift-report
supabase functions deploy livekit-webhook
supabase functions deploy process-recording
supabase functions deploy start-egress
supabase functions deploy stop-egress
```

Your project ref is the random-looking ID in your Supabase project URL (`https://<project-ref>.supabase.co`).

### 4. Configure and run the mobile app

```bash
cd mobile-app           # from repo root
npm install
cp .env.example .env
```

Edit [mobile-app/.env](mobile-app/.env) — at minimum the four variables the **app itself** reads at runtime:

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon public key from Supabase>
LIVEKIT_URL=wss://<your-livekit-server>
GEMINI_API_KEY=<your Gemini key>
```

The remaining keys in `.env.example` (`SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_*`, `DO_SPACES_*`, `S3_REGION`, `SUPABASE_DB_URL`) are **only used by Edge Functions and the processing worker**, not by the mobile client. They're listed in `.env.example` for convenience; setting them in the Edge Function secrets (step 3) and the worker `.env` (step 6) is what actually matters.

Env vars are loaded via [`react-native-dotenv`](https://www.npmjs.com/package/react-native-dotenv) (configured in [mobile-app/babel.config.js](mobile-app/babel.config.js)). Restart the Metro bundler with `--clear` after any `.env` change:

```bash
npx expo start --clear
```

**Run the app:**

| Goal | Command | Notes |
|---|---|---|
| Quick UI iteration in Expo Go | `npm start`, then scan the QR code | LiveKit streaming **will not work** here — Expo Go doesn't bundle native WebRTC |
| Full feature dev build (Android) | `npx expo run:android` | Requires Android SDK + connected device/emulator |
| Full feature dev build (iOS) | `npx expo run:ios` | macOS + Xcode only |
| Cloud build via EAS | `eas build --profile development-device` | Uses [mobile-app/eas.json](mobile-app/eas.json) profiles |

### 5. Configure and run the web dashboard

```bash
cd ../web               # from mobile-app/
npm install
```

Create [web/.env.local](web/.env.local) with **exactly these four variables** (verified by greping `process.env` usage across the web codebase):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key from Supabase>
NEXT_PUBLIC_LIVEKIT_URL=wss://<your-livekit-server>
GEMINI_API_KEY=<your Gemini key>
```

Note: the web dashboard does **not** use `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` directly — it requests LiveKit tokens from the `generate-livekit-token` Edge Function deployed in step 3. Make sure that step is finished before testing live streams.

Run the dev server:

```bash
npm run dev
```

The dashboard is served at [http://localhost:3000](http://localhost:3000). The first-load entry point is [web/app/page.tsx](web/app/page.tsx); the manager view lives at [/dashboard](web/app/dashboard/page.tsx).

### 6. (Optional) Run the video processing worker

Required only if you want AI shift summaries. The worker runs **outside Supabase** because keyframe extraction with FFmpeg blows past the Edge Function memory limit. Full guide: [mobile-app/processing-worker/README.md](mobile-app/processing-worker/README.md).

Quick start (run on a Linux host with FFmpeg installed):

```bash
cd mobile-app/processing-worker
npm install
cp .env.example .env
```

Edit [mobile-app/processing-worker/.env](mobile-app/processing-worker/.env) — only **four** variables are required (smaller set than mobile-app/.env):

```env
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase>
SUPABASE_DB_URL=postgresql://postgres:<db-password>@db.<your-project-ref>.supabase.co:5432/postgres
GEMINI_API_KEY=<your Gemini key>
```

Find `SUPABASE_DB_URL` in **Supabase → Project Settings → Database → Connection string → URI** (use the direct URI, not the pooler).

Start it:

```bash
npm start                              # foreground (development)
# or, for production on a droplet:
npm install -g pm2
pm2 start index.js --name farmer-buddy-worker
pm2 save && pm2 startup
```

## Common scripts

### Mobile app (`mobile-app/`)

| Command | What it does |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run android` | Build and run on a connected Android device or emulator |
| `npm run ios` | Build and run on the iOS simulator (macOS only) |
| `npm run web` | Run the app in a browser via Expo Web |
| `npm run seed` | Seed the Supabase database with sample data |

### Web dashboard (`web/`)

| Command | What it does |
|---|---|
| `npm run dev` | Start Next.js in development mode |
| `npm run build` | Build for production |
| `npm start` | Start the production server (after `build`) |
| `npm run lint` | Run ESLint |

## Troubleshooting

- **Mobile app can't reach Supabase or LiveKit** — confirm your phone and dev machine are on the same network, and that your `.env` values don't have trailing whitespace or quotes.
- **LiveKit features crash in Expo Go** — Expo Go doesn't include native WebRTC. Use a development build (`npx expo run:android` / `run:ios`).
- **Processing worker errors** — see the troubleshooting section in [mobile-app/processing-worker/README.md](mobile-app/processing-worker/README.md).

## Contributing

1. Fork the repo and create a descriptively named branch off the latest `main` (e.g. `fix-weather-widget`, `add-pest-detection`).
2. Make focused commits with clear messages.
3. Push the branch to your fork and open a pull request against `eashwar910/Farmer-Buddy:main`.
4. Keep one branch per logical change — small PRs are reviewed faster.
