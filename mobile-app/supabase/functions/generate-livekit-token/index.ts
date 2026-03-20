import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2.6.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
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
      let base64 = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
      const padLen = (4 - (base64.length % 4)) % 4;
      base64 += "=".repeat(padLen);
      const payload = JSON.parse(atob(base64));
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
    const { shiftId } = await req.json();
    if (!shiftId) {
      return new Response(JSON.stringify({ error: 'shiftId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Use service-role client to bypass RLS ─────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch user profile to determine role
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role, name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile not found for user:', user.id, profileError);
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the shift exists and is active
    const { data: shift, error: shiftError } = await supabaseAdmin
      .from('shifts')
      .select('id, status')
      .eq('id', shiftId)
      .eq('status', 'active')
      .single();

    if (shiftError || !shift) {
      return new Response(JSON.stringify({ error: 'No active shift found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. LiveKit credentials ───────────────────────────────────────────────
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');

    if (!livekitApiKey || !livekitApiSecret) {
      return new Response(JSON.stringify({ error: 'LiveKit not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const roomName = `shift-${shiftId}`;
    const participantIdentity = user.id;
    const participantName = profile.name || user.email || 'Unknown';
    const isManager = profile.role === 'manager';

    // ── 5. Mint scoped token ─────────────────────────────────────────────────
    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: '8h',
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: !isManager,   // Employees publish; managers subscribe only
      canSubscribe: true,
      canPublishData: true,
    });

    const jwt2 = await token.toJwt();

    return new Response(
      JSON.stringify({
        token: jwt2,
        room: roomName,
        identity: participantIdentity,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('Error generating token:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
