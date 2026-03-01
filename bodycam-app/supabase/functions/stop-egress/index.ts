import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2.6.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Auth: decode JWT directly (compatible with ECC rotated keys) ────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace('Bearer ', '');
    let user: { id: string; email: string } | null = null;
    try {
      const base64Payload = jwt.split('.')[1];
      const padded = base64Payload + '=='.slice(base64Payload.length % 4 || 4);
      const payload = JSON.parse(atob(padded));
      if (payload.sub && payload.role === 'authenticated') {
        user = { id: payload.sub, email: payload.email ?? '' };
      }
    } catch (decodeErr) {
      console.error('JWT decode error:', decodeErr);
    }

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const { egressId } = await req.json();
    if (!egressId) {
      return new Response(JSON.stringify({ error: 'egressId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. LiveKit credentials ───────────────────────────────────────────────
    const livekitApiKey    = Deno.env.get('LIVEKIT_API_KEY');
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    const livekitApiUrl    = Deno.env.get('LIVEKIT_API_URL');

    if (!livekitApiKey || !livekitApiSecret || !livekitApiUrl) {
      return new Response(JSON.stringify({ error: 'LiveKit not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Mint admin token ──────────────────────────────────────────────────
    const adminToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: 'egress-admin',
      ttl: '5m',
    });
    adminToken.addGrant({ roomCreate: true, roomList: true, roomAdmin: true });
    const adminJwt = await adminToken.toJwt();

    // ── 5. Stop egress ───────────────────────────────────────────────────────
    console.log('Stopping egress:', egressId);

    const stopRes = await fetch(
      `${livekitApiUrl}/twirp/livekit.Egress/StopEgress`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ egress_id: egressId }),
      }
    );

    if (!stopRes.ok) {
      const errText = await stopRes.text();
      console.error('Stop egress error:', stopRes.status, errText);
      // Still proceed to finalize the DB row even if LiveKit returns an error
      // (egress may have already stopped naturally)
    } else {
      console.log('Egress stop requested:', egressId);
    }

    // ── 6. Finalize recording row (fallback — webhook may also do this) ───────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: recording } = await supabaseAdmin
      .from('recordings')
      .select('id, shift_id, employee_id')
      .eq('egress_id', egressId)
      .maybeSingle();

    if (recording) {
      const s3Endpoint = Deno.env.get('DO_SPACES_ENDPOINT') ?? '';
      const s3Bucket   = Deno.env.get('DO_SPACES_BUCKET') ?? '';

      const normalizedEndpoint = s3Endpoint.startsWith('http')
        ? s3Endpoint.replace(/\/$/, '')
        : `https://${s3Endpoint}`;
      const endpointDomain = normalizedEndpoint.replace(/^https?:\/\//, '');
      const storageUrl = `https://${s3Bucket}.${endpointDomain}/${recording.shift_id}/${recording.employee_id}/playlist.m3u8`;

      const { error: updateError } = await supabaseAdmin
        .from('recordings')
        .update({
          status:      'completed',
          ended_at:    new Date().toISOString(),
          storage_url: storageUrl,
        })
        .eq('egress_id', egressId);

      if (updateError) {
        console.error('Failed to update recording row:', updateError);
      } else {
        console.log('Recording row finalized for egress:', egressId, '→', storageUrl);
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('stop-egress error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
