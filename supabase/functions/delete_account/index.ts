// Edge Function: delete_account
// Deletes the authenticated user via Admin API (cascades public.profile + related rows).
// Removes objects under storage bucket `avatars/{userId}/`.
// Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getUserIdFromAuthHeader } from '../_shared/verify_user_jwt.ts';

const AVATARS_BUCKET = 'avatars';

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const authHeader =
      req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const userId = await getUserIdFromAuthHeader(authHeader, supabaseUrl);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!serviceKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: files, error: listError } = await supabaseAdmin.storage
      .from(AVATARS_BUCKET)
      .list(userId, { limit: 100 });

    if (listError) {
      console.warn('delete_account: avatar list failed (continuing):', listError.message);
    } else if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeError } = await supabaseAdmin.storage.from(AVATARS_BUCKET).remove(paths);
      if (removeError) {
        console.warn('delete_account: avatar remove failed (continuing):', removeError.message);
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error('delete_account: admin.deleteUser failed:', deleteError);
      return new Response(
        JSON.stringify({
          error: 'Failed to delete account',
          message: deleteError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('delete_account:', e);
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
