// Edge Function: sync_providers
// Fetches streaming providers from TMDB API and populates the database
// Requires: TMDB_API_KEY secret

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');

interface TMDBProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

interface TMDBWatchProvidersResponse {
  results: TMDBProvider[];
}

serve(async (req) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!TMDB_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'TMDB_API_KEY not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('📡 Fetching watch providers from TMDB API...');

    // Fetch watch providers for US region (can be made configurable)
    const watchProvidersUrl = `${TMDB_BASE_URL}/watch/providers/movie?api_key=${TMDB_API_KEY}&watch_region=US`;
    
    const response = await fetch(watchProvidersUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ TMDB API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch providers from TMDB',
          details: errorText 
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data: TMDBWatchProvidersResponse = await response.json();
    const providers = data.results || [];

    console.log(`📦 Found ${providers.length} providers from TMDB`);

    // Prepare providers for database insertion
    const providerInserts = providers.map(provider => ({
      provider_id: provider.provider_id,
      provider_name: provider.provider_name,
      logo_path: provider.logo_path,
      display_priority: provider.display_priority,
      updated_at: new Date().toISOString(),
    }));

    // Upsert providers into database
    const { error: upsertError, count } = await supabase
      .from('tmdb_providers_movie')
      .upsert(providerInserts, { onConflict: 'provider_id' })
      .select();

    if (upsertError) {
      console.error('❌ Error upserting providers:', upsertError);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to save providers to database',
          details: upsertError.message 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Successfully synced ${providerInserts.length} providers to database`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${providerInserts.length} providers`,
        count: providerInserts.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
