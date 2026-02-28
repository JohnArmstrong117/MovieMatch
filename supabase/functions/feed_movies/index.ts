// Edge Function: feed_movies
// Fetches personalized movie or TV feed from TMDB based on user preferences
// Requires: TMDB_API_KEY secret and user authentication

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');

type FeedType = 'movie' | 'tv';

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

interface TMDBTvShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  popularity: number;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

interface TMDBDiscoverResponse {
  results: (TMDBMovie | TMDBTvShow)[];
  page: number;
  total_pages: number;
  total_results: number;
}

interface FeedItem {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  overview: string;
  release_date: string | null;
  first_air_date: string | null;
  popularity: number | null;
  vote_average: number | null;
  vote_count: number | null;
  genre_ids: number[];
  provider_summary?: {
    hasFlatrate: boolean;
    hasRent: boolean;
    hasBuy: boolean;
  };
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

  console.log('📥 Received request to feed_movies');
  console.log('   Method:', req.method);
  console.log('   Has auth header:', !!req.headers.get('authorization'));

  const body = await req.json().catch(() => ({}));
  const feedType: FeedType = body.type === 'tv' ? 'tv' : 'movie';
  console.log('   Feed type:', feedType);

  try {
    // Get authenticated user from JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get user from JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!TMDB_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'TMDB_API_KEY not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Pagination options (type already parsed above)
    const limit = Math.min(body.limit || 20, 40); // Max 40
    const page = Math.min(body.page || 1, 500); // Max page 500
    const includeRentBuy = body.includeRentBuy !== false; // Default true
    const includeFlatrate = body.includeFlatrate !== false; // Default true

    // Get user's provider IDs and genre IDs
    const { data: userProviders } = await supabase
      .from('user_providers')
      .select('provider_id')
      .eq('user_id', user.id);

    const { data: userGenres } = await supabase
      .from('user_genres')
      .select('genre_id')
      .eq('user_id', user.id);

    if (!userProviders || userProviders.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No providers selected',
          message: 'Please select at least one streaming provider in your preferences',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!userGenres || userGenres.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No genres selected',
          message: 'Please select at least one genre in your preferences',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const providerIds = userProviders.map(p => p.provider_id);
    const genreIds = userGenres.map(g => g.genre_id);

    console.log(`📊 User preferences: ${providerIds.length} providers, ${genreIds.length} genres`);
    console.log(`   Provider IDs: ${providerIds.join(', ')}`);
    console.log(`   Genre IDs: ${genreIds.join(', ')}`);

    // Get user's swiped IDs for this type to exclude
    const { data: swipedRows } = await supabase
      .from('swipes')
      .select('tmdb_id')
      .eq('user_id', user.id)
      .eq('type', feedType);

    const swipedIds = new Set(swipedRows?.map(s => s.tmdb_id) || []);

    // TMDB's with_genres uses AND logic (all genres must match)
    // To get OR logic (any genre), we make separate requests per genre and combine.
    // If the first page yields too few unswiped items (user has already swiped them),
    // try next pages until we have enough or we've tried maxPages.
    const discoverPath = feedType === 'tv' ? 'discover/tv' : 'discover/movie';
    const maxPages = 5;
    const itemMap = new Map<number, TMDBMovie | TMDBTvShow>();
    let currentPage = page;
    let unswiped: (TMDBMovie | TMDBTvShow)[] = [];

    while (currentPage <= Math.min(page + maxPages - 1, 500)) {
      console.log(`📡 Making TMDB requests for ${discoverPath} page ${currentPage}...`);
      const genreRequests = genreIds.map(async (genreId) => {
        const params = new URLSearchParams({
          api_key: TMDB_API_KEY,
          watch_region: 'US',
          with_genres: genreId.toString(),
          with_watch_providers: providerIds.join('|'),
          sort_by: 'popularity.desc',
          include_adult: 'false',
          'vote_count.gte': '50',
          page: currentPage.toString(),
        });

        const discoverUrl = `${TMDB_BASE_URL}/${discoverPath}?${params.toString()}`;
        const response = await fetch(discoverUrl, {
          headers: {
            'Authorization': `Bearer ${TMDB_API_KEY}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ TMDB API error for genre ${genreId} page ${currentPage}:`, response.status, errorText);
          return { genreId, results: [] };
        }

        const data: TMDBDiscoverResponse = await response.json();
        return { genreId, results: data.results };
      });

      const genreResults = await Promise.all(genreRequests);
      for (const result of genreResults) {
        for (const item of result.results) {
          const existing = itemMap.get(item.id);
          const itemPop = item.popularity || 0;
          const existingPop = existing?.popularity || 0;
          if (!existing || itemPop > existingPop) {
            itemMap.set(item.id, item);
          }
        }
      }

      const combined = Array.from(itemMap.values())
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      unswiped = combined.filter((item) => !swipedIds.has(item.id));
      console.log(`   Page ${currentPage}: ${combined.length} total, ${unswiped.length} unswiped (${swipedIds.size} already swiped)`);

      if (unswiped.length >= limit) break;
      currentPage += 1;
    }

    console.log(`📦 Using ${unswiped.length} unswiped ${feedType}s from pages ${page}-${currentPage}`);

    // Transform to FeedItem (unified shape for movie and tv)
    const items: FeedItem[] = unswiped.slice(0, limit).map((item) => {
      const isTv = feedType === 'tv';
      const tv = item as TMDBTvShow;
      const movie = item as TMDBMovie;
      return {
        tmdb_id: item.id,
        title: isTv ? tv.name : movie.title,
        poster_path: item.poster_path,
        overview: item.overview,
        release_date: isTv ? null : (movie.release_date || null),
        first_air_date: isTv ? (tv.first_air_date || null) : null,
        popularity: item.popularity ?? null,
        vote_average: item.vote_average ?? null,
        vote_count: item.vote_count ?? null,
        genre_ids: item.genre_ids || [],
      };
    });

    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    if (items.length > 0) {
      const titleInserts = items.map((item) => ({
        tmdb_id: item.tmdb_id,
        type: feedType,
        title: item.title,
        poster_path: item.poster_path,
        overview: item.overview,
        release_date: item.release_date,
        first_air_date: item.first_air_date,
        popularity: item.popularity,
        vote_average: item.vote_average,
        vote_count: item.vote_count,
        updated_at: new Date().toISOString(),
        metadata: { genre_ids: item.genre_ids || [] },
      }));

      try {
        const { error: upsertError } = await supabaseAdmin
          .from('titles')
          .upsert(titleInserts, { onConflict: 'tmdb_id,type' });
        
        if (upsertError) {
          console.error('Error upserting titles:', upsertError);
        }
      } catch (err) {
        console.error('Error upserting titles:', err);
      }
    }

    const hasNextPage = items.length === limit;
    const nextPage = hasNextPage ? page + 1 : null;

    console.log(`✅ Returning ${items.length} ${feedType}s to client (nextPage: ${nextPage})`);

    return new Response(
      JSON.stringify({
        items,
        nextPage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', errorDetails);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: errorMessage,
        details: errorDetails 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
