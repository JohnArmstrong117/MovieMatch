// Edge Function: get_credits
// Returns the first 3 cast member names for a movie or TV show from TMDB.
// Requires: TMDB_API_KEY secret.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');

interface TMDBCastMember {
  name: string;
  character?: string;
  order?: number;
}

interface TMDBCreditsResult {
  id?: number;
  cast?: TMDBCastMember[];
  crew?: unknown[];
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!TMDB_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'TMDB_API_KEY not configured', cast: [] }),
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
        JSON.stringify({ error: 'Missing or invalid tmdb_id or type (movie|tv)', cast: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const path = type === 'movie'
      ? `movie/${tmdbId}/credits`
      : `tv/${tmdbId}/credits`;
    const params = new URLSearchParams({ api_key: TMDB_API_KEY });
    const creditsUrl = `${TMDB_BASE_URL}/${path}?${params.toString()}`;

    const res = await fetch(creditsUrl, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('TMDB credits error:', res.status, text);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch credits', cast: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data: TMDBCreditsResult = await res.json();
    const cast = Array.isArray(data.cast) ? data.cast : [];
    const topThree = cast
      .slice(0, 3)
      .map((c) => c.name)
      .filter(Boolean);

    return new Response(
      JSON.stringify({ cast: topThree }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('get_credits error:', error);
    return new Response(
      JSON.stringify({ error: String(error), cast: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
