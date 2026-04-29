# Farmer Buddy

An agriculture workforce management platform combining a React Native mobile app, a Next.js manager web dashboard, and a real-time bodycam streaming pipeline powered by LiveKit and Supabase.

---

## Repository Structure

```
SEGP_2/
├── mobile-app/              # React Native / Expo mobile app
│   ├── src/
│   │   ├── screens/         # App screens (login, dashboards, features)
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom hooks (auth, shift, presence)
│   │   ├── services/        # API/service layer
│   │   ├── navigation/      # React Navigation stack
│   │   ├── context/         # React context providers
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Utility functions
│   ├── supabase/
│   │   ├── functions/       # Supabase Edge Functions
│   │   ├── migrations/      # Database migrations
│   │   ├── schema.sql        # Full DB schema
│   │   └── seed.sql
│   └── processing-worker/   # Node.js video processing worker (DigitalOcean)
│
├── web/                     # Next.js manager web dashboard
│   ├── app/
│   │   ├── dashboard/       # Manager dashboard page
│   │   ├── employee/        # Employee view page
│   │   └── api/
│   │       ├── chat/        # Agronomist AI chat API route (Gemini)
│   │       └── leaf-detect/ # Plant disease detection API route (HuggingFace)
│   ├── components/
│   │   ├── dashboard/       # Dashboard-specific components (tabs, cards)
│   │   ├── AISummaryPanel.tsx
│   │   ├── AgronomistChat.tsx
│   │   ├── LeafDetection.tsx
│   │   ├── LiveStreamGrid.tsx
│   │   └── WeatherWidget.tsx
│   └── lib/                 # Supabase client helpers
│
├── supabase/                # Root-level shared Supabase functions
├── DJI_CAMERA_SETUP.md      # DJI Action 6 / RTMP ingress setup guide
└── README.md
```

> **Not tracked by git:** `docs/`, `.claude/`, `demoapp/`, `node_modules/`, `ios/`, `android/`, `.env` files, `.next/`, `.expo/`, and all build artifacts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | React Native + Expo (SDK 54), TypeScript |
| Web dashboard | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Database & Auth | Supabase (PostgreSQL, Row Level Security, Realtime) |
| Edge Functions | Supabase Deno runtime |
| Live streaming | LiveKit (self-hosted on DigitalOcean) |
| RTMP ingress | LiveKit Ingress + DJI Mimo (DJI Action 6) |
| Video storage | DigitalOcean Spaces (S3-compatible) |
| AI — chat | Google Gemini 2.5 Flash |
| AI — video summaries | Google Gemini 1.5 Flash + FFmpeg |
| AI — plant disease | Hugging Face CNN model (moazx/plant-leaf-diseases-detection) |
| Processing worker | Node.js + PM2, deployed on DigitalOcean droplet |

---

## Features

### Mobile App (Role-Based)

**Employee**
- Login / Sign-up with Supabase Auth
- Live bodycam streaming from the device via LiveKit
- View active shift status and history
- Agronomist AI chat (text + image, Gemini-powered)
- IoT sensor data entry and AI analysis
- Leaf disease detection from camera photos
- Irrigation timer with AI scheduling recommendations
- Weather widget (location-based)

**Manager**
- Start and end shifts
- Live grid view of all active employee streams
- Shift details and per-recording summaries
- Access all employee features above

### Web Dashboard (Manager)

- Overview stats and farm health chart
- Shifts tab: list of shifts with status and recordings
- Streams tab: live video grid of active employee bodycams, DJI drone/action-cam RTMP feeds
- AI Summary Panel: Gemini-generated summaries of completed recordings
- Agronomist Chat: conversational AI assistant for crop, pest, irrigation, and soil queries (supports image upload)
- Leaf Detection: plant disease identification via CNN model
- Weather Widget

---

## Architecture Overview

