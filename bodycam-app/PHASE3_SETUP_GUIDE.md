# Phase 3: LiveKit Server Setup & Live Streaming — Complete Setup Guide

**Domain:** `farmerbuddy.site`
**Testing setup:** iOS Simulator (Manager) + Physical iPhone connected via USB (Employee)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Digital Ocean Droplet Setup](#2-digital-ocean-droplet-setup)
3. [DNS Configuration on farmerbuddy.site](#3-dns-configuration-on-farmerbuddysite)
4. [Install LiveKit Server on the Droplet](#4-install-livekit-server-on-the-droplet)
5. [Configure LiveKit (TLS via Caddy)](#5-configure-livekit-tls-via-caddy)
6. [Generate LiveKit API Keys](#6-generate-livekit-api-keys)
7. [Start LiveKit Server](#7-start-livekit-server)
8. [Verify LiveKit is Running](#8-verify-livekit-is-running)
9. [Deploy the Supabase Edge Function](#9-deploy-the-supabase-edge-function)
10. [Set Supabase Edge Function Secrets](#10-set-supabase-edge-function-secrets)
11. [Build Two Expo Dev Clients (Simulator + Device)](#11-build-two-expo-dev-clients-simulator--device)
12. [Run Both Instances Simultaneously](#12-run-both-instances-simultaneously)
13. [Test the Full Flow](#13-test-the-full-flow)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Prerequisites

Before starting, make sure you have:

- [ ] A **Digital Ocean** account (https://cloud.digitalocean.com)
- [ ] Access to DNS settings for **farmerbuddy.site** (wherever you registered it — Namecheap, Cloudflare, etc.)
- [ ] **Supabase CLI** installed: `npm install -g supabase`
- [ ] **EAS CLI** installed: `npm install -g eas-cli`
- [ ] **Xcode** installed with at least one iOS Simulator (e.g., iPhone 16 Pro)
- [ ] Your **physical iPhone** connected to your Mac via USB
- [ ] An **Apple Developer account** (free or paid — paid needed for device builds)
- [ ] Your Supabase project running with Phase 1 + Phase 2 schema applied

---

## 2. Digital Ocean Droplet Setup

### 2.1 Create a Droplet

1. Log in to **Digital Ocean** → **Create** → **Droplets**
2. Settings:
   - **Region**: `SGP1` (Singapore — closest to you)
   - **Image**: **Ubuntu 24.04 LTS**
   - **Size**: **Basic** → **Regular** → **4 GB RAM / 2 vCPU** ($24/mo)
   - **Authentication**: **SSH Key** (recommended) or Password
   - **Hostname**: `livekit-server`
3. Click **Create Droplet**
4. **Write down the public IPv4 address** — e.g., `164.90.xxx.xxx`. You'll use this everywhere below.

### 2.2 SSH into the Droplet

```bash
ssh root@YOUR_DROPLET_IP
```

### 2.3 Initial Server Setup

Run these commands on the droplet:

```bash
# Update system
apt update && apt upgrade -y

# Install tools
apt install -y curl wget ufw

# Open required firewall ports
ufw allow OpenSSH
ufw allow 80/tcp           # HTTP (Let's Encrypt cert challenge)
ufw allow 443/tcp          # HTTPS (Caddy reverse proxy)
ufw allow 7880/tcp         # LiveKit API
ufw allow 7881/tcp         # LiveKit WebRTC TCP fallback
ufw allow 3478/udp         # TURN/STUN
ufw allow 50000:60000/udp  # WebRTC media UDP range
ufw enable
```

Type `y` when prompted about SSH disruption.

---

## 3. DNS Configuration on farmerbuddy.site

Go to your **domain registrar's DNS settings** for `farmerbuddy.site` and add **two A records**:

| Type | Name      | Value (your droplet IP) | TTL  |
|------|-----------|-------------------------|------|
| A    | `livekit` | `YOUR_DROPLET_IP`       | 300  |
| A    | `turn`    | `YOUR_DROPLET_IP`       | 300  |

This creates:
- `livekit.farmerbuddy.site` → your droplet (LiveKit WebSocket endpoint)
- `turn.farmerbuddy.site` → your droplet (TURN relay for restrictive networks)

### Verify DNS (wait 2-5 minutes first)

```bash
# Run on your Mac
ping livekit.farmerbuddy.site
ping turn.farmerbuddy.site
```

Both should resolve to your droplet's IP. If not, wait longer or check your DNS panel.

---

## 4. Install LiveKit Server on the Droplet

SSH into the droplet and run:

```bash
curl -sSL https://get.livekit.io | bash
livekit-server --version
```

You should see `livekit-server version 1.x.x`.

---

## 5. Configure LiveKit (TLS via Caddy)

### 5.1 Create the LiveKit Config

```bash
mkdir -p /etc/livekit
nano /etc/livekit/livekit.yaml
```

Paste this (we'll fill in the API key in step 6):

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true

turn:
  enabled: true
  domain: turn.farmerbuddy.site
  tls_port: 5349
  udp_port: 3478
  external_tls: true

keys:
  PLACEHOLDER_KEY: PLACEHOLDER_SECRET

logging:
  level: info
```

Save: `Ctrl+X` → `Y` → `Enter`

### 5.2 Install Caddy (Reverse Proxy for automatic TLS)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy
```

### 5.3 Configure Caddy

```bash
nano /etc/caddy/Caddyfile
```

Replace entire contents with:

```
livekit.farmerbuddy.site {
    reverse_proxy localhost:7880
}

turn.farmerbuddy.site {
    reverse_proxy localhost:5349
}
```

Save, then:

```bash
systemctl restart caddy
systemctl enable caddy
```

Caddy automatically obtains Let's Encrypt TLS certificates. This may take 30-60 seconds on first run.

---

## 6. Generate LiveKit API Keys

```bash
livekit-server generate-keys
```

Output example:

```
API Key:    APIdFg3h8Jk2mN
API Secret: a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ012345
```

**Copy both values somewhere safe.** You need them in 3 places.

### 6.1 Update the LiveKit Config

```bash
nano /etc/livekit/livekit.yaml
```

Replace the `keys` section with your actual values:

```yaml
keys:
  APIdFg3h8Jk2mN: a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ012345
```

Save and exit.

---

## 7. Start LiveKit Server

### 7.1 Create a Systemd Service

```bash
nano /etc/systemd/system/livekit.service
```

Paste:

```ini
[Unit]
Description=LiveKit Server
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/livekit-server --config /etc/livekit/livekit.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Save, then start:

```bash
systemctl daemon-reload
systemctl start livekit
systemctl enable livekit
```

---

## 8. Verify LiveKit is Running

### 8.1 Check Service Status

```bash
systemctl status livekit
# Should show: active (running)

systemctl status caddy
# Should show: active (running)
```

### 8.2 Check Logs

```bash
journalctl -u livekit -f
# Press Ctrl+C to stop tailing
```

### 8.3 Test TLS from Your Mac

Open in a browser: `https://livekit.farmerbuddy.site`

You should see a blank page or a small JSON response — **no SSL errors**. That confirms TLS is working.

### 8.4 Test with LiveKit CLI (recommended)

On your **Mac**:

```bash
brew install livekit-cli

lk room list \
  --url wss://livekit.farmerbuddy.site \
  --api-key YOUR_API_KEY \
  --api-secret YOUR_API_SECRET
```

Should return `[]` (empty list). If it connects without error, LiveKit is fully operational.

---

## 9. Deploy the Supabase Edge Function

On your **Mac**, in the project directory:

```bash
cd /Users/eashwarsiddha/Documents/UoNM/Year2/Sem2/SEGP_2/bcV1.0/bodycam-app

# Login to Supabase CLI (opens browser)
supabase login

# Link to your project
supabase link --project-ref bkwrixhpykvcdpkvezsd

# Deploy the Edge Function
supabase functions deploy generate-livekit-token
```

Expected output:

```
Deploying function generate-livekit-token...
Function generate-livekit-token deployed successfully.
```

---

## 10. Set Supabase Edge Function Secrets

Still on your Mac:

```bash
supabase secrets set LIVEKIT_API_KEY=YOUR_API_KEY
supabase secrets set LIVEKIT_API_SECRET=YOUR_API_SECRET
```

Replace with the actual values from Step 6.

Verify:

```bash
supabase secrets list
```

You should see `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` listed.

---

## 11. Build Two Expo Dev Clients (Simulator + Device)

You need **two separate builds**: one for the iOS Simulator (manager) and one for your physical iPhone (employee).

### 11.1 Login to EAS

```bash
npx eas login
```

### 11.2 Configure EAS

```bash
npx eas build:configure
```

Then edit `eas.json` to have **two development profiles**:

```json
{
  "cli": {
    "version": ">= 3.0.0"
  },
  "build": {
    "development-simulator": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "development-device": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

### 11.3 Build for iOS Simulator (Manager)

```bash
npx eas build --profile development-simulator --platform ios
```

- Takes ~10-20 minutes (builds in the cloud)
- When done, **download the `.tar.gz`** file from the EAS dashboard or the link in the terminal
- Extract it — you'll get a `.app` folder
- Install it on the simulator:

```bash
# Open the simulator first (via Xcode → Open Developer Tool → Simulator)
# Then drag-and-drop the .app onto the simulator window
# OR use the command line:
xcrun simctl install booted /path/to/bodycam-app.app
```

### 11.4 Register Your Physical iPhone

Your iPhone must be registered with Apple for ad-hoc distribution:

```bash
npx eas device:create
```

This gives you a URL — **open it on your iPhone in Safari**. It will install a provisioning profile. Follow the prompts.

> **Note:** After registering, you may need to wait a minute, then proceed to the build.

### 11.5 Build for Physical iPhone (Employee)

```bash
npx eas build --profile development-device --platform ios
```

- Takes ~10-20 minutes
- When done, you'll get a link or QR code
- **Open the link on your iPhone** to install the app
- Alternatively, install via Apple Configurator or Xcode:
  - Download the `.ipa` file
  - In Xcode: **Window → Devices and Simulators** → select your iPhone → drag the `.ipa` onto it

### 11.6 Trust the Developer Certificate (iPhone only)

On your iPhone:
1. Go to **Settings → General → VPN & Device Management**
2. Find your Apple Developer certificate
3. Tap **Trust**

---

## 12. Run Both Instances Simultaneously

### 12.1 Start the Dev Server

```bash
cd /Users/eashwarsiddha/Documents/UoNM/Year2/Sem2/SEGP_2/bcV1.0/bodycam-app
npx expo start --dev-client
```

This starts Metro on your Mac. Both the simulator and your iPhone will connect to it.

### 12.2 Open on iOS Simulator (Manager)

1. In the Simulator, open the **bodycam-app** (it should already be installed from step 11.3)
2. It will show a screen to enter the Metro URL — it should auto-detect, or enter: `http://localhost:8081`
3. Log in as your **manager** account

### 12.3 Open on Physical iPhone (Employee)

1. Make sure your iPhone is **on the same Wi-Fi network** as your Mac
2. Open the **bodycam-app** on your iPhone
3. It should auto-detect the Metro bundler, or manually enter your Mac's local IP: `http://192.168.x.x:8081`
   - Find your Mac's IP: **System Settings → Wi-Fi → Details → IP Address**
4. Log in as your **employee** account

> **Important:** Both apps connect to the same Metro bundler. They run independently with separate Supabase sessions (different logged-in users).

### 12.4 Why This Setup Works

| Instance | Device | Role | Camera | LiveKit |
|----------|--------|------|--------|---------|
| Simulator | Xcode iOS Simulator | **Manager** (subscribe-only) | Not needed — manager only watches | Receives video streams |
| iPhone | Your physical iPhone via USB/Wi-Fi | **Employee** (publisher) | Real back camera | Publishes video stream |

The **manager doesn't need a camera** (subscribe-only token), so the simulator is perfect for it. The **employee needs the real camera**, so it must be on the physical iPhone.

---

## 13. Test the Full Flow

### Pre-flight Checklist

- [ ] LiveKit server running: `ssh root@YOUR_IP "systemctl status livekit"` → `active`
- [ ] Caddy running: `ssh root@YOUR_IP "systemctl status caddy"` → `active`
- [ ] Edge Function deployed: `supabase functions list` → shows `generate-livekit-token`
- [ ] Secrets set: `supabase secrets list` → shows `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- [ ] DNS working: `ping livekit.farmerbuddy.site` → resolves to droplet IP
- [ ] Metro running: `npx expo start --dev-client`
- [ ] Simulator app open and logged in as manager
- [ ] iPhone app open and logged in as employee

### Step-by-Step Test Script

**Step 1 — Manager starts shift (Simulator)**
1. On the Simulator, tap **Start Shift**
2. The shift card should turn green with a running timer
3. On the iPhone, the "Shift Started!" modal should pop up within 1-2 seconds

**Step 2 — Employee starts streaming (iPhone)**
1. On the iPhone, dismiss the modal (tap "Got it")
2. Tap **Start Streaming**
3. iOS will ask for camera permission → tap **Allow**
4. You should see:
   - Your camera preview (back camera)
   - A green "Streaming Live" indicator
   - Connection status showing "connected"

**Step 3 — Manager views live feed (Simulator)**
1. On the Simulator, look at the **Live Feeds** section
2. You should see the employee's camera stream appear within 2-3 seconds
3. **Tap the stream** → it should open fullscreen
4. **Tap ✕** → back to grid view

**Step 4 — Test reconnection (iPhone)**
1. On the iPhone, swipe up to background the app
2. Wait 3-5 seconds
3. Re-open the app
4. Streaming should auto-reconnect (check the manager's grid)

**Step 5 — Manager ends shift (Simulator)**
1. On the Simulator, tap **End Shift** → tap **End Shift** to confirm
2. On the iPhone, the "Shift Ended" modal should appear
3. Streaming stops automatically on both sides
4. The Live Feeds section disappears from the manager view

**Step 6 — Pull to refresh (Simulator)**
1. On the Simulator, pull down on the employee list
2. The list should refresh and show updated online/offline status

### Verification Checklist

- [ ] Employee camera stream appears in manager grid within 2-3 seconds
- [ ] Tap-to-enlarge fullscreen works on manager side
- [ ] Employee name label shows on the video tile
- [ ] Ending shift disconnects all streams gracefully
- [ ] Backgrounding and reopening the employee app reconnects streaming
- [ ] Pull-to-refresh on manager screen updates employee list
- [ ] Online/offline indicators are correct
- [ ] "Shift Started" modal appears on employee side
- [ ] "Shift Ended" modal appears on employee side
- [ ] No crash on either device during the full flow

---

## 14. Troubleshooting

### "Failed to connect" or "LiveKit not configured"

```bash
# Check Edge Function is deployed
supabase functions list

# Check secrets
supabase secrets list

# Check Edge Function logs
supabase functions logs generate-livekit-token --tail
```

### "No active shift found" when pressing Start Streaming

- The manager must start a shift **before** the employee can stream
- Verify in Supabase Dashboard → Table Editor → `shifts` → there should be a row with `status = 'active'`

### Camera not working on iPhone

- You **must** use the dev build, not Expo Go
- Go to iPhone **Settings → Privacy & Security → Camera** → make sure bodycam-app is allowed
- Restart the app after granting permission

### Camera not available on Simulator

- This is **expected** — iOS Simulator has no camera hardware
- The manager doesn't need a camera (subscribe-only), so this is fine
- If you want to test employee streaming, you must use the physical iPhone

### LiveKit WSS connection fails

```bash
# Check DNS
ping livekit.farmerbuddy.site

# Check services on the droplet
ssh root@YOUR_IP "systemctl status livekit && systemctl status caddy"

# Check Caddy logs (TLS issues show here)
ssh root@YOUR_IP "journalctl -u caddy --no-pager -n 50"

# Check LiveKit logs
ssh root@YOUR_IP "journalctl -u livekit --no-pager -n 50"

# Check firewall
ssh root@YOUR_IP "ufw status"
```

### iPhone can't connect to Metro bundler

- Make sure iPhone and Mac are on the **same Wi-Fi network**
- Try entering the URL manually: `http://YOUR_MAC_IP:8081`
- If on a corporate/university network that blocks local traffic, use USB:
  - Connect iPhone via USB cable
  - The dev client should auto-detect via USB

### Streams are laggy

- Check droplet bandwidth: Digital Ocean basic droplets have limited bandwidth
- Make sure TURN is working (some networks block direct UDP)
- Try moving closer to your Wi-Fi router
- Check `50000:60000/udp` port range is open on the droplet

### Edge Function returns 500

```bash
supabase functions logs generate-livekit-token --tail
```

Common causes:
- Missing `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` secrets
- `livekit-server-sdk` version issue — the function uses `2.6.1`

---

## Quick Reference

| Item | Value |
|------|-------|
| **Domain** | `farmerbuddy.site` |
| **LiveKit URL** | `wss://livekit.farmerbuddy.site` |
| **TURN domain** | `turn.farmerbuddy.site` |
| **LiveKit API Port** | 7880 |
| **TURN UDP Port** | 3478 |
| **WebRTC TCP Port** | 7881 |
| **WebRTC UDP Range** | 50000-60000 |
| **Supabase Edge Function** | `generate-livekit-token` |
| **Required Secrets** | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| **Simulator** | Manager (subscribe-only, no camera needed) |
| **Physical iPhone** | Employee (publishes back camera) |
| **Metro command** | `npx expo start --dev-client` |
| **Simulator build profile** | `development-simulator` |
| **Device build profile** | `development-device` |

---

## Cost Estimate

| Service | Cost |
|---------|------|
| Digital Ocean Droplet (4GB/2vCPU) | ~$24/month |
| farmerbuddy.site domain | Already owned |
| Supabase (free tier) | $0 |
| EAS Build (free tier: 30 builds/month) | $0 |
| **Total** | **~$24/month** |
