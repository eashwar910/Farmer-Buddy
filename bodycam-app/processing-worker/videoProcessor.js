/**
 * Video Processing Module
 *
 * Downloads video chunks from DigitalOcean Spaces and extracts keyframes
 * using FFmpeg for AI analysis.
 */

import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import axios from 'axios';

// ============================================================================
// Configuration
// ============================================================================

// Extract 1 keyframe every N seconds (adjust for cost/quality tradeoff)
const KEYFRAME_INTERVAL_SECONDS = 10;

// Temporary directory for video processing
const TEMP_DIR = path.join(os.tmpdir(), 'bodycam-processing');

// ============================================================================
// Ensure temp directory exists
// ============================================================================

async function ensureTempDir() {
  try {
    await fs.access(TEMP_DIR);
  } catch {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  }
}

// ============================================================================
// Download video from DO Spaces
// ============================================================================

async function downloadVideo(storageUrl, metadata) {
  const { shift_id, employee_id, egress_id } = metadata;

  console.log(`  📥 Downloading video from: ${storageUrl}`);

  // Parse the storage URL to get the video file URL
  // The storage_url might be the playlist URL, we need to get the actual video segments
  // For simplicity, we'll try to download the playlist and parse it, or directly download if it's a video file

  let videoUrl = storageUrl;

  // If it's an m3u8 playlist, we need to download the actual video segments
  if (storageUrl.includes('.m3u8')) {
    // For HLS playlists, we'll download the first .ts segment or use ffmpeg to convert
    // For now, let's assume the video files are in the same directory
    // We'll use a heuristic: replace playlist.m3u8 with chunk_000000.ts
    videoUrl = storageUrl.replace('playlist.m3u8', 'chunk_000000.ts');
    console.log(`  📹 Detected HLS playlist, trying segment: ${videoUrl}`);
  }

  await ensureTempDir();

  const filename = `${egress_id || 'video'}_${Date.now()}.ts`;
  const videoPath = path.join(TEMP_DIR, filename);

  try {
    const response = await axios({
      method: 'get',
      url: videoUrl,
      responseType: 'stream',
      timeout: 60000, // 60 second timeout
    });

    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`  ✅ Video downloaded to: ${videoPath}`);

    // Verify file exists and has size
    const stats = await fs.stat(videoPath);
    if (stats.size === 0) {
      throw new Error('Downloaded video file is empty');
    }

    console.log(`  📊 Video size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    return videoPath;
  } catch (error) {
    console.error(`  ❌ Download failed:`, error.message);
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

// ============================================================================
// Extract keyframes using FFmpeg
// ============================================================================

async function extractKeyframes(videoPath) {
  await ensureTempDir();

  const outputPattern = path.join(
    TEMP_DIR,
    `keyframe_${Date.now()}_%04d.jpg`
  );

  console.log(`  🔍 Extracting keyframes (1 frame every ${KEYFRAME_INTERVAL_SECONDS}s)...`);

  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-i', videoPath,
      '-vf', `fps=1/${KEYFRAME_INTERVAL_SECONDS}`,
      '-q:v', '2', // Quality (1-31, lower is better)
      '-f', 'image2',
      outputPattern
    ];

    console.log(`  🎬 FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', async (code) => {
      if (code !== 0) {
        console.error(`  ❌ FFmpeg error output:\n${stderr}`);
        reject(new Error(`FFmpeg exited with code ${code}`));
        return;
      }

      try {
        // Find all generated keyframes
        const files = await fs.readdir(TEMP_DIR);
        const keyframeFiles = files
          .filter(f => f.startsWith('keyframe_') && f.endsWith('.jpg'))
          .map(f => path.join(TEMP_DIR, f))
          .sort();

        if (keyframeFiles.length === 0) {
          reject(new Error('No keyframes were extracted'));
          return;
        }

        console.log(`  ✅ Extracted ${keyframeFiles.length} keyframes`);
        resolve(keyframeFiles);
      } catch (err) {
        reject(err);
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}

// ============================================================================
// Convert image files to base64 for Gemini API
// ============================================================================

async function convertKeyframesToBase64(keyframePaths) {
  console.log(`  🖼️  Converting ${keyframePaths.length} keyframes to base64...`);

  const base64Frames = [];

  for (const framePath of keyframePaths) {
    const buffer = await fs.readFile(framePath);
    const base64 = buffer.toString('base64');
    base64Frames.push({
      inlineData: {
        data: base64,
        mimeType: 'image/jpeg',
      },
    });
  }

  console.log(`  ✅ Converted ${base64Frames.length} keyframes`);
  return base64Frames;
}

// ============================================================================
// Cleanup temporary files
// ============================================================================

async function cleanupFiles(videoPath, keyframePaths) {
  console.log(`  🧹 Cleaning up temporary files...`);

  try {
    // Delete video file
    await fs.unlink(videoPath);

    // Delete keyframe files
    for (const framePath of keyframePaths) {
      await fs.unlink(framePath);
    }

    console.log(`  ✅ Cleanup complete`);
  } catch (err) {
    console.warn(`  ⚠️  Cleanup warning:`, err.message);
  }
}

// ============================================================================
// Main export: Download and extract keyframes
// ============================================================================

export async function downloadAndExtractKeyframes(storageUrl, metadata) {
  let videoPath = null;
  let keyframePaths = [];

  try {
    // Step 1: Download video
    videoPath = await downloadVideo(storageUrl, metadata);

    // Step 2: Extract keyframes
    keyframePaths = await extractKeyframes(videoPath);

    // Step 3: Convert to base64
    const base64Frames = await convertKeyframesToBase64(keyframePaths);

    // Step 4: Cleanup
    await cleanupFiles(videoPath, keyframePaths);

    return base64Frames;
  } catch (error) {
    // Cleanup on error
    if (videoPath) {
      try {
        await fs.unlink(videoPath);
      } catch {}
    }

    for (const framePath of keyframePaths) {
      try {
        await fs.unlink(framePath);
      } catch {}
    }

    throw error;
  }
}
