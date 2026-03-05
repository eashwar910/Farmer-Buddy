#!/usr/bin/env node
/**
 * BodyCam Video Processing Worker (Phase 5)
 *
 * This worker runs on the DigitalOcean droplet and listens for new video
 * recordings via Postgres NOTIFY/LISTEN. When a new recording is ready,
 * it downloads the video from DO Spaces, extracts keyframes using FFmpeg,
 * sends them to Gemini 1.5 Flash for visual summarization, and stores
 * the summary back in Supabase.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { downloadAndExtractKeyframes } from './videoProcessor.js';
import { summarizeKeyframes } from './geminiClient.js';

const { Client } = pg;

// ============================================================================
// Configuration
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate required environment variables
const requiredEnvVars = {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SERVICE_KEY,
  SUPABASE_DB_URL,
  GEMINI_API_KEY,
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// Initialize Supabase client (for data operations)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ============================================================================
// Database Notification Listener
// ============================================================================

async function connectToPostgres() {
  const client = new Client({
    connectionString: SUPABASE_DB_URL,
  });

  await client.connect();
  console.log('✅ Connected to Postgres');

  // Listen for new recording notifications
  await client.query('LISTEN new_recording');
  console.log('👂 Listening for new_recording notifications...\n');

  client.on('notification', async (msg) => {
    if (msg.channel === 'new_recording') {
      try {
        const payload = JSON.parse(msg.payload);
        console.log('🔔 New recording notification:', payload);
        await processRecording(payload);
      } catch (err) {
        console.error('❌ Error processing notification:', err);
      }
    }
  });

  // Handle connection errors
  client.on('error', (err) => {
    console.error('❌ Postgres client error:', err);
    process.exit(1);
  });

  return client;
}

// ============================================================================
// Recording Processing Pipeline
// ============================================================================

async function processRecording(recordingData) {
  const { id, shift_id, employee_id, storage_url, egress_id } = recordingData;

  console.log(`\n📹 Processing recording ${id}`);
  console.log(`   Employee: ${employee_id}`);
  console.log(`   Shift: ${shift_id}`);
  console.log(`   Storage: ${storage_url}\n`);

  try {
    // Step 1: Mark recording as processing
    console.log('⏳ Marking recording as processing...');
    const { error: markError } = await supabase.rpc('mark_recording_processing', {
      recording_id: id,
    });

    if (markError) {
      throw new Error(`Failed to mark as processing: ${markError.message}`);
    }

    // Step 2: Download video and extract keyframes
    console.log('🎬 Downloading video and extracting keyframes...');
    const keyframes = await downloadAndExtractKeyframes(storage_url, {
      shift_id,
      employee_id,
      egress_id,
    });

    if (!keyframes || keyframes.length === 0) {
      throw new Error('No keyframes extracted from video');
    }

    console.log(`✅ Extracted ${keyframes.length} keyframes`);

    // Step 3: Send keyframes to Gemini for summarization
    console.log('🤖 Sending keyframes to Gemini AI for analysis...');
    const summary = await summarizeKeyframes(keyframes, genAI);

    console.log('✅ Summary generated');
    console.log('Summary preview:', summary.substring(0, 200) + '...\n');

    // Step 4: Store summary in database
    console.log('💾 Storing summary in database...');
    const { error: updateError } = await supabase.rpc('update_recording_summary', {
      recording_id: id,
      summary_text: summary,
    });

    if (updateError) {
      throw new Error(`Failed to update summary: ${updateError.message}`);
    }

    console.log(`✅ Recording ${id} processed successfully!\n`);
    console.log('─'.repeat(80) + '\n');

  } catch (error) {
    console.error(`❌ Error processing recording ${id}:`, error);

    // Mark recording as failed
    try {
      await supabase.rpc('mark_recording_failed', {
        recording_id: id,
        error_message: error.message || String(error),
      });
      console.log(`⚠️  Marked recording ${id} as failed\n`);
    } catch (markFailError) {
      console.error('❌ Failed to mark recording as failed:', markFailError);
    }

    console.log('─'.repeat(80) + '\n');
  }
}

// ============================================================================
// Startup & Graceful Shutdown
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(80));
  console.log('🚀 BodyCam Video Processing Worker - Phase 5');
  console.log('═'.repeat(80) + '\n');

  console.log('Configuration:');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Gemini API: ${GEMINI_API_KEY ? '✅ Configured' : '❌ Not configured'}`);
  console.log();

  // Connect to Postgres and start listening
  const pgClient = await connectToPostgres();

  // Process any pending recordings that might have been missed
  console.log('🔍 Checking for pending recordings...');
  const { data: pendingRecordings, error: fetchError } = await supabase
    .from('recordings')
    .select('id, shift_id, employee_id, storage_url, egress_id')
    .eq('status', 'completed')
    .or('processing_status.is.null,processing_status.eq.pending')
    .order('ended_at', { ascending: true })
    .limit(10);

  if (fetchError) {
    console.error('❌ Error fetching pending recordings:', fetchError);
  } else if (pendingRecordings && pendingRecordings.length > 0) {
    console.log(`📦 Found ${pendingRecordings.length} pending recording(s)\n`);
    for (const recording of pendingRecordings) {
      await processRecording(recording);
    }
  } else {
    console.log('✅ No pending recordings\n');
  }

  console.log('✨ Worker is ready and listening for new recordings...\n');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await pgClient.end();
    console.log('👋 Goodbye!\n');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Start the worker
main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
