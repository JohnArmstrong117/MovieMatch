// Edge Function: feed_movies
// Fetches personalized movie feed from TMDB based on user preferences
// Requires: TMDB_API_KEY secret and user authentication

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');

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

interface TMDBDiscoverResponse {
  results: TMDBMovie[];
  page: number;
  total_pages: number;
  total_results: number;
}

interface MovieCard {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  overview: string;
  release_date: string | null;
  popularity: number | null;
  vote_average: number | null;
  vote_count: number | null;
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

    // Parse request body for pagination options
    const body = await req.json().catch(() => ({}));
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

    // Get user's swiped movie IDs to exclude
    const { data: swipedMovies } = await supabase
      .from('swipes')
      .select('tmdb_id')
      .eq('user_id', user.id)
      .eq('type', 'movie');

    const swipedIds = new Set(swipedMovies?.map(s => s.tmdb_id) || []);

    // TMDB's with_genres uses AND logic (all genres must match)
    // To get OR logic (any genre), we make separate requests per genre and combine
    console.log('📡 Making TMDB requests for OR genre logic (one request per genre)...');
    
    const genreRequests = genreIds.map(async (genreId) => {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        watch_region: 'US',
        with_genres: genreId.toString(),
        with_watch_providers: providerIds.join('|'),
        sort_by: 'popularity.desc',
        include_adult: 'false',
        'vote_count.gte': '50',
        page: page.toString(),
      });

      const discoverUrl = `${TMDB_BASE_URL}/discover/movie?${params.toString()}`;
      
      const response = await fetch(discoverUrl, {
        headers: {
          'Authorization': `Bearer ${TMDB_API_KEY}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ TMDB API error for genre ${genreId}:`, response.status, errorText);
        return { genreId, movies: [] };
      }

      const data: TMDBDiscoverResponse = await response.json();
      console.log(`   Genre ${genreId}: ${data.results.length} movies found`);
      return { genreId, movies: data.results };
    });

    // Wait for all genre requests to complete
    const genreResults = await Promise.all(genreRequests);
    
    // Combine all movies from all genres and deduplicate by movie ID
    const movieMap = new Map<number, TMDBMovie>();
    
    for (const result of genreResults) {
      for (const movie of result.movies) {
        // Keep the movie with highest popularity if duplicate
        const existing = movieMap.get(movie.id);
        const moviePop = movie.popularity || 0;
        const existingPop = existing?.popularity || 0;
        if (!existing || moviePop > existingPop) {
          movieMap.set(movie.id, movie);
        }
      }
    }
    
    // Convert map back to array and sort by popularity
    const combinedMovies = Array.from(movieMap.values())
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    
    console.log(`📦 Combined ${combinedMovies.length} unique movies from ${genreIds.length} genres`);

    // Filter out already swiped movies
    const unswipedMovies = combinedMovies.filter(movie => !swipedIds.has(movie.id));
    console.log(`🎬 After filtering swiped movies: ${unswipedMovies.length} movies remaining (${swipedIds.size} already swiped)`);

    // Transform to MovieCard format
    const items: MovieCard[] = unswipedMovies.slice(0, limit).map(movie => ({
      tmdb_id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      overview: movie.overview,
      release_date: movie.release_date || null,
      popularity: movie.popularity || null,
      vote_average: movie.vote_average || null,
      vote_count: movie.vote_count || null,
    }));

    // Upsert movies into titles cache
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
      const titleInserts = items.map(movie => ({
        tmdb_id: movie.tmdb_id,
        type: 'movie' as const,
        title: movie.title,
        poster_path: movie.poster_path,
        overview: movie.overview,
        release_date: movie.release_date,
        popularity: movie.popularity,
        vote_average: movie.vote_average,
        vote_count: movie.vote_count,
        updated_at: new Date().toISOString(),
      }));

      // Use upsert to avoid duplicates
      try {
        const { error: upsertError } = await supabaseAdmin
          .from('titles')
          .upsert(titleInserts, { onConflict: 'tmdb_id' });
        
        if (upsertError) {
          console.error('Error upserting titles:', upsertError);
        }
      } catch (err) {
        console.error('Error upserting titles:', err);
      }
    }

    // Determine if there's a next page
    // Since we're combining results from multiple genre requests, enable pagination
    // if we got the full limit of results (suggesting there might be more)
    const hasNextPage = items.length === limit;
    const nextPage = hasNextPage ? page + 1 : null;

    console.log(`✅ Returning ${items.length} movies to client (nextPage: ${nextPage})`);

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
