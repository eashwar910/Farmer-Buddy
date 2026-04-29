# DJI Camera RTMP Streaming — Full Fix Guide

**Server:** `livekit.farmerbuddy.site` (DigitalOcean droplet, IP `178.128.217.47`) — Ubuntu 24.04, Linux  
**Local machine:** macOS  
**Project:** Farmer Buddy  
**Date diagnosed & fixed:** 2026-04-24

> Commands are marked **[Mac]** or **[Server]** so it's clear where to run them.  
> Server commands run inside an SSH session. Mac commands run in Terminal on your machine.

---

## Root Causes Found

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | 🔴 Critical | `livekit-ingress` Docker container crash-looping — no config file + wrong network mode | **✅ Fixed on server** |
| 2 | 🔴 Critical | Stale ingress credentials served from DB without verifying they still exist on LiveKit | **✅ Fixed in code** |
| 3 | 🟡 Medium | `enable_transcoding: true` without confirmed transcoding support | **✅ Fixed in code** |
| 4 | 🟡 Medium | DJI Mimo setup instructions were incorrect (wrong URL format) | **✅ Fixed in code** |
| 5 | 🟡 Medium | `camera_ingresses` migration may not be applied to production Supabase | **Needs verification** |
| 6 | 🟡 Medium | Supabase edge function secrets may not be deployed | **Needs verification** |

---

## Part 1 — Server (what was wrong and how it was fixed)

### What was happening

The `livekit-ingress` Docker container was already on the server but crash-looping with zero log output. Two reasons:

1. **No config file** — the `ingress` binary exits immediately and silently if it can't find a config file. The container had no volume mount and no config.
2. **Wrong network mode (bridge)** — bridge networking isolates the container from the host's `localhost`. The LiveKit server requires Redis at `localhost:6379`. The ingress couldn't reach it, so it died on startup.

### What was done

1. Created `/etc/livekit/ingress.yaml` on the host with the correct API credentials and Redis address.
2. Stopped and removed the old container.
3. Recreated the container with `--network host` (so `localhost:6379` is reachable) and the config file mounted.

Port 1935 is now **open and accepting RTMP connections**.

---

### If you ever need to recreate the ingress container

**[Mac] — SSH in first:**
```bash
ssh root@178.128.217.47
# password: Agr1t1x-SEGP
```

**[Server] — Check the config file exists:**
```bash
cat /etc/livekit/ingress.yaml
```

It should contain:
```yaml
api_key: APIno7DZWPkyn5N
api_secret: G8yQueZ5sTCkMAKQeddL2DnaarZHXGcLId3ooEh0z3Y
ws_url: wss://livekit.farmerbuddy.site

redis:
  address: localhost:6379

rtmp_port: 1935
http_relay_port: 9090

logging:
  level: debug
```

If the file is missing, recreate it:
```bash
cat > /etc/livekit/ingress.yaml << 'EOF'
api_key: APIno7DZWPkyn5N
api_secret: G8yQueZ5sTCkMAKQeddL2DnaarZHXGcLId3ooEh0z3Y
ws_url: wss://livekit.farmerbuddy.site

redis:
  address: localhost:6379

rtmp_port: 1935
http_relay_port: 9090

logging:
  level: debug
EOF
```

**[Server] — Recreate the container:**
```bash
docker stop livekit-ingress && docker rm livekit-ingress

docker run -d \
  --name livekit-ingress \
  --network host \
  --restart unless-stopped \
  -v /etc/livekit/ingress.yaml:/config.yaml \
  livekit/ingress \
  --config /config.yaml
```

**[Server] — Verify it started:**
```bash
docker logs livekit-ingress | head -20
# Should show: "connecting to redis" then "service ready"
```

**[Mac] — Verify port 1935 is open:**
```bash
nc -zv livekit.farmerbuddy.site 1935
# Expected: Connection to livekit.farmerbuddy.site port 1935 [tcp] succeeded!
```

---

### If port 1935 is closed again

Work through this in order:

**[Server]**
```bash
# Is the container running?
docker ps | grep ingress

# If not running, check why:
docker logs livekit-ingress --tail 30

# Is UFW blocking port 1935?
ufw status | grep 1935
# If not listed:
ufw allow 1935/tcp && ufw reload
```

**[Mac] — DigitalOcean Cloud Firewall:**
If you have a Cloud Firewall attached to the droplet (separate from UFW), check:
DigitalOcean dashboard → Networking → Firewalls → add Inbound TCP rule for port 1935.

---

### Optional — Enable RTMPS on port 443

RTMPS (encrypted RTMP) is more reliable on mobile networks that block port 1935. Port 443 is already open.

**[Server]** — add to `/etc/livekit/ingress.yaml`:
```yaml
rtmps_port: 443
```

Then: `docker restart livekit-ingress`

> Only do this if plain RTMP on 1935 stops working. If nginx is on 443 you'll have a port conflict.

---

## Part 2 — Supabase (still needs verification)

All commands here run **on your Mac** in Terminal.

### 2.0 Make sure Supabase CLI is installed

**[Mac]**
```bash
# Install via Homebrew if you don't have it
brew install supabase/tap/supabase

supabase --version
```

---

### 2.1 Apply the camera_ingresses migration

The `camera_ingresses` table was added in `mobile-app/supabase/migrations/20260423_camera_ingress.sql`. Without it the edge function fails on every call with a database error.

**[Mac]**
```bash
cd /Users/eashwarsiddha/Documents/UoNM/Year2/Sem2/SEGP_2/mobile-app
supabase db push
```

