# Farmer Buddy Web Dashboard — Setup & Deployment Guide

This document covers everything you need to do manually to get `farmerbuddy.site` live. The code is already written in `web/`. You just need to follow these steps.

---

## Prerequisites

- GitHub account with the `eashwar910/Farmer-Buddy` repository already pushed
- Access to your domain registrar (wherever `farmerbuddy.site` is registered)
- A Vercel account (free tier is fine)

---

## Step 1 — Push the `web/` directory to GitHub

The `web/` directory lives at the repo root. Make sure it's committed and pushed:

```bash
cd /path/to/your/repo
git add web/
git commit -m "Add web dashboard"
git push origin main
```

> **Note:** `web/.env.local` is in `.gitignore` and will NOT be pushed. You'll add those values in Vercel directly (Step 3).

---

## Step 2 — Create a Vercel Project

1. Go to **[vercel.com](https://vercel.com)** and sign in (use GitHub OAuth for easiest setup).
2. Click **"Add New Project"**.
3. Import the **`eashwar910/Farmer-Buddy`** repository.
4. On the configuration screen, set:

   | Setting | Value |
   |---|---|
   | **Framework Preset** | Next.js |
   | **Root Directory** | `web` |
   | **Build Command** | `npm run build` (auto-detected) |
   | **Output Directory** | `.next` (auto-detected) |
   | **Install Command** | `npm install` (auto-detected) |

5. Click **"Deploy"** — Vercel will build and deploy to a `*.vercel.app` URL first.

---

## Step 3 — Add Environment Variables in Vercel

After the project is created, go to **Project → Settings → Environment Variables** and add these:

| Variable Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://bkwrixhpykvcdpkvezsd.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(your Supabase anon key — copy from `mobile-app/.env`)* | Production, Preview, Development |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://livekit.farmerbuddy.site` | Production, Preview, Development |
| `GEMINI_API_KEY` | *(your Gemini API key — copy from `mobile-app/.env`)* | Production, Preview, Development |

> **Important:** `GEMINI_API_KEY` must NOT have the `NEXT_PUBLIC_` prefix — it stays server-side only.

After adding the variables, trigger a **Redeploy** from the Vercel dashboard (Deployments → three-dot menu → Redeploy).

---

## Step 4 — Add the Custom Domain `farmerbuddy.site`

### In Vercel:

1. Go to **Project → Settings → Domains**.
2. Click **"Add Domain"**.
3. Enter `farmerbuddy.site` and click **Add**.
4. Also add `www.farmerbuddy.site` if you want the `www` subdomain to redirect.
5. Vercel will show you the DNS records you need to add.

### In your Domain Registrar:

You need to add **A records** or **CNAME records** as shown by Vercel. The exact records Vercel gives you will look like one of these options:

**Option A — A Record (recommended for apex domain):**
```
Type:  A
Name:  @  (or blank)
Value: 76.76.21.21
TTL:   Auto / 3600
```

**Option B — CNAME (for www subdomain):**
```
Type:  CNAME
Name:  www
Value: cname.vercel-dns.com
TTL:   Auto / 3600
```

> **Critical:** Do NOT add any record for `livekit` subdomain — `livekit.farmerbuddy.site` is already configured on your DigitalOcean droplet and must not be changed.

After adding the DNS records, Vercel will automatically provision an SSL certificate for `farmerbuddy.site` (usually takes 1–5 minutes after DNS propagates, which can take up to 24 hours).

---

## Step 5 — Verify the Supabase Auth Redirect URLs

To allow Supabase Auth to work correctly from the web domain:

1. Go to **[supabase.com](https://supabase.com)** → your project → **Authentication → URL Configuration**.
2. Under **"Site URL"**, make sure `https://farmerbuddy.site` is set (or add it).
3. Under **"Redirect URLs"**, add:
   ```
   https://farmerbuddy.site/**
   https://www.farmerbuddy.site/**
   ```

This ensures session cookies work properly on the web app.

---

## Step 6 — Verify Deployment

Once DNS has propagated:

1. Open `https://farmerbuddy.site` in a browser — you should see the Farmer Buddy login page.
2. Log in with a **manager** account → should redirect to `/dashboard`.
3. Log in with an **employee** account → should redirect to `/employee`.
4. Test each feature tab.

---

## Ongoing Deployments

Every `git push` to the `main` branch will automatically trigger a new Vercel deployment. No manual action needed.

If you want to deploy a preview branch, push to any non-main branch — Vercel creates a preview URL automatically.

---

## Troubleshooting

### "The page isn't working" after login
- Check that all four environment variables are set in Vercel (Step 3).
- Redeploy after adding them.

### 401 errors when fetching data
- The Supabase anon key might be wrong. Verify it matches `mobile-app/.env`.

### LiveKit streams not appearing
- The manager must have an active shift. Start one from the mobile app first.
- Check that `NEXT_PUBLIC_LIVEKIT_URL` is exactly `wss://livekit.farmerbuddy.site` (no trailing slash).

### SSL certificate not provisioned
- DNS propagation can take up to 24 hours. Wait and retry.
- Make sure you added the exact records Vercel specified — not approximate ones.

### `livekit.farmerbuddy.site` stopped working
- You may have accidentally changed the DNS for `livekit`. Check your registrar and ensure only `@` (apex) records were added. The `livekit` subdomain record should remain untouched.

---

## Architecture Summary

```
farmerbuddy.site  ──►  Vercel (web/ Next.js app)
                           │
                           ├── /api/chat  ──────────►  Gemini API (server-side)
                           ├── /api/leaf-detect  ──►  Hugging Face Spaces
                           ├── /dashboard  ─────────►  Manager view
                           └── /employee  ──────────►  Employee view
                                   │
                                   ├── Supabase (auth + data)
                                   └── wss://livekit.farmerbuddy.site (streams)

livekit.farmerbuddy.site  ──►  DigitalOcean droplet  (UNTOUCHED)
```
