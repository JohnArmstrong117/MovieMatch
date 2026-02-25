// Edge Function: get_watch_providers
// Returns watch providers (streaming/rent/buy) for a movie or TV show from TMDB.
// Requires: TMDB_API_KEY secret.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
const WATCH_REGION = 'US';

interface TMDBProvider {
  logo_path: string | null;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

interface TMDBWatchProvidersResult {
  id: number;
  results?: {
    [region: string]: {
      link?: string;
      flatrate?: TMDBProvider[];
      rent?: TMDBProvider[];
      buy?: TMDBProvider[];
    };
  };
}

export interface WatchProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
  type: 'flatrate' | 'rent' | 'buy';
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  console.log('[get_watch_providers] request', req.method, new URL(req.url).pathname);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!TMDB_API_KEY) {
    console.error('get_watch_providers: TMDB_API_KEY not configured');
    return new Response(
      JSON.stringify({ error: 'TMDB_API_KEY not configured', providers: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    let tmdbId: string | null = null;
    let type = 'movie';
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      tmdbId = body.tmdb_id != null ? String(body.tmdb_id) : null;
      type = (body.type || 'movie').toLowerCase();
    } else {
      const url = new URL(req.url);
      tmdbId = url.searchParams.get('tmdb_id');
      type = (url.searchParams.get('type') || 'movie').toLowerCase();
    }
    if (!tmdbId || !['movie', 'tv'].includes(type)) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid tmdb_id or type (movie|tv)', providers: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const path = type === 'movie'
      ? `movie/${tmdbId}/watch/providers`
      : `tv/${tmdbId}/watch/providers`;
    // Don't pass watch_region: TMDB returns full results by country; we read US below.
    const params = new URLSearchParams({ api_key: TMDB_API_KEY });
    const providerUrl = `${TMDB_BASE_URL}/${path}?${params.toString()}`;

    const res = await fetch(providerUrl, {
      headers: {
        'Accept': 'application/json',
        ...(TMDB_API_KEY ? { 'Authorization': `Bearer ${TMDB_API_KEY}` } : {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('TMDB watch providers error:', res.status, text);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch watch providers', providers: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data: TMDBWatchProvidersResult = await res.json();
    const results = data.results || {};
    const resultKeys = Object.keys(results);
    console.log('get_watch_providers TMDB response:', {
      tmdb_id: tmdbId,
      type,
      resultKeys: resultKeys.slice(0, 10),
      hasUS: resultKeys.includes('US'),
      hasUs: resultKeys.includes('us'),
    });
    const region = results[WATCH_REGION] ?? results['us'] ?? null;
    if (region) {
      console.log('get_watch_providers US region:', {
        flatrate: region.flatrate?.length ?? 0,
        rent: region.rent?.length ?? 0,
        buy: region.buy?.length ?? 0,
      });
    } else {
      console.log('get_watch_providers: no US/us region in results');
    }
    const list: WatchProviderInfo[] = [];

    if (region?.flatrate) {
      for (const p of region.flatrate) {
        list.push({
          provider_id: p.provider_id,
          provider_name: p.provider_name,
          logo_path: p.logo_path,
          display_priority: p.display_priority,
          type: 'flatrate',
        });
      }
    }
    if (region?.rent) {
      for (const p of region.rent) {
        if (!list.some((x) => x.provider_id === p.provider_id && x.type === 'rent')) {
          list.push({
            provider_id: p.provider_id,
            provider_name: p.provider_name,
            logo_path: p.logo_path,
            display_priority: p.display_priority,
            type: 'rent',
          });
        }
      }
    }
    if (region?.buy) {
      for (const p of region.buy) {
        if (!list.some((x) => x.provider_id === p.provider_id && x.type === 'buy')) {
          list.push({
            provider_id: p.provider_id,
            provider_name: p.provider_name,
            logo_path: p.logo_path,
            display_priority: p.display_priority,
            type: 'buy',
          });
        }
      }
    }

    list.sort((a, b) => a.display_priority - b.display_priority);

    return new Response(
      JSON.stringify({ providers: list }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('get_watch_providers error:', error);
    return new Response(
      JSON.stringify({ error: String(error), providers: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
