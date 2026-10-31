// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RtcTokenBuilder, RtcRole } from 'npm:agora-token@2.0.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function uuidToAgoraUid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const positive = Math.abs(hash) % 2147483647;
  return positive === 0 ? 1 : positive;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user with Supabase
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid Supabase token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agoraAppId = Deno.env.get('AGORA_APP_ID');
    const agoraAppCert = Deno.env.get('AGORA_APP_CERTIFICATE');

    if (!agoraAppId || !agoraAppCert) {
      return new Response(
        JSON.stringify({
          error:
            'Server misconfiguration: AGORA_APP_ID or AGORA_APP_CERTIFICATE is not configured in Supabase secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { channelName, userId, recipientId } = body;

    if (!channelName || !userId) {
      return new Response(
        JSON.stringify({ error: 'channelName and userId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Security check: caller can only request token for their own authenticated UID
    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Cannot request RTC token for another user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uid = uuidToAgoraUid(userId);
    const tokenExpirationInSeconds = 3600; // 1 hour token
    const privilegeExpirationInSeconds = 3600;

    // Generate RTC token for Publisher role
    const token = RtcTokenBuilder.buildTokenWithUid(
      agoraAppId,
      agoraAppCert,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      tokenExpirationInSeconds,
      privilegeExpirationInSeconds
    );

    return new Response(
      JSON.stringify({
        token,
        channelName,
        uid,
        appId: agoraAppId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
