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
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
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
      return new Response(
        JSON.stringify({ error: `Stop egress failed ${stopRes.status}: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Egress stop requested:', egressId);

    // Note: the recording row will be finalized by the livekit-webhook
    // when LiveKit fires egress_ended. We don't update status here.

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('stop-egress error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
