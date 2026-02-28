import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { WebhookReceiver } from 'https://esm.sh/livekit-server-sdk@2.6.1';

// No CORS needed — this is called by LiveKit server, not the app
serve(async (req) => {
  try {
    // ── 1. Verify LiveKit webhook signature ──────────────────────────────────
    const webhookSecret = Deno.env.get('LIVEKIT_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('LIVEKIT_WEBHOOK_SECRET not set');
      return new Response('Webhook secret not configured', { status: 500 });
    }

    const body = await req.text();

    // WebhookReceiver will throw if signature is invalid
    const receiver = new WebhookReceiver(
      Deno.env.get('LIVEKIT_API_KEY') ?? '',
      Deno.env.get('LIVEKIT_API_SECRET') ?? ''
    );

    let event: any;
    try {
      event = receiver.receive(body, req.headers.get('Authorization') ?? '');
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

    const egress = event.egressInfo;

    // ── 3. Handle egress events ──────────────────────────────────────────────
    if (event.event === 'egress_started') {
      console.log('Egress started:', egress?.egressId);
      // Row already inserted by start-egress function. Nothing more to do.
    }

    else if (event.event === 'egress_updated') {
      // Fired when a segment completes — good time to bump chunk_index
      if (egress?.egressId && egress?.status !== undefined) {
        console.log('Egress updated:', egress.egressId, 'status:', egress.status);
      }
    }

    else if (event.event === 'egress_ended') {
      if (!egress?.egressId) {
        console.warn('egress_ended with no egressId');
        return new Response('ok', { status: 200 });
      }

      console.log('Egress ended:', egress.egressId);

      // Determine final status
      const failed = egress.status === 'EGRESS_FAILED' || egress.error;
      const status = failed ? 'failed' : 'completed';

      // Build storage_url from the first segment output if available
      // segments are under: {shiftId}/{employeeId}/chunk_<n>.ts
      // We'll store the base path so the manager can list all chunks
      let storageUrl: string | null = null;
      const segOut = egress.segmentResults?.[0];
      if (segOut?.playlistLocation) {
        // playlistLocation is the full S3 path e.g. s3://farmerbuddy-recordings/shiftId/userId/playlist.m3u8
        storageUrl = segOut.playlistLocation;
      } else if (egress.roomName && egress.roomName.startsWith('shift-')) {
        // Fallback: construct URL from known path convention
        const endpoint = Deno.env.get('DO_SPACES_ENDPOINT') ?? '';
        const bucket   = Deno.env.get('DO_SPACES_BUCKET') ?? '';
        storageUrl = `${endpoint}/${bucket}/${egress.roomName.replace('shift-', '')}`;
      }

      const { error: updateError } = await supabase
        .from('recordings')
        .update({
          status,
          ended_at:    new Date().toISOString(),
          storage_url: storageUrl,
        })
        .eq('egress_id', egress.egressId);

      if (updateError) {
        console.error('Failed to update recording row:', updateError);
        // Return 200 anyway — don't cause LiveKit to retry in a loop
      } else {
        console.log(`Recording row updated: ${egress.egressId} → ${status}`);
      }
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('livekit-webhook error:', err);
    return new Response('Internal server error', { status: 500 });
  }
});
