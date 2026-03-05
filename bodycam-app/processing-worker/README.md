# BodyCam Video Processing Worker

This is the Phase 5 video processing worker that runs on your DigitalOcean droplet. It listens for new video recordings, extracts keyframes using FFmpeg, and sends them to Gemini 1.5 Flash for AI-powered summarization.

## Architecture

The worker uses a **Postgres NOTIFY/LISTEN** pattern instead of Supabase Edge Functions to avoid memory limitations:

1. When a video recording is completed, Postgres sends a notification
2. This worker receives the notification and starts processing
3. It downloads the video from DO Spaces
4. Extracts keyframes using FFmpeg (1 frame every 10 seconds)
5. Sends keyframes to Gemini 1.5 Flash for visual analysis
6. Stores the JSON summary back in Supabase

## Prerequisites

### On DigitalOcean Droplet

1. **Node.js 18+** must be installed
2. **FFmpeg** must be installed:
   ```bash
   sudo apt update
   sudo apt install ffmpeg -y
   ffmpeg -version  # Verify installation
   ```

## Installation

1. Copy the `processing-worker` folder to your DigitalOcean droplet:
   ```bash
   scp -r processing-worker root@your-droplet-ip:/root/
   ```

2. SSH into your droplet:
   ```bash
   ssh root@your-droplet-ip
   cd /root/processing-worker
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create environment file:
   ```bash
   cp .env.example .env
   nano .env  # Edit with your actual credentials
   ```

## Configuration

Edit the `.env` file with your actual values:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
GEMINI_API_KEY=your-gemini-api-key-here
```

### Finding Your Supabase Database URL

1. Go to Supabase Dashboard → Project Settings → Database
2. Look for "Connection string" → "URI" (not the pooler URL)
3. It should look like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres`
4. Replace `[YOUR-PASSWORD]` with your actual database password

### Getting a Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key and paste it into your `.env` file

## Running the Worker

### Development (foreground)

```bash
npm start
```

### Production (with PM2)

Install PM2 (process manager):
```bash
npm install -g pm2
```

Start the worker:
```bash
pm2 start index.js --name bodycam-worker
pm2 save
pm2 startup  # Follow the instructions to auto-start on reboot
```

View logs:
```bash
pm2 logs bodycam-worker
```

## Testing

To test the worker without waiting for a real recording:

1. Make sure the worker is running
2. Start a shift in the app and record some video
3. Stop the recording
4. Watch the worker logs for processing activity

## Cost Optimization

The worker is configured to extract 1 keyframe every 10 seconds. For a 15-minute video chunk:
- 90 keyframes extracted
- Estimated Gemini cost: ~$0.002 per chunk
- Monthly cost for 100 recordings: ~$0.20

To adjust keyframe density, edit `videoProcessor.js`:
```javascript
const KEYFRAME_INTERVAL_SECONDS = 10; // Change this value
```

## Troubleshooting

### "FFmpeg not found"
Install FFmpeg:
```bash
sudo apt update && sudo apt install ffmpeg -y
```

### "Cannot connect to Postgres"
- Verify your `SUPABASE_DB_URL` is correct
- Check that your droplet's IP is allowed in Supabase (Database → Settings → Network Restrictions)

### "Gemini API quota exceeded"
- Check your API limits at [Google Cloud Console](https://console.cloud.google.com/)
- Consider reducing keyframe extraction frequency

### Worker crashes or hangs
View PM2 logs:
```bash
pm2 logs bodycam-worker --lines 100
```

Restart worker:
```bash
pm2 restart bodycam-worker
```

## Monitoring

Check worker status:
```bash
pm2 status
```

Monitor resource usage:
```bash
pm2 monit
```

View detailed logs:
```bash
pm2 logs bodycam-worker --lines 200
```