Or manually via the Supabase Dashboard:
1. Open [Supabase Dashboard → SQL Editor](https://supabase.com/dashboard/project/bkwrixhpykvcdpkvezsd/sql/new)
2. Paste and run the contents of `mobile-app/supabase/migrations/20260423_camera_ingress.sql`

**Verify the table exists (paste in SQL Editor):**
```sql
SELECT * FROM camera_ingresses LIMIT 1;
```

---

### 2.2 Verify edge function secrets are deployed

**[Mac]**
```bash
cd /Users/eashwarsiddha/Documents/UoNM/Year2/Sem2/SEGP_2/mobile-app
supabase secrets list
```

You must see all four of these:
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_API_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

If any are missing:
```bash
supabase secrets set LIVEKIT_API_KEY=APIno7DZWPkyn5N
supabase secrets set LIVEKIT_API_SECRET=G8yQueZ5sTCkMAKQeddL2DnaarZHXGcLId3ooEh0z3Y
supabase secrets set LIVEKIT_API_URL=https://livekit.farmerbuddy.site
```

---

### 2.3 Deploy the updated edge function

**[Mac]**
```bash
cd /Users/eashwarsiddha/Documents/UoNM/Year2/Sem2/SEGP_2/mobile-app
supabase functions deploy manage-camera-ingress
```

---

## Part 3 — Code Fixes Already Applied

These are in the codebase and go live once you run `supabase functions deploy` above.

### 3.1 Stale ingress verification (`manage-camera-ingress/index.ts`)

**Before (bug):** When a shift already had a `camera_ingresses` DB row, the edge function returned the cached URL/key immediately without checking the LiveKit server. After any server restart those credentials are dead — the DJI app gets immediately refused.

**After (fixed):** The function now calls LiveKit's `ListIngresses` API with the cached `ingress_id` first. If LiveKit returns 0 results, the DB record is marked `deleted` and a fresh ingress is created automatically.

---

### 3.2 Transcoding disabled (`manage-camera-ingress/index.ts`)

**Before:** `enable_transcoding: true`  
**After:** `enable_transcoding: false`

The `livekit/ingress` Docker image does have GStreamer built in (confirmed from the container filesystem), so transcoding works. However, `false` is safer to start with — DJI cameras output H.264 which WebRTC handles directly. If you later find audio is choppy or missing (AAC → Opus conversion needed), flip it back to `true`.

---

### 3.3 DJI Mimo instructions corrected (`web/components/DJICameraPanel.tsx`)

**Camera:** DJI Action 6 uses **DJI Mimo**, not DJI Fly (DJI Fly is for drones).

DJI Mimo's Custom RTMP screen has a **single URL field**. The panel now shows the full combined URL (`rtmp://livekit.farmerbuddy.site:1935/live/SK_xxx`) as the primary copy target. Split Server + Key fields are in a collapsed section as a fallback.

---

## Part 4 — End-to-End Test Procedure

Run these in order to confirm everything works together.

**Step 1 — Confirm port 1935 is open [Mac]:**
```bash
nc -zv livekit.farmerbuddy.site 1935
# Must print: succeeded!
```

**Step 2 — Confirm ingress is running [Mac]:**
```bash
ssh root@178.128.217.47 "docker ps | grep ingress && docker logs livekit-ingress --tail 5"
```

**Step 3 — Create a test ingress via curl [Mac]:**

Get a JWT first:
1. Open the manager dashboard in Chrome/Safari
2. DevTools → Application → Local Storage → find the Supabase session → copy `access_token`

```bash
curl -X POST https://bkwrixhpykvcdpkvezsd.supabase.co/functions/v1/manage-camera-ingress \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -d '{"action":"create","shiftId":"YOUR_ACTIVE_SHIFT_ID"}'
```

Expected response:
```json
{"ingressId":"IN_xxx","rtmpUrl":"rtmp://livekit.farmerbuddy.site:1935/live","streamKey":"SK_xxx"}
```

**Step 4 — Test with OBS before the DJI camera [Mac]:**

OBS is the fastest way to confirm the server works independently of the DJI Mimo app.

1. Download OBS from [obsproject.com](https://obsproject.com) if not installed
2. Settings → Stream → Service: **Custom**
3. Server: `rtmp://livekit.farmerbuddy.site:1935/live`
4. Stream Key: the `streamKey` from Step 3
5. Click **Start Streaming** — if it connects and stays connected, the server is fully working

**Step 5 — Test with DJI Action 6:**
1. Open **DJI Mimo** and connect to the Action 6
2. Tap the broadcast icon → **Live** → **Custom RTMP**
3. Paste the full RTMP URL from the dashboard panel (format: `rtmp://livekit.farmerbuddy.site:1935/live/SK_xxx`)
4. Tap **Start Live**
5. Camera should appear as `employee4` in the Streams tab

---

## Part 5 — Quick Diagnostic Checklist

If the stream stops again, run through this from your Mac:

```
[Mac]    nc -zv livekit.farmerbuddy.site 1935
           → must succeed (port open)

[Mac]    ssh root@178.128.217.47 "docker ps | grep ingress"
           → must show Up, not Restarting

[Mac]    ssh root@178.128.217.47 "docker logs livekit-ingress --tail 20"
           → check for error lines after "service ready"

[Mac]    cd mobile-app && supabase secrets list
           → must have LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_API_URL

[Browser] Supabase SQL Editor: SELECT * FROM camera_ingresses;
           → table must exist

[Browser] Manager dashboard Streams tab shows DJI panel with an RTMP URL
           → edge function is returning credentials correctly

[Mac]    OBS test (Step 4 above)
           → rules out DJI Mimo-specific issues
```
