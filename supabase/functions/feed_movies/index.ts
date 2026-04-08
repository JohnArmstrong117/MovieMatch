// Edge Function: feed_movies
// Fetches personalized movie or TV feed from TMDB based on user preferences
// Requires: TMDB_API_KEY (v3) or TMDB_READ_ACCESS_TOKEN (v4), plus user authentication

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getUserIdFromAuthHeader } from '../_shared/verify_user_jwt.ts';
import {
  expandUnifiedSlugsForFeed,
  slugsFromLegacyMovieGenreIds,
} from '../_shared/unified_genres.ts';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY');
const TMDB_READ_ACCESS_TOKEN = Deno.env.get('TMDB_READ_ACCESS_TOKEN');

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

  const body = await req.json().catch(() => ({}));
  const feedType: FeedType = body.type === 'tv' ? 'tv' : 'movie';
  console.log('   Feed type:', feedType);

  try {
    // Get authenticated user from JWT (header casing varies by client / proxy)
    const authHeader =
      req.headers.get('Authorization') ?? req.headers.get('authorization');
    console.log('   Has auth header:', !!authHeader);

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
    const userId = await getUserIdFromAuthHeader(authHeader, supabaseUrl);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (!TMDB_API_KEY && !TMDB_READ_ACCESS_TOKEN) {
      return new Response(
        JSON.stringify({
          error: 'TMDB API credentials not configured',
          hint: 'Set TMDB_API_KEY (v3) or TMDB_READ_ACCESS_TOKEN (v4) in Supabase Edge Function secrets.',
        }),
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
    const { data: userProviders } = await supabaseAdmin
      .from('user_providers')
      .select('provider_id')
      .eq('user_id', userId);

    const { data: unifiedRows } = await supabaseAdmin
      .from('user_unified_genres')
      .select('slug')
      .eq('user_id', userId);

    let preferenceSlugs = (unifiedRows ?? [])
      .map((r) => (typeof r.slug === 'string' ? r.slug : ''))
      .filter(Boolean);

    if (preferenceSlugs.length === 0) {
      const { data: legacyGenres } = await supabaseAdmin
        .from('user_genres')
        .select('genre_id')
        .eq('user_id', userId);
      const legacyIds = (legacyGenres ?? [])
        .map((r) => Number(r.genre_id))
        .filter((id) => Number.isFinite(id));
      preferenceSlugs = slugsFromLegacyMovieGenreIds(legacyIds);
    }

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

    if (preferenceSlugs.length === 0) {
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
    const genreIds = expandUnifiedSlugsForFeed(preferenceSlugs, feedType);
    if (genreIds.length === 0) {
      const medium = feedType === 'tv' ? 'TV shows' : 'movies';
      return new Response(
        JSON.stringify({
          error: `No genres apply to ${medium}`,
          message: `Your current selections do not map to ${medium} on TMDB. Add genres that include ${medium} (for example Action & Adventure or Comedy).`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    const selectedGenreSet = new Set(genreIds);

    /** Keep only titles whose TMDB genre_ids overlap user selections (OR). */
    const matchesSelectedGenres = (item: TMDBMovie | TMDBTvShow): boolean => {
      const ids = item.genre_ids;
      if (!Array.isArray(ids) || ids.length === 0) return false;
      for (const id of ids) {
        if (selectedGenreSet.has(Number(id))) return true;
      }
      return false;
    };

    console.log(`📊 User preferences: ${providerIds.length} providers, ${genreIds.length} genres`);
    console.log(`   Provider IDs: ${providerIds.join(', ')}`);
    console.log(`   Genre IDs: ${genreIds.join(', ')}`);

    // Get user's swiped IDs for this type to exclude
    const { data: swipedRows } = await supabaseAdmin
      .from('swipes')
      .select('tmdb_id')
      .eq('user_id', userId)
      .eq('type', feedType);

    const swipedIds = new Set(
      (swipedRows ?? [])
        .map((s) => Number(s.tmdb_id))
        .filter((id) => Number.isFinite(id))
    );

    // TMDB's with_genres uses AND logic (all genres must match)
    // To get OR logic (any genre), we make separate requests per genre and combine.
    //
    // Client `page` is a 1-based page into the **sorted unswiped list** (offset = (page-1)*limit),
    // not a disjoint TMDB window. We accumulate TMDB discover pages from 1 upward until we have
    // enough unswiped rows to slice [offset, offset+limit) — same pool refresh uses when you
    // call page 1 again after swiping (fixes "page 2 skipped the rest of batch 1").
    const discoverPath = feedType === 'tv' ? 'discover/tv' : 'discover/movie';
    const clientPage = Math.max(1, Math.min(page, 500));
    const offset = (clientPage - 1) * limit;
    /**
     * Max TMDB discover page index to pull this request (per genre, same index).
     * Grow with offset so deeper client pages can build a big enough pool to slice.
     */
    const maxTmdbPagesThisRequest = Math.min(
      500,
      Math.max(
        18,
        12 + Math.ceil((offset + limit) / Math.max(1, limit)) * 12
      )
    );

    // v3 discover: use api_key query param OR Bearer read token — not both (TMDB can reject / return empty).
    const tmdbHeaders: Record<string, string> = { Accept: 'application/json' };
    if (TMDB_READ_ACCESS_TOKEN && !TMDB_API_KEY) {
      tmdbHeaders.Authorization = `Bearer ${TMDB_READ_ACCESS_TOKEN}`;
    }

    // Pipe = OR (Netflix OR Prime). Comma = AND (must be on both) — often returns nothing with multiple providers.
    const providerParam = providerIds.join('|');

    const fetchDiscover = async (
      scanPage: number,
      withGenreId: number | null
    ): Promise<{ total_pages: number; results: (TMDBMovie | TMDBTvShow)[] }> => {
      const params = new URLSearchParams({
        watch_region: 'US',
        with_watch_providers: providerParam,
        sort_by: 'popularity.desc',
        include_adult: 'false',
        page: scanPage.toString(),
      });
      if (withGenreId != null) {
        params.set('with_genres', String(withGenreId));
      }
      if (TMDB_API_KEY) {
        params.set('api_key', TMDB_API_KEY);
      }

      const discoverUrl = `${TMDB_BASE_URL}/${discoverPath}?${params.toString()}`;
      const response = await fetch(discoverUrl, { headers: tmdbHeaders });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `❌ TMDB discover error page ${scanPage} genre ${withGenreId ?? 'none'}:`,
          response.status,
          errorText.slice(0, 200)
        );
        return { total_pages: 0, results: [] };
      }

      const data: TMDBDiscoverResponse = await response.json();
      const tp = typeof data.total_pages === 'number' && data.total_pages > 0 ? data.total_pages : 0;
      return { total_pages: tp, results: data.results ?? [] };
    };

    const itemMap = new Map<number, TMDBMovie | TMDBTvShow>();
    let maxTmdbTotalPages = 0;
    let sawTmdbTotalPages = false;
    let lastScannedTmdbPage = 0;

    for (let scanPage = 1; scanPage <= 500; scanPage++) {
      if (scanPage > maxTmdbPagesThisRequest) {
        console.log(`   Stopping TMDB scan at page ${scanPage - 1} (per-request cap ${maxTmdbPagesThisRequest})`);
        break;
      }
      lastScannedTmdbPage = scanPage;
      // One discover per selected genre (OR). Do not add a provider-only discover — it bypasses
      // with_genres and floods the pool with popular titles outside user genres.
      console.log(`📡 TMDB ${discoverPath} page ${scanPage} (${genreIds.length} genres, parallel)...`);

      const packets = await Promise.all(genreIds.map((gid) => fetchDiscover(scanPage, gid)));

      for (const packet of packets) {
        if (packet.total_pages > 0) {
          sawTmdbTotalPages = true;
          maxTmdbTotalPages = Math.max(maxTmdbTotalPages, packet.total_pages);
        }
        for (const item of packet.results) {
          if (typeof item.id !== 'number') continue;
          if (!matchesSelectedGenres(item)) continue;
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
      const unswipedCount = combined.filter((item) => !swipedIds.has(item.id)).length;
      console.log(
        `   TMDB page ${scanPage}: ${combined.length} unique in pool, ${unswipedCount} unswiped (need ${offset + limit} for slice)`
      );

      if (unswipedCount >= offset + limit) {
        break;
      }
    }

    const unswipedSorted = Array.from(itemMap.values())
      .filter(matchesSelectedGenres)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .filter((item) => !swipedIds.has(item.id));

    console.log(
      `📦 Slice client page ${clientPage} (offset ${offset}): ${unswipedSorted.length} unswiped in pool, TMDB scanned 1..${lastScannedTmdbPage}`
    );

    // Transform to FeedItem (unified shape for movie and tv)
    const items: FeedItem[] = unswipedSorted.slice(offset, offset + limit).map((item) => {
      const isTv = feedType === 'tv';
      const tv = item as TMDBTvShow;
      const movie = item as TMDBMovie;
      return {
        tmdb_id: item.id,
        title: isTv ? (tv.name || 'Untitled') : (movie.title || 'Untitled'),
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

    const totalUnswiped = unswipedSorted.length;
    const consumedEnd = offset + items.length;
    const moreInPool = totalUnswiped > consumedEnd;
    const mightHaveMoreInTmdb =
      sawTmdbTotalPages && lastScannedTmdbPage < maxTmdbTotalPages;
    // Next client page if this slice is not the tail of the pool, or we returned a full page and TMDB may yield more after a deeper scan.
    const hasNextPage =
      moreInPool || (mightHaveMoreInTmdb && items.length >= limit);
    const nextPage = hasNextPage ? clientPage + 1 : null;

    console.log(
      `✅ Returning ${items.length} ${feedType}s (nextPage: ${nextPage}, totalUnswiped: ${totalUnswiped}, consumedEnd: ${consumedEnd}, tmdbHasMore: ${mightHaveMoreInTmdb})`
    );

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
