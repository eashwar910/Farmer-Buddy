import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { WebhookReceiver } from 'https://esm.sh/livekit-server-sdk@2.6.1';

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

      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          status,
          ended_at:    new Date().toISOString(),
          storage_url: storageUrl,
        })
        .eq('egress_id', egressId);

      if (updateError) {
        console.error('Failed to update recording row:', updateError);
        // Return 200 anyway — don't cause LiveKit to retry in a loop
      } else {
        console.log(`Recording row updated: ${egressId} → ${status} | url: ${storageUrl}`);
      }
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('livekit-webhook error:', err);
    return new Response('Internal server error', { status: 500 });
  }
});