```
Mobile App (Expo)
    │
    ├─► Supabase Auth + Postgres (users, shifts, recordings, AI summaries)
    ├─► Supabase Realtime (live presence, shift status)
    ├─► Supabase Edge Functions
    │       ├── generate-livekit-token   — issues LiveKit room tokens
    │       ├── livekit-webhook          — handles LiveKit events
    │       ├── start-egress / stop-egress — controls cloud recording
    │       ├── process-recording        — triggers AI summary pipeline
    │       ├── generate-shift-report    — builds per-shift PDF/summary
    │       └── manage-camera-ingress    — provisions RTMP ingress for DJI cameras
    └─► LiveKit Server (DigitalOcean)
            └── RTMP Ingress (port 1935) for DJI Action 6 via DJI Mimo

Processing Worker (DigitalOcean Droplet)
    │  Listens on Postgres NOTIFY
    ├─► Downloads video from DO Spaces
    ├─► Extracts keyframes with FFmpeg (1 frame / 10 s)
    └─► Sends to Gemini 1.5 Flash → stores JSON summary in Supabase

Web Dashboard (Next.js → Vercel)
    ├─► Reads Supabase (shifts, recordings, summaries, presence)
    ├─► Subscribes to LiveKit rooms for live stream grid
    ├─► /api/chat → Gemini 2.5 Flash (agronomist assistant)
    └─► /api/leaf-detect → Hugging Face CNN model
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- A Supabase project
- A LiveKit server (or LiveKit Cloud account)
- A Google Gemini API key

### Mobile App

```bash
cd mobile-app
npm install
cp .env.example .env   # fill in your credentials
npx expo start
```

Run on device:
```bash
npx expo run:ios      # requires Xcode on macOS
npx expo run:android  # requires Android Studio
```

### Web Dashboard

```bash
cd web
npm install
# create .env.local with the variables below
npm run dev
```

Required environment variables in `web/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
GEMINI_API_KEY=
```

### Processing Worker

Deploy to your DigitalOcean droplet (requires FFmpeg and Node.js 18+):

```bash
scp -r mobile-app/processing-worker root@<your-droplet-ip>:/root/
ssh root@<your-droplet-ip>
cd /root/processing-worker
npm install
cp .env.example .env   # fill in credentials
npm install -g pm2
pm2 start index.js --name bodycam-worker
pm2 save && pm2 startup
```

See [mobile-app/processing-worker/README.md](mobile-app/processing-worker/README.md) for full setup details.

---

## Database

The Supabase schema is in [mobile-app/supabase/schema.sql](mobile-app/supabase/schema.sql) with incremental migrations in [mobile-app/supabase/migrations/](mobile-app/supabase/migrations/).

Key tables:

| Table | Description |
|---|---|
| `users` | Profiles with role (`manager` / `employee`) |
| `shifts` | Shift records owned by a manager |
| `recordings` | Video recordings linked to shifts |
| `ai_summaries` | Gemini-generated summaries per recording |
| `camera_ingresses` | RTMP ingress credentials for DJI cameras |

All tables use Row Level Security (RLS). Realtime is enabled on `shifts`.

To apply migrations:
```bash
cd mobile-app
supabase db push
```

---

## Supabase Edge Functions

Deploy all functions:
```bash
cd mobile-app
supabase functions deploy
```

Required secrets:
```bash
supabase secrets set LIVEKIT_API_KEY=...
supabase secrets set LIVEKIT_API_SECRET=...
supabase secrets set LIVEKIT_API_URL=https://your-livekit-server
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

---

## DJI Camera / RTMP Streaming

For setup and troubleshooting of the LiveKit RTMP ingress and DJI Action 6 via DJI Mimo, see [DJI_CAMERA_SETUP.md](DJI_CAMERA_SETUP.md).

---

## Environment Variables Reference

### Mobile App (`mobile-app/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `LIVEKIT_URL` | LiveKit WebSocket URL (`wss://...`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `LIVEKIT_API_URL` | LiveKit HTTP API URL |
| `DO_SPACES_ENDPOINT` | DigitalOcean Spaces endpoint |
| `DO_SPACES_BUCKET` | Spaces bucket name |
| `DO_SPACES_KEY` | Spaces access key |
| `DO_SPACES_SECRET` | Spaces secret key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `SUPABASE_DB_URL` | Direct Postgres connection string (for processing worker) |

### Processing Worker (`processing-worker/.env`)

Same as above minus the LiveKit/Spaces keys. Needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, and `GEMINI_API_KEY`.
