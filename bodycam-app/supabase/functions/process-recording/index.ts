import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.18';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json();
    const recordingId: string | undefined = body.recordingId ?? body.recording_id;
    if (!recordingId) {
      return new Response(JSON.stringify({ error: 'recordingId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Service-role Supabase client ──────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ── 4. Fetch recording row ───────────────────────────────────────────────
    const { data: recording, error: fetchError } = await supabase
      .from('recordings')
      .select('id, shift_id, employee_id, storage_url, status, processing_status')
      .eq('id', recordingId)
      .single();

    if (fetchError || !recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing recording:', recordingId, 'storage_url:', recording.storage_url);

    // ── 5. Mark as processing ────────────────────────────────────────────────
    await supabase.from('recordings').update({
      processing_status: 'processing',
      processing_attempts: 1,
    }).eq('id', recordingId);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      await failRecording(supabase, recordingId, 'GEMINI_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Gemini not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 6. Fetch employee info ───────────────────────────────────────────────
    const { data: employeeData } = await supabase
      .from('users').select('name').eq('id', recording.employee_id).single();
    const employeeName = (employeeData as any)?.name ?? 'Unknown Employee';

    // ── 7. Try to get real video analysis from DO Spaces ─────────────────────
    let summary: string | null = null;

    if (recording.storage_url) {
      try {
        summary = await analyzeVideoFromStorage(recording.storage_url, employeeName, geminiKey);
      } catch (videoErr) {
        console.error('Video analysis failed, falling back to metadata summary:', videoErr);
      }
    }

    // ── 8. Fallback: metadata-based summary with Gemini ──────────────────────
    if (!summary) {
      summary = await generateMetadataSummary(recording, employeeName, geminiKey);
    }

    // ── 9. Save summary ──────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('recordings')
      .update({
        summary,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', recordingId);

    if (updateError) {
      console.error('Failed to save summary:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to save summary' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Recording processed successfully:', recordingId);
    return new Response(JSON.stringify({ success: true, recordingId, summaryLength: summary.length }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('process-recording error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function failRecording(supabase: any, id: string, msg: string) {
  await supabase.from('recordings').update({
    processing_status: 'failed', processing_error: msg,
  }).eq('id', id);
}

/**
 * Download video segment(s) from DO Spaces using AWS Sig V4,
 * upload to Gemini Files API, then analyze with generateContent.
 */
async function analyzeVideoFromStorage(storageUrl: string, employeeName: string, geminiKey: string): Promise<string> {
  const s3Key    = Deno.env.get('DO_SPACES_KEY')    ?? '';
  const s3Secret = Deno.env.get('DO_SPACES_SECRET') ?? '';
  const s3Region = Deno.env.get('S3_REGION')        ?? 'sgp1';
  // If region is set to ap-southeast-1, DO Spaces still uses sgp1
  const activeRegion = s3Region === 'ap-southeast-1' ? 'sgp1' : s3Region;
  const s3Bucket = Deno.env.get('DO_SPACES_BUCKET') ?? '';

  // Normalize the storage URL to the correct DO Spaces format:
  // For aws4fetch to work correctly with DigitalOcean Spaces, we need 
  // to construct a path-style URL for signing:
  // https://sgp1.digitaloceanspaces.com/farmerbuddy-recordings/shift-id/employee-id/playlist.m3u8

  // Extract the raw path (everything after .com/)
  const urlObj = new URL(storageUrl);
  let rawPath = urlObj.pathname;
  
  // Clean up any doubled bucket names in the path if they exist
  if (rawPath.startsWith(`/${s3Bucket}/${s3Bucket}/`)) {
    rawPath = rawPath.replace(`/${s3Bucket}/${s3Bucket}/`, `/${s3Bucket}/`);
  } else if (!rawPath.startsWith(`/${s3Bucket}/`)) {
    // Ensure bucket is the first part of the path
    rawPath = `/${s3Bucket}${rawPath}`;
  }

  let normalizedUrl = `https://${activeRegion}.digitaloceanspaces.com${rawPath}`;

  // Ensure it ends with playlist.m3u8
  if (!normalizedUrl.includes('playlist.m3u8')) {
    normalizedUrl = normalizedUrl.replace(/\/?$/, '/playlist.m3u8');
  }

  console.log('Normalized path-style URL:', normalizedUrl);

  const aws = new AwsClient({
    accessKeyId: s3Key,
    secretAccessKey: s3Secret,
    region: 'us-east-1', // Required by aws4fetch signature format but overridden by the actual URL
    service: 's3',
  });

  const playlistRes = await aws.fetch(normalizedUrl);
  if (!playlistRes.ok) {
    const errText = await playlistRes.text();
    throw new Error(`Failed to fetch playlist: ${playlistRes.status} - ${errText}`);
  }

  const playlistText = await playlistRes.text();
  console.log('Playlist fetched, lines:', playlistText.split('\n').length);

  const segmentPaths = playlistText
    .split('\n')
    .filter(line => line.trim().endsWith('.ts') && !line.startsWith('#'))
    .slice(0, 3);

  if (segmentPaths.length === 0) {
    throw new Error('No .ts segments found in playlist');
  }

  const baseUrl = normalizedUrl.replace(/playlist\.m3u8$/, '');
  const segmentUrl = segmentPaths[0].startsWith('http')
    ? segmentPaths[0]
    : baseUrl + segmentPaths[0];

  console.log('Fetching segment:', segmentUrl);
  const segmentRes = await aws.fetch(segmentUrl);
  if (!segmentRes.ok) {
    const errText = await segmentRes.text();
    throw new Error(`Failed to fetch segment: ${segmentRes.status} - ${errText}`);
  }

  const segmentBuffer = await segmentRes.arrayBuffer();
  const segmentBytes  = new Uint8Array(segmentBuffer);
  console.log(`Downloaded segment: ${segmentBytes.byteLength} bytes`);

  // Upload to Gemini Files API
  const fileInfo = await uploadToGeminiFiles(segmentBytes, geminiKey);
  console.log(`Uploaded to Gemini Files: ${fileInfo.uri} (${fileInfo.name})`);

  // Wait for the video file to become ACTIVE (Gemini needs time to process MP4/TS files)
  let isActive = false;
  let attempts = 0;
  while (!isActive && attempts < 10) {
    await new Promise(r => setTimeout(r, 2000)); // wait 2s
    attempts++;
    
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileInfo.name}?key=${geminiKey}`);
    if (checkRes.ok) {
      const fileStatus = await checkRes.json();
      console.log(`File state [attempt ${attempts}]: ${fileStatus.state}`);
      if (fileStatus.state === 'ACTIVE') {
        isActive = true;
      } else if (fileStatus.state === 'FAILED') {
        throw new Error(`Gemini failed to process the uploaded video file: ${fileInfo.name}`);
      }
    }
  }

  if (!isActive) {
    throw new Error(`Gemini file ${fileInfo.name} did not become ACTIVE in time.`);
  }

  // Analyze with Gemini
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `Employee name: ${employeeName}\n\n${ANALYSIS_PROMPT}` },
              { file_data: { mime_type: 'video/MP2T', file_uri: fileInfo.uri } },
            ],
          },
        ],
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

/**
 * Upload binary data to Gemini Files API and return uri and name.
 */
async function uploadToGeminiFiles(data: Uint8Array, geminiKey: string): Promise<{uri: string, name: string}> {
  // Step 1: initiate resumable upload
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(data.byteLength),
        'X-Goog-Upload-Header-Content-Type': 'video/MP2T',
      },
      body: JSON.stringify({ file: { display_name: 'recording-segment.ts' } }),
    }
  );

  if (!startRes.ok) {
    const err = await startRes.text();
    throw new Error(`Failed to initiate Gemini upload: ${startRes.status} ${err}`);
  }

  const uploadUrl = startRes.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('No upload URL returned from Gemini Files API');
  }

  // Step 2: upload the data
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(data.byteLength),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: data,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Failed to upload to Gemini: ${uploadRes.status} ${err}`);
  }

  const fileData = await uploadRes.json();
  const uri = fileData?.file?.uri;
  const name = fileData?.file?.name;
  if (!uri || !name) throw new Error('No file URI or name in Gemini upload response');
  
  return { uri, name };
}

/**
 * Metadata-based fallback summary when video access fails.
 */
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

function extractJson(raw: string): string {
  const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) return jsonMatch[1];
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return JSON.stringify({ executive_summary: raw.slice(0, 500) });
}
