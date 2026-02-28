// Edge Function: search_tmdb
// Searches TMDB for movies and TV shows (multi search). Used for "Add to matches" flow.
// Requires: TMDB_API_KEY secret and user authentication.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');

interface TMDBMultiResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
}

interface TMDBMultiResponse {
  results: TMDBMultiResult[];
  page: number;
  total_pages: number;
  total_results: number;
}

interface SearchResultItem {
  tmdb_id: number;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  overview: string | null;
  release_date: string | null;
  first_air_date: string | null;
  vote_average: number | null;
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!TMDB_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'TMDB_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const page = Math.min(Math.max(1, Number(body.page) || 1), 500);

    if (!query || query.length < 1) {
      return new Response(
        JSON.stringify({ results: [], page: 1, total_pages: 0, total_results: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const params = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query,
      page: String(page),
      include_adult: 'false',
    });
    const url = `${TMDB_BASE_URL}/search/multi?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${TMDB_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('TMDB search error:', response.status, text);
      return new Response(
        JSON.stringify({ error: 'TMDB request failed', results: [] }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data: TMDBMultiResponse = await response.json();
    const results: SearchResultItem[] = (data.results ?? [])
      .filter((r): r is TMDBMultiResult => r.media_type === 'movie' || r.media_type === 'tv')
      .map((r) => ({
        tmdb_id: r.id,
        type: r.media_type as 'movie' | 'tv',
        title: (r.media_type === 'tv' ? r.name : r.title) ?? 'Unknown',
        poster_path: r.poster_path ?? null,
        overview: r.overview ?? null,
        release_date: r.media_type === 'movie' ? (r.release_date ?? null) : null,
        first_air_date: r.media_type === 'tv' ? (r.first_air_date ?? null) : null,
        vote_average: r.vote_average ?? null,
      }));

    return new Response(
      JSON.stringify({
        results,
        page: data.page ?? page,
        total_pages: data.total_pages ?? 0,
        total_results: data.total_results ?? 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('search_tmdb error:', error);
    return new Response(
      JSON.stringify({ error: String(error), results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
