import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.18';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Number of 10-second HLS segments that form one ~1-minute chunk.
// Adjust if segment duration changes (e.g. set to 6 for 10 s segments → 60 s chunks).
const SEGMENTS_PER_CHUNK = 6;

const ANALYSIS_PROMPT = `You are an AI assistant analyzing security camera footage from an employee body camera.

You will receive one or more video segments from a workplace recording session. Analyze the video content carefully and provide a detailed, professional summary.

Respond ONLY with valid JSON matching this structure:
{
  "executive_summary": "2-3 sentence overview of what the employee was doing during this recording",
  "timeline": [
    {
      "time_estimate": "0:00 - 1:00",
      "activity": "Detailed description of what was happening"
    }
  ],
  "notable_events": [
    {
      "description": "What happened",
      "significance": "Why it is notable"
    }
  ],
  "safety_compliance": {
    "concerns": ["Any safety or compliance concerns observed"],
    "positive_observations": ["Good practices observed"]
  },
  "overall_assessment": "Professional evaluation of the employee's conduct and activities during this recording segment"
}

Be specific, objective, and professional. Note the environment, tasks performed, interactions, and any safety observations from the actual video content.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Auth check ────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Parse body — two modes: recordingId (session) or chunkId (single chunk) ──
    const body = await req.json();
    const recordingId: string | undefined = body.recordingId ?? body.recording_id;
    const chunkId: string | undefined     = body.chunkId ?? body.chunk_id;

    if (!recordingId && !chunkId) {
      return new Response(JSON.stringify({ error: 'recordingId or chunkId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Service-role Supabase client ──────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      if (recordingId) await failRecording(supabase, recordingId, 'GEMINI_API_KEY not configured');
      if (chunkId)     await failChunk(supabase, chunkId, 'GEMINI_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Gemini not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Route to the correct handler ─────────────────────────────────────────
    if (chunkId) {
      return await processChunk(supabase, chunkId, geminiKey);
    } else {
      return await processRecording(supabase, recordingId!, geminiKey);
    }

  } catch (err) {
    console.error('process-recording error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MODE A: Manual re-trigger for a full recording session
//   - Creates/repairs recording_chunk rows from the HLS playlist
//   - Fires per-chunk process-recording calls (fire-and-forget)
//   - Does NOT do any Gemini work inline (would time out)
//   - Normal path: livekit-webhook already does this on egress_ended.
//     This mode is for back-filling recordings that completed before the
//     chunk pipeline was deployed.
// ─────────────────────────────────────────────────────────────────────────────
async function processRecording(supabase: any, recordingId: string, geminiKey: string): Promise<Response> {
  const { data: recording, error: fetchError } = await supabase
    .from('recordings')
    .select('id, shift_id, employee_id, started_at, status')
    .eq('id', recordingId)
    .single();

  if (fetchError || !recording) {
    return new Response(JSON.stringify({ error: 'Recording not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (recording.status !== 'completed') {
    return new Response(JSON.stringify({ error: 'Recording is not yet completed' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log('Re-triggering chunk pipeline for recording:', recordingId);

  const { aws, baseSpacesUrl } = buildS3Client();
  const playlistUrl = `${baseSpacesUrl}/${recording.shift_id}/${recording.employee_id}/playlist.m3u8`;
  const segBase     = playlistUrl.replace(/playlist\.m3u8$/, '');

  let segmentPaths: string[] = [];
  try {
    const res = await aws.fetch(playlistUrl);
    if (res.ok) {
      const text = await res.text();
      segmentPaths = text.split('\n').filter(l => l.trim().endsWith('.ts') && !l.startsWith('#'));
    }
  } catch (err) {
    console.warn('Playlist fetch error:', err);
  }

  const sessionStartMs  = new Date(recording.started_at).getTime();
  const chunkDurationMs = SEGMENTS_PER_CHUNK * 10 * 1000;
  const totalChunks     = segmentPaths.length > 0
    ? Math.max(1, Math.ceil(segmentPaths.length / SEGMENTS_PER_CHUNK))
    : 1;

  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const createdChunkIds: string[] = [];

  for (let idx = 0; idx < totalChunks; idx++) {
    const firstSeg = segmentPaths[idx * SEGMENTS_PER_CHUNK];
    const chunkUrl = firstSeg ? (firstSeg.startsWith('http') ? firstSeg : segBase + firstSeg) : null;

    const { data: chunkRow, error: chunkErr } = await supabase
      .from('recording_chunks')
      .upsert({
        recording_id:      recordingId,
        chunk_index:       idx,
        storage_url:       chunkUrl,
        started_at:        new Date(sessionStartMs + idx * chunkDurationMs).toISOString(),
        ended_at:          new Date(sessionStartMs + (idx + 1) * chunkDurationMs).toISOString(),
        processing_status: 'pending',
      }, { onConflict: 'recording_id,chunk_index' })
      .select('id')
      .single();

    if (chunkErr) { console.error(`Failed to upsert chunk ${idx}:`, chunkErr); }
    else if (chunkRow?.id) { createdChunkIds.push(chunkRow.id); }
  }

  await supabase.from('recordings').update({ processing_status: 'processing' }).eq('id', recordingId);

  for (const cid of createdChunkIds) {
    fetch(`${supabaseUrl}/functions/v1/process-recording`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkId: cid }),
    }).catch(err => console.warn(`Chunk ${cid} dispatch failed:`, err));
  }

  console.log(`✅ Re-triggered ${createdChunkIds.length} chunks for recording ${recordingId}`);
  return new Response(JSON.stringify({ success: true, recordingId, chunksCreated: createdChunkIds.length }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE B: Process a single recording_chunks row
//   - Downloads its segment slice from DO Spaces
//   - Runs Gemini analysis
//   - Saves summary back to recording_chunks
// ─────────────────────────────────────────────────────────────────────────────
async function processChunk(supabase: any, chunkId: string, geminiKey: string): Promise<Response> {
  // Fetch chunk row
  const { data: chunk, error: chunkErr } = await supabase
    .from('recording_chunks')
    .select('id, recording_id, chunk_index, processing_status')
    .eq('id', chunkId)
    .single();

  if (chunkErr || !chunk) {
    return new Response(JSON.stringify({ error: 'Chunk not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch parent recording for shift_id / employee_id
  const { data: recording, error: recErr } = await supabase
    .from('recordings')
    .select('id, shift_id, employee_id, started_at')
    .eq('id', chunk.recording_id)
    .single();

  if (recErr || !recording) {
    await failChunk(supabase, chunkId, 'Parent recording not found');
    return new Response(JSON.stringify({ error: 'Parent recording not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`Processing chunk ${chunk.chunk_index} (${chunkId}) for recording ${chunk.recording_id}`);

  // Mark chunk as processing
  await supabase.from('recording_chunks').update({ processing_status: 'processing' }).eq('id', chunkId);

  // Fetch employee name
  const { data: employeeData } = await supabase
    .from('users').select('name').eq('id', recording.employee_id).single();
  const employeeName = (employeeData as any)?.name ?? 'Unknown Employee';

  // Build playlist URL and fetch segment slice for this chunk
  const { aws, baseSpacesUrl } = buildS3Client();
  const playlistUrl = `${baseSpacesUrl}/${recording.shift_id}/${recording.employee_id}/playlist.m3u8`;
  const baseUrl     = playlistUrl.replace(/playlist\.m3u8$/, '');

  let summary: string | null = null;
  let analysisError: string | null = null;
  try {
    const playlistRes = await aws.fetch(playlistUrl);
    if (!playlistRes.ok) throw new Error(`Playlist fetch failed: ${playlistRes.status}`);
    const playlistText = await playlistRes.text();
    const allSegments = playlistText
      .split('\n')
      .filter(line => line.trim().endsWith('.ts') && !line.startsWith('#'));

    console.log(`Playlist has ${allSegments.length} total segments; chunk_index=${chunk.chunk_index} takes [${chunk.chunk_index * SEGMENTS_PER_CHUNK}, ${chunk.chunk_index * SEGMENTS_PER_CHUNK + SEGMENTS_PER_CHUNK})`);

    const segStart = chunk.chunk_index * SEGMENTS_PER_CHUNK;
    const segSlice = allSegments.slice(segStart, segStart + SEGMENTS_PER_CHUNK);

    if (segSlice.length === 0) throw new Error(`No segments for chunk_index ${chunk.chunk_index} (playlist has ${allSegments.length} segments)`);

    summary = await analyzeSegments(segSlice, baseUrl, aws, employeeName, geminiKey);
  } catch (err: any) {
    analysisError = String(err?.message ?? err);
    console.error(`Chunk ${chunkId} video analysis failed:`, analysisError);
  }

  if (!summary) {
    // Minimal metadata fallback so the chunk doesn't stay stuck in processing
    summary = JSON.stringify({
      executive_summary: `Chunk ${chunk.chunk_index + 1} recording for ${employeeName}.`,
      timeline: [],
      notable_events: [],
      safety_compliance: { concerns: [], positive_observations: [] },
      overall_assessment: 'Video analysis unavailable for this chunk.',
      note: analysisError
        ? `Analysis failed: ${analysisError}`
        : 'Video frame analysis was unavailable — this is a metadata-based summary only.',
    });
  }

  const { error: updateErr } = await supabase
    .from('recording_chunks')
    .update({
      summary,
      processing_status: 'completed',
      processed_at: new Date().toISOString(),
    })
    .eq('id', chunkId);

  if (updateErr) {
    console.error('Failed to save chunk summary:', updateErr);
    await failChunk(supabase, chunkId, updateErr.message);
    return new Response(JSON.stringify({ error: 'Failed to save chunk summary' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`✅ Chunk processed: ${chunkId} (index ${chunk.chunk_index})`);

  // ── Check if all sibling chunks are done; if so, mark parent recording completed ──
  try {
    const { data: siblings } = await supabase
      .from('recording_chunks')
      .select('processing_status')
      .eq('recording_id', chunk.recording_id);

    const allDone = siblings?.every(
      (s: any) => s.processing_status === 'completed' || s.processing_status === 'failed'
    );

    if (allDone) {
      // Use the first completed chunk's summary as the session-level summary
      const { data: firstChunk } = await supabase
        .from('recording_chunks')
        .select('summary')
        .eq('recording_id', chunk.recording_id)
        .eq('chunk_index', 0)
        .single();

      await supabase
        .from('recordings')
        .update({
          processing_status: 'completed',
          processed_at: new Date().toISOString(),
          summary: firstChunk?.summary ?? null,
        })
        .eq('id', chunk.recording_id);

      console.log(`All chunks done — recording ${chunk.recording_id} marked completed`);
    }
  } catch (rollupErr) {
    // Non-critical — the chunk summary is saved; parent status will just stay 'processing'
    console.warn('Parent recording rollup failed (non-critical):', rollupErr);
  }

  return new Response(JSON.stringify({ success: true, chunkId }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: download segment slice → upload to Gemini → analyze
// ─────────────────────────────────────────────────────────────────────────────
async function analyzeSegments(
  segmentPaths: string[],
  baseUrl: string,
  aws: AwsClient,
  employeeName: string,
  geminiKey: string
): Promise<string> {
  if (segmentPaths.length === 0) throw new Error('No segments provided');

  const segmentBuffers: Uint8Array[] = [];
  for (const segPath of segmentPaths) {
    const segmentUrl = segPath.startsWith('http') ? segPath : baseUrl + segPath;
    const res = await aws.fetch(segmentUrl);
    if (!res.ok) {
      console.warn(`Skipping segment (${res.status}): ${segmentUrl}`);
      continue;
    }
    segmentBuffers.push(new Uint8Array(await res.arrayBuffer()));
  }

  if (segmentBuffers.length === 0) throw new Error('All segment fetches failed');

  const totalBytes = segmentBuffers.reduce((acc, b) => acc + b.byteLength, 0);
  const segmentBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const buf of segmentBuffers) { segmentBytes.set(buf, offset); offset += buf.byteLength; }

  console.log(`Concatenated ${segmentBuffers.length} segments: ${segmentBytes.byteLength} bytes`);

  const fileInfo = await uploadToGeminiFiles(segmentBytes, geminiKey);
  console.log(`Uploaded to Gemini Files: ${fileInfo.uri}`);

  // Wait for Gemini to mark the file ACTIVE
  let isActive = false;
  for (let attempt = 0; attempt < 10 && !isActive; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${geminiKey}`
    );
    if (checkRes.ok) {
      const fileStatus = await checkRes.json();
      console.log(`File state [attempt ${attempt + 1}]: ${fileStatus.state}`);
      if (fileStatus.state === 'ACTIVE') { isActive = true; }
      else if (fileStatus.state === 'FAILED') throw new Error(`Gemini file processing failed: ${fileInfo.name}`);
    }
  }
  if (!isActive) throw new Error(`Gemini file ${fileInfo.name} did not become ACTIVE in time`);

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `Employee name: ${employeeName}\n\n${ANALYSIS_PROMPT}` },
            { file_data: { mime_type: 'video/mp2t', file_uri: fileInfo.uri } },
          ],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    throw new Error(`Gemini API error ${geminiRes.status}: ${errText.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return extractJson(rawText);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildS3Client(): { aws: AwsClient; baseSpacesUrl: string; s3Bucket: string; activeRegion: string } {
  const s3Key      = Deno.env.get('DO_SPACES_KEY')    ?? '';
  const s3Secret   = Deno.env.get('DO_SPACES_SECRET') ?? '';
  const s3Region   = Deno.env.get('S3_REGION')        ?? 'sgp1';
  const s3Bucket   = Deno.env.get('DO_SPACES_BUCKET') ?? '';
  const activeRegion = s3Region === 'ap-southeast-1' ? 'sgp1' : s3Region;

  const aws = new AwsClient({
    accessKeyId: s3Key,
    secretAccessKey: s3Secret,
    region: 'us-east-1',
    service: 's3',
  });

  return { aws, baseSpacesUrl: `https://${activeRegion}.digitaloceanspaces.com/${s3Bucket}`, s3Bucket, activeRegion };
}

