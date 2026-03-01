import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2.6.1';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // ── 1. Auth: decode JWT directly (compatible with rotated ECC keys) ──────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: 'Missing authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const jwt = authHeader.replace('Bearer ', '');
    let user = null;
    try {
      const base64Payload = jwt.split('.')[1];
      let base64 = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
      const padLen = (4 - (base64.length % 4)) % 4;
      base64 += "=".repeat(padLen);
      const payload = JSON.parse(atob(base64));
      if (payload.sub && payload.role === 'authenticated') {
        user = {
          id: payload.sub,
          email: payload.email ?? ''
        };
      }
    } catch (decodeErr) {
      console.error('JWT decode error:', decodeErr);
    }
    
    if (!user) {
      console.error('Auth failed! user is null. Auth header length:', authHeader.length);
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ── 2. Parse body ────────────────────────────────────────────────────────
    const { shiftId } = await req.json();
    if (!shiftId) {
      return new Response(JSON.stringify({
        error: 'shiftId is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ── 3. Verify shift is active (using service role to avoid RLS issues) ───
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: shift, error: shiftError } = await supabaseAdmin.from('shifts').select('id, status').eq('id', shiftId).eq('status', 'active').single();
    if (shiftError || !shift) {
      return new Response(JSON.stringify({
        error: 'No active shift found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ── 4. LiveKit credentials ───────────────────────────────────────────────
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    const livekitApiUrl = Deno.env.get('LIVEKIT_API_URL');
    if (!livekitApiKey || !livekitApiSecret || !livekitApiUrl) {
      console.error('Missing LiveKit env vars');
      return new Response(JSON.stringify({
        error: 'LiveKit not configured'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ── 5. DO Spaces credentials ─────────────────────────────────────────────
    const s3Endpoint = Deno.env.get('DO_SPACES_ENDPOINT');
    const s3Bucket = Deno.env.get('DO_SPACES_BUCKET');
    const s3Key = Deno.env.get('DO_SPACES_KEY');
    const s3Secret = Deno.env.get('DO_SPACES_SECRET');
    if (!s3Endpoint || !s3Bucket || !s3Key || !s3Secret) {
      console.error('Missing DO Spaces env vars');
      return new Response(JSON.stringify({
        error: 'Storage not configured'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // ── 6. Mint a short-lived admin token for the Egress API call ────────────
    const adminToken = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: 'egress-admin',
      ttl: '5m'
    });
    adminToken.addGrant({
      roomCreate: true,
      roomList: true,
      roomAdmin: true,
      roomRecord: true
    });
    const adminJwt = await adminToken.toJwt();
    const roomName = `shift-${shiftId}`;
    const participantId = user.id;
    // Use directory-style path: {shiftId}/{employeeId}/chunk_
    const filenamePrefix = `${shiftId}/${participantId}/chunk_`;
    const playlistName   = `${shiftId}/${participantId}/playlist.m3u8`;

    // ── 7. Normalize S3 endpoint ─────────────────────────────────────────────
    // DO_SPACES_ENDPOINT may be set to the virtual-hosted form:
    //   https://farmerbuddy-recordings.sgp1.digitaloceanspaces.com
    // OR the bare regional form:
    //   https://sgp1.digitaloceanspaces.com
    // We need the BARE regional endpoint (no bucket prefix) so that LiveKit Egress
    // can build the virtual-hosted URL correctly with force_path_style: false.
    let normalizedEndpoint = s3Endpoint.startsWith('http')
      ? s3Endpoint.replace(/\/$/, '')
      : `https://${s3Endpoint}`;

    // If the endpoint already has the bucket name as a subdomain, strip it.
    // e.g. https://farmerbuddy-recordings.sgp1.digitaloceanspaces.com
    //   → https://sgp1.digitaloceanspaces.com
    const bucketPrefixPattern = new RegExp(`^(https?://)${s3Bucket}\.`);
    if (bucketPrefixPattern.test(normalizedEndpoint)) {
      normalizedEndpoint = normalizedEndpoint.replace(bucketPrefixPattern, '$1');
    }

    // Extract the DO region from the endpoint hostname (e.g. "sgp1" from "sgp1.digitaloceanspaces.com")
    // Fallback to S3_REGION secret or 'sgp1' if we can't parse it
    const endpointHostname = normalizedEndpoint.replace(/^https?:\/\//, '');
    const regionFromEndpoint = endpointHostname.split('.')[0]; // e.g. "sgp1"
    const s3Region = regionFromEndpoint || Deno.env.get('S3_REGION') || 'sgp1';

    console.log('S3 endpoint (normalized):', normalizedEndpoint, 'bucket:', s3Bucket, 'region:', s3Region);

    // ── 8. Start egress via LiveKit REST API ─────────────────────────────────
    // NOTE: In protobuf3 JSON encoding, oneof fields are flattened directly into
    // the parent object — there is NO "output" wrapper around the s3 config.
    const egressPayload = {
      room_name: roomName,
      layout: 'grid',
      segment_outputs: [
        {
          filename_prefix: filenamePrefix,
          playlist_name:   playlistName,
          live_playlist_name: '',
          // 60 s per segment for development; set to 900 for 15-minute production chunks
          segment_duration: 60,
          protocol: 0,
          s3: {
            access_key: s3Key,
            secret:     s3Secret,
            region:     s3Region,
            endpoint:   normalizedEndpoint,
            bucket:     s3Bucket,
            force_path_style: false,  // false = virtual-hosted style (correct for DO Spaces)
          },
        },
      ],
    };
    console.log('Starting egress for room:', roomName, 'participant:', participantId);
    console.log('Egress payload:', JSON.stringify(egressPayload));
    const egressRes = await fetch(`${livekitApiUrl}/twirp/livekit.Egress/StartRoomCompositeEgress`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminJwt}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(egressPayload)
    });
    if (!egressRes.ok) {
      const errText = await egressRes.text();
      console.error('LiveKit Egress error:', egressRes.status, errText);
      return new Response(JSON.stringify({
        error: `Egress API error ${egressRes.status}: ${errText}`
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const egressData = await egressRes.json();
    const egressId = egressData.egress_id;
    console.log('Egress started:', egressId);
    // ── 9. Insert recording row ───────────────────────────────────────────────
    const { data: recording, error: insertError } = await supabaseAdmin.from('recordings').insert({
      shift_id: shiftId,
      employee_id: participantId,
      egress_id: egressId,
      status: 'recording',
      started_at: new Date().toISOString()
    }).select('id').single();
    if (insertError) {
      console.error('Failed to insert recording row:', insertError);
    }
    return new Response(JSON.stringify({
      egressId,
      recordingId: recording?.id ?? null
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('start-egress error:', err);
    return new Response(JSON.stringify({
      error: 'Internal server error', detail: String(err)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
