import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { WebhookReceiver } from 'https://esm.sh/livekit-server-sdk@2.6.1';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.18';

// Number of 10-second HLS segments per ~1-minute chunk
const SEGMENTS_PER_CHUNK = 6;

// No CORS needed — this is called by LiveKit server, not the app
serve(async (req) => {
  try {
    // ── 1. Verify LiveKit webhook signature ──────────────────────────────────
    const livekitApiKey    = Deno.env.get('LIVEKIT_API_KEY') ?? '';
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

    if (!livekitApiKey || !livekitApiSecret) {
      console.error('LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set');
      return new Response('LiveKit credentials not configured', { status: 500 });
    }

    const body = await req.text();
    const authHeader = req.headers.get('Authorization') ?? '';

    // WebhookReceiver uses the API key+secret to verify the webhook JWT
    const receiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);

    let event: any;
    try {
      event = await receiver.receive(body, authHeader);
    } catch (sigErr) {
      console.error('Webhook signature verification failed:', sigErr);
      return new Response('Invalid signature', { status: 401 });
    }

    console.log('LiveKit webhook event:', event.event, JSON.stringify(event).slice(0, 300));

    // ── 2. Service-role Supabase client (bypass RLS) ─────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ── 3. Extract egress info ───────────────────────────────────────────────
    // Note: The LiveKit SDK may use either camelCase (egressId) or
    // snake_case (egress_id) depending on version — handle both
    const egress = event.egressInfo;

    if (!egress) {
      // Not an egress event — return OK
      return new Response('ok', { status: 200 });
    }

    // Normalize egressId (SDK v2 uses camelCase)
    const egressId = egress.egressId ?? egress.egress_id;

    // ── 4. Handle egress events ──────────────────────────────────────────────
    if (event.event === 'egress_started') {
      console.log('Egress started:', egressId);
      // Row was already inserted by start-egress function — nothing more to do

    } else if (event.event === 'egress_updated') {
      console.log('Egress updated:', egressId, 'status:', egress.status);
      // Fired when a segment completes — could update chunk_index here if needed

    } else if (event.event === 'egress_ended') {
      if (!egressId) {
        console.warn('egress_ended with no egressId');
        return new Response('ok', { status: 200 });
      }

      console.log('Egress ended:', egressId, 'status:', egress.status);

      // Determine final status
      const failed = egress.status === 'EGRESS_FAILED' || !!egress.error;
      const status = failed ? 'failed' : 'completed';

      // Build storage_url from the segment results if available
      // segments live at: {shiftId}/{employeeId}/chunk_N.ts
      let storageUrl: string | null = null;

      const segmentResults = egress.segmentResults ?? egress.segment_results;
      const segOut = Array.isArray(segmentResults) ? segmentResults[0] : null;
      if (segOut) {
        // playlistLocation is the full S3 path e.g. s3://farmerbuddy-recordings/shiftId/userId/playlist.m3u8
        storageUrl = segOut.playlistLocation ?? segOut.playlist_location ?? null;
      }

      if (!storageUrl && egress.roomName) {
        // Fallback: construct path from room name convention
        const shiftId  = (egress.roomName ?? '').replace('shift-', '');
        const endpoint = Deno.env.get('DO_SPACES_ENDPOINT') ?? '';
        const bucket   = Deno.env.get('DO_SPACES_BUCKET') ?? '';
        const normEndpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
        storageUrl = `${normEndpoint}/${bucket}/${shiftId}`;
      }

      // ── Fetch the recording row (need shift_id / employee_id for playlist URL) ──
      const { data: recordingRow, error: fetchRecErr } = await supabase
        .from('recordings')
        .select('id, shift_id, employee_id, started_at')
        .eq('egress_id', egressId)
        .single();

      if (fetchRecErr || !recordingRow) {
        console.error('Could not fetch recording row for egress:', egressId, fetchRecErr);
        return new Response('ok', { status: 200 });
      }

      // ── Update recording to completed / failed ────────────────────────────
      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          status,
          ended_at:    new Date().toISOString(),
          storage_url: storageUrl,
          // Mark processing_status based on outcome
          processing_status: failed ? 'failed' : 'pending',
        })
        .eq('egress_id', egressId);

      if (updateError) {
        console.error('Failed to update recording row:', updateError);
        return new Response('ok', { status: 200 });
      }

      console.log(`Recording row updated: ${egressId} → ${status}`);

      // ── On success: create chunk rows then fire per-chunk Gemini jobs ─────
      if (status === 'completed') {
        const recordingId = recordingRow.id;

        // Build playlist URL from known path convention
        const s3Region  = Deno.env.get('S3_REGION') ?? 'sgp1';
        const s3Bucket  = Deno.env.get('DO_SPACES_BUCKET') ?? '';
        const region    = s3Region === 'ap-southeast-1' ? 'sgp1' : s3Region;
        const baseUrl   = `https://${region}.digitaloceanspaces.com/${s3Bucket}`;
        const playlistUrl = `${baseUrl}/${recordingRow.shift_id}/${recordingRow.employee_id}/playlist.m3u8`;

        // Fetch and parse the HLS playlist
        const aws = new AwsClient({
          accessKeyId:     Deno.env.get('DO_SPACES_KEY') ?? '',
          secretAccessKey: Deno.env.get('DO_SPACES_SECRET') ?? '',
          region: 'us-east-1',
          service: 's3',
        });

        let segmentPaths: string[] = [];
        try {
          const playlistRes = await aws.fetch(playlistUrl);
          if (playlistRes.ok) {
            const text = await playlistRes.text();
            segmentPaths = text
              .split('\n')
              .filter(l => l.trim().endsWith('.ts') && !l.startsWith('#'));
            console.log(`Playlist has ${segmentPaths.length} segments for recording ${recordingId}`);
          } else {
            console.warn(`Playlist fetch failed (${playlistRes.status}) — chunks will be created without segment mapping`);
          }
        } catch (playlistErr) {
          console.warn('Playlist fetch error:', playlistErr);
        }

        const sessionStartMs  = new Date(recordingRow.started_at).getTime();
        const chunkDurationMs = SEGMENTS_PER_CHUNK * 10 * 1000; // ~60 s per chunk
        const segBase         = playlistUrl.replace(/playlist\.m3u8$/, '');

        // If playlist unavailable fall back to time-based chunk count (5-min session → 5 chunks)
        const totalChunks = segmentPaths.length > 0
          ? Math.max(1, Math.ceil(segmentPaths.length / SEGMENTS_PER_CHUNK))
          : 1;

        const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        const createdChunkIds: string[] = [];

        for (let idx = 0; idx < totalChunks; idx++) {
          const firstSeg   = segmentPaths[idx * SEGMENTS_PER_CHUNK];
          const chunkUrl   = firstSeg
            ? (firstSeg.startsWith('http') ? firstSeg : segBase + firstSeg)
            : null;

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

          if (chunkErr) {
            console.error(`Failed to upsert chunk ${idx}:`, chunkErr);
          } else if (chunkRow?.id) {
            createdChunkIds.push(chunkRow.id);
          }
        }

        console.log(`Created ${createdChunkIds.length} chunk rows for recording ${recordingId}`);

        // Update parent recording so UI shows processing state
        await supabase
          .from('recordings')
          .update({ processing_status: 'processing' })
          .eq('id', recordingId);

        // Fire one process-recording call per chunk (fire-and-forget)
        // Each call is bounded to one chunk — no timeout risk
        for (const cid of createdChunkIds) {
          fetch(`${supabaseUrl}/functions/v1/process-recording`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ chunkId: cid }),
          }).catch(err => console.warn(`Chunk ${cid} fire-and-forget failed:`, err));
        }

        console.log(`Fired ${createdChunkIds.length} per-chunk Gemini jobs for recording ${recordingId}`);
      }
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('livekit-webhook error:', err);
    return new Response('Internal server error', { status: 500 });
  }
});
