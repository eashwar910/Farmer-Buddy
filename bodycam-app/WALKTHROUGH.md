# BodyCam App - Complete Setup Walkthrough

This walkthrough will guide you through setting up and testing the entire BodyCam application including Phase 5 (AI Summarization). Follow each step carefully.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Part 1: Environment Configuration](#part-1-environment-configuration)
3. [Part 2: Database Setup](#part-2-database-setup)
4. [Part 3: React Native App Setup](#part-3-react-native-app-setup)
5. [Part 4: Deploy Edge Functions](#part-4-deploy-edge-functions)
6. [Part 5: Processing Worker Setup (Phase 5)](#part-5-processing-worker-setup-phase-5)
7. [Part 6: Testing the Complete Flow](#part-6-testing-the-complete-flow)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- ✅ Supabase project created
- ✅ DigitalOcean Spaces bucket created
- ✅ LiveKit server deployed on DigitalOcean droplet
- ✅ DigitalOcean droplet with SSH access
- ✅ iOS device or simulator with Expo Dev Client installed
- ✅ Node.js 18+ installed locally
- ✅ Supabase CLI installed: `npm install -g supabase`
- ✅ Gemini API key from Google AI Studio

---

## Part 1: Environment Configuration

### Step 1.1: Create Local Environment File

1. Navigate to the project root:
   ```bash
   cd /path/to/bodycam-app
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Open `.env` in your text editor and fill in your actual values:

   ```env
   # Supabase Configuration
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

   # LiveKit Configuration
   LIVEKIT_URL=wss://your-livekit-server.com
   LIVEKIT_API_KEY=your-livekit-api-key
   LIVEKIT_API_SECRET=your-livekit-api-secret
   LIVEKIT_API_URL=https://your-livekit-server.com

   # Digital Ocean Spaces Configuration
   DO_SPACES_ENDPOINT=https://your-region.digitaloceanspaces.com
   DO_SPACES_BUCKET=your-bucket-name
   DO_SPACES_KEY=your-spaces-key
   DO_SPACES_SECRET=your-spaces-secret
   S3_REGION=sgp1

   # Gemini AI Configuration (Phase 5)
   GEMINI_API_KEY=your-gemini-api-key-here

   # Processing Worker Configuration (Phase 5)
   SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
   ```

### Step 1.2: Get Your Credentials

**Supabase Credentials:**
1. Go to your Supabase project dashboard
2. Navigate to Settings → API
3. Copy:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY`

**Supabase Database URL:**
1. Settings → Database → Connection String → URI
2. Replace `[YOUR-PASSWORD]` with your actual database password
3. It should look like: `postgresql://postgres:yourpassword@db.xxx.supabase.co:5432/postgres`

**Gemini API Key:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key to `GEMINI_API_KEY`

---

## Part 2: Database Setup

### Step 2.1: Run Phase 1-4 Migrations

If you haven't already, run the previous phase migrations:

```bash
# In Supabase SQL Editor, run these files in order:
1. supabase/schema.sql
2. supabase/phase2_shifts.sql
3. supabase/phase4_recordings.sql
```

### Step 2.2: Run Phase 5 Migration

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Click "New Query"
4. Copy the entire contents of `supabase/phase5_ai_processing.sql`
5. Paste into the editor
6. Click "Run" (or press Cmd/Ctrl + Enter)
7. Verify there are no errors

**What this migration does:**
- Adds `processing_status` column to track AI processing
- Creates Postgres trigger for NOTIFY/LISTEN pattern
- Adds helper functions for the processing worker
- Creates indexes for performance

### Step 2.3: Configure Supabase Secrets (for Edge Functions)

1. In Supabase dashboard, go to Settings → Edge Functions
2. Add the following secrets:

```bash
# LiveKit
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_API_URL=https://your-livekit-server.com

# DO Spaces
DO_SPACES_ENDPOINT=https://your-region.digitaloceanspaces.com
DO_SPACES_BUCKET=your-bucket-name
DO_SPACES_KEY=your-spaces-key
DO_SPACES_SECRET=your-spaces-secret
S3_REGION=sgp1
```

---

## Part 3: React Native App Setup

### Step 3.1: Install Dependencies

```bash
cd bodycam-app
npm install
```

### Step 3.2: Clean and Rebuild

```bash
# Clear Metro bundler cache
npx expo start --clear

# If you've built before, clean iOS build
rm -rf ios/build
```

### Step 3.3: Build Dev Client (Required for Camera)

Since the app uses the camera, you need a dev build (Expo Go won't work):

```bash
# For iOS
npx expo run:ios

# This will:
# 1. Install CocoaPods dependencies
# 2. Build the dev client
# 3. Install it on your device/simulator
# 4. Start Metro bundler
```

**First time setup may take 10-15 minutes**

### Step 3.4: Verify App Starts

You should see:
- Login screen with "BodyCam" logo
- No error messages in the terminal
- Metro bundler running at http://localhost:8081

---

## Part 4: Deploy Edge Functions

### Step 4.1: Login to Supabase CLI

```bash
npx supabase login
```

### Step 4.2: Link Your Project

```bash
npx supabase link --project-ref your-project-id
```

### Step 4.3: Deploy All Edge Functions

```bash
npx supabase functions deploy generate-livekit-token
npx supabase functions deploy start-egress
npx supabase functions deploy stop-egress
npx supabase functions deploy livekit-webhook
```

### Step 4.4: Verify Deployment

1. Go to Supabase Dashboard → Edge Functions
2. You should see all 4 functions listed
3. Each should show a green "Deployed" status

---

## Part 5: Processing Worker Setup (Phase 5)

This is the critical part that runs the AI summarization. The worker must run on your **DigitalOcean droplet** (not locally).

### Step 5.1: Install FFmpeg on Droplet

SSH into your droplet:

```bash
ssh root@your-droplet-ip
```

Install FFmpeg:

```bash
sudo apt update
sudo apt install ffmpeg -y

# Verify installation
ffmpeg -version
# Should output FFmpeg version info
```

### Step 5.2: Install Node.js on Droplet (if not already installed)

```bash
# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should be v20.x
npm --version   # Should be 10.x
```

### Step 5.3: Upload Processing Worker to Droplet

From your **local machine**, upload the worker:

```bash
# Make sure you're in the bodycam-app directory
cd /path/to/bodycam-app

# Upload to droplet
scp -r processing-worker root@your-droplet-ip:/root/
```

### Step 5.4: Configure Worker Environment

SSH back into your droplet:

```bash
ssh root@your-droplet-ip
cd /root/processing-worker
```

Create environment file:

```bash
cp .env.example .env
nano .env
```

Fill in your credentials:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
GEMINI_API_KEY=your-gemini-api-key-here
```

Save and exit (Ctrl+O, Enter, Ctrl+X in nano).

### Step 5.5: Install Worker Dependencies

```bash
npm install
```

### Step 5.6: Test Run Worker (Foreground)

First, let's test that it works:

```bash
npm start
```

You should see:

```
🚀 BodyCam Video Processing Worker - Phase 5
✅ Connected to Postgres
👂 Listening for new_recording notifications...
🔍 Checking for pending recordings...
✅ No pending recordings
✨ Worker is ready and listening for new recordings...
```

If you see errors, check the [Troubleshooting](#troubleshooting) section.

Press Ctrl+C to stop.

### Step 5.7: Run Worker in Background with PM2

Install PM2:

```bash
npm install -g pm2
```

Start worker:

```bash
pm2 start index.js --name bodycam-worker
```

Configure PM2 to auto-start on reboot:

```bash
pm2 save
pm2 startup
# Follow the instructions that PM2 prints
```

Check worker status:

```bash
pm2 status
# Should show "bodycam-worker" with status "online"
```

View logs:

```bash
pm2 logs bodycam-worker --lines 50
```

You can now exit the SSH session - the worker will keep running!

---

## Part 6: Testing the Complete Flow

### Step 6.1: Create Test Users

Run the seed script to create test users:

```bash
# From your local machine, in bodycam-app directory
npm run seed
```

This creates:
- 1 manager: `manager@test.com` / `password123`
- 4 employees: `employee1@test.com` through `employee4@test.com` / `password123`

### Step 6.2: Test the Full Workflow

**On Manager Device:**

1. Open the app
2. Login as `manager@test.com` / `password123`
3. You should see the Manager Dashboard
4. Press "Start Shift"
5. You should see:
   - Shift status changes to "SHIFT ACTIVE"
   - Timer starts counting
   - Live Feeds section appears (empty initially)

**On Employee Device:**

1. Open the app on a different device/simulator
2. Login as `employee1@test.com` / `password123`
3. You should immediately see a modal: "Shift Started!"
4. Press "Got it"
5. Press "Start Streaming" button
6. Grant camera permissions when prompted
7. You should see your back camera feed

**On Manager Device:**

1. The Live Feeds grid should now show employee1's video
2. After about 60 seconds (the egress segment duration), you should see a recording appear
3. Tap the recording to see details

**Wait for AI Processing (Phase 5):**

1. On the manager device, go to the Recordings section
2. You should see "⏳ AI Processing..." on the recording
3. Monitor the processing worker logs on your droplet:
   ```bash
   ssh root@your-droplet-ip
   pm2 logs bodycam-worker --lines 100
   ```
4. You should see:
   - "🔔 New recording notification"
   - "📹 Processing recording..."
   - "📥 Downloading video..."
   - "🎬 Extracting keyframes..."
   - "🤖 Sending keyframes to Gemini AI..."
   - "✅ Summary generated"
   - "💾 Storing summary in database..."
   - "✅ Recording processed successfully!"

5. After processing completes (usually 30-60 seconds), the button changes to "🤖 View AI Summary"
6. Tap it to see the structured AI analysis!

### Step 6.3: End Shift and Verify

1. On manager device, press "End Shift"
2. Confirm the prompt
3. All employees receive "Shift Ended" notification
4. All recordings stop
5. All AI summaries should be complete

---

## Troubleshooting

### Issue: "Module @env not found"

**Solution:**
1. Clear Metro cache: `npx expo start --clear`
2. Rebuild app: `npx expo run:ios`
3. Verify `babel.config.js` exists and is correct

### Issue: Processing worker can't connect to Postgres

**Symptoms:**
```
❌ Error: connect ECONNREFUSED
```

**Solutions:**
1. Verify your `SUPABASE_DB_URL` is correct
2. Check that your droplet IP is allowed in Supabase:
   - Supabase Dashboard → Settings → Database → Network Restrictions
   - Add your droplet's IP address
3. Test connection manually:
   ```bash
   psql "postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
   ```

### Issue: "FFmpeg not found"

**Solution:**
```bash
# On droplet
sudo apt update
sudo apt install ffmpeg -y
which ffmpeg  # Should return /usr/bin/ffmpeg
```

### Issue: Gemini API quota exceeded

**Symptoms:**
```
❌ Gemini API error: quota exceeded
```

**Solutions:**
1. Check your API limits at [Google Cloud Console](https://console.cloud.google.com/)
2. Reduce keyframe extraction frequency in `processing-worker/videoProcessor.js`:
   ```javascript
   const KEYFRAME_INTERVAL_SECONDS = 15;  // Change from 10 to 15
   ```
3. Consider upgrading your Gemini API plan

### Issue: Video download fails (404 error)

**Symptoms:**
```
❌ Download failed: Request failed with status code 404
```

**Solutions:**
1. Verify DO Spaces bucket is public or properly configured
2. Check the `storage_url` in the database - it should point to the .ts segment
3. The worker tries to convert `.m3u8` to `.ts` - verify this logic in `videoProcessor.js`

### Issue: Worker crashes repeatedly

**Check logs:**
```bash
pm2 logs bodycam-worker --lines 200
```

**Common causes:**
1. Invalid environment variables
2. Out of memory (upgrade droplet)
3. Network connectivity issues

**Restart worker:**
```bash
pm2 restart bodycam-worker
```

### Issue: Summaries not appearing in app

**Checklist:**
1. ✅ Phase 5 migration ran successfully
2. ✅ Processing worker is running (`pm2 status`)
3. ✅ Worker logs show successful processing
4. ✅ Database has `processing_status = 'completed'` for recordings
5. ✅ App is subscribed to realtime updates (check console logs)

**Force refresh:**
1. Pull down on the recordings list to refresh
2. Close and reopen the app

---

## Next Steps

Now that Phase 5 is complete, you can:

1. **Adjust AI Prompt:** Edit `processing-worker/geminiClient.js` to customize the analysis
2. **Tune Keyframe Density:** Edit `KEYFRAME_INTERVAL_SECONDS` to balance cost vs detail
3. **Add Phase 6:** Implement end-of-shift PDF reports using the summaries
4. **Monitor Costs:** Track Gemini API usage in Google Cloud Console
5. **Scale Up:** Increase droplet resources if processing many concurrent recordings

---

## Support

If you encounter issues:

1. Check logs:
   - Metro bundler terminal
   - Supabase Edge Function logs (Dashboard → Edge Functions → Logs)
   - Processing worker logs (`pm2 logs bodycam-worker`)
   - Database logs (Dashboard → Database → Logs)

2. Verify all environment variables are set correctly

3. Ensure all services are running:
   - LiveKit server
   - Supabase project
   - Processing worker
   - React Native app

Good luck! 🚀