async function uploadToGeminiFiles(data: Uint8Array, geminiKey: string): Promise<{ uri: string; name: string }> {
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(data.byteLength),
        'X-Goog-Upload-Header-Content-Type': 'video/mp2t',
      },
      body: JSON.stringify({ file: { display_name: 'recording-segment.ts' } }),
    }
  );

  if (!startRes.ok) throw new Error(`Gemini upload init failed: ${startRes.status} ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) throw new Error('No upload URL from Gemini Files API');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(data.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: data,
  });

  if (!uploadRes.ok) throw new Error(`Gemini upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const fileData = await uploadRes.json();
  const uri = fileData?.file?.uri;
  const name = fileData?.file?.name;
  if (!uri || !name) throw new Error('No file URI or name in Gemini upload response');
  return { uri, name };
}

async function generateMetadataSummary(recording: any, employeeName: string, geminiKey: string): Promise<string> {
  const contextPrompt = `You are an AI assistant reviewing a workplace body camera recording.

Recording metadata:
- Employee: ${employeeName}
- Status: ${recording.status}
- Recording storage: ${recording.storage_url ?? 'unavailable'}

Note: The video file could not be directly accessed for analysis. Generate a professional acknowledgment summary explaining that the recording was captured but video frame analysis was not available. Be honest and professional.

Respond with valid JSON matching this exact structure:
{
  "executive_summary": "string",
  "timeline": [],
  "notable_events": [],
  "safety_compliance": { "concerns": [], "positive_observations": ["Recording was captured successfully"] },
  "overall_assessment": "string",
  "note": "Video frame analysis was unavailable — this is a metadata-based summary only."
}`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: contextPrompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
    }
  );

  if (!geminiRes.ok) throw new Error(`Gemini fallback error: ${geminiRes.status}`);
  const data = await geminiRes.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return extractJson(raw);
}

async function failRecording(supabase: any, id: string, msg: string) {
  await supabase.from('recordings').update({
    processing_status: 'failed', processing_error: msg,
  }).eq('id', id);
}

async function failChunk(supabase: any, id: string, msg: string) {
  await supabase.from('recording_chunks').update({
    processing_status: 'failed', processing_error: msg,
  }).eq('id', id);
}

function extractJson(raw: string): string {
  const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) return jsonMatch[1];
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return JSON.stringify({ executive_summary: raw.slice(0, 500) });
}
