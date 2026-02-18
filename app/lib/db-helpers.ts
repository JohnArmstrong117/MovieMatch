/**
 * Database helper functions for common operations
 * These functions provide type-safe wrappers around Supabase queries
 */

import { supabase } from './supabase';
import type { Database } from './database.types';

type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

// Type aliases for easier use
export type Profile = Tables<'profiles'>;
export type StreamingService = Tables<'streaming_services'>;
export type Genre = Tables<'genres'>;
export type Title = Tables<'titles'>;
export type Swipe = Tables<'swipes'>;
export type Match = Tables<'matches'>;

// TMDB types (from new schema)
export type TMDBProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number | null;
  updated_at: string;
};

export type TMDBGenre = {
  genre_id: number;
  name: string;
  updated_at: string;
};

/**
 * Profile helpers
 */
export const profileHelpers = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (error) throw error;
    return data;
  },

  async updateProfile(userId: string, updates: Updates<'profiles'>): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },
};

/**
 * Streaming services helpers (now using TMDB providers)
 */
export const streamingServiceHelpers = {
  async getAll(): Promise<TMDBProvider[]> {
    const { data, error } = await supabase
      .from('tmdb_providers_movie')
      .select('*')
      .order('provider_name');
    
    if (error) throw error;
    return data || [];
  },

  async getUserServices(userId: string): Promise<TMDBProvider[]> {
    const { data, error } = await supabase
      .from('user_providers')
      .select('tmdb_providers_movie(*)')
      .eq('user_id', userId);
    
    if (error) throw error;
    // Filter out null values in case of missing joins
    return (data || [])
      .map((item: any) => item.tmdb_providers_movie)
      .filter((provider: any) => provider != null);
  },

  async addUserService(userId: string, providerId: number): Promise<void> {
    const { error } = await supabase
      .from('user_providers')
      .insert({ user_id: userId, provider_id: providerId });
    
    if (error) throw error;
  },

  async removeUserService(userId: string, providerId: number): Promise<void> {
    const { error } = await supabase
      .from('user_providers')
      .delete()
      .eq('user_id', userId)
      .eq('provider_id', providerId);
    
    if (error) throw error;
  },

  async getUserProviderKeys(userId: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_user_provider_keys', {
      p_user_id: userId,
    });
    
    if (error) throw error;
    return data || [];
  },

  /**
   * Sync providers from TMDB API into tmdb_providers_movie (Edge Function).
   * Call when providers table is empty (e.g. after db reset).
   */
  async syncFromTMDB(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await supabase.functions.invoke('sync_providers');
    if (response.error) throw response.error;
    if (response.data && typeof response.data === 'object' && (response.data as any).error) {
      throw new Error((response.data as any).error);
    }
  },
};

/**
 * Genre helpers (now using TMDB genres)
 */
export const genreHelpers = {
  async getAll(): Promise<TMDBGenre[]> {
    const { data, error } = await supabase
      .from('tmdb_genres_movie')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data || [];
  },

  async getUserGenres(userId: string): Promise<TMDBGenre[]> {
    const { data, error } = await supabase
      .from('user_genres')
      .select('tmdb_genres_movie(*)')
      .eq('user_id', userId);
    
    if (error) throw error;
    // Filter out null values in case of missing joins
    return (data || [])
      .map((item: any) => item.tmdb_genres_movie)
      .filter((genre: any) => genre != null);
  },

  async addUserGenre(userId: string, genreId: number): Promise<void> {
    const { error } = await supabase
      .from('user_genres')
      .insert({ user_id: userId, genre_id: genreId });
    
    if (error) throw error;
  },

  async removeUserGenre(userId: string, genreId: number): Promise<void> {
    const { error } = await supabase
      .from('user_genres')
      .delete()
      .eq('user_id', userId)
      .eq('genre_id', genreId);
    
    if (error) throw error;
  },

  async getUserGenreIds(userId: string): Promise<number[]> {
    const { data, error } = await supabase.rpc('get_user_genre_ids', {
      p_user_id: userId,
    });
    
    if (error) throw error;
    return data || [];
  },
};

/**
 * Title helpers
 */
export const titleHelpers = {
  async getByTmdbId(tmdbId: number): Promise<Title | null> {
    const { data, error } = await supabase
      .from('titles')
      .select('*')
      .eq('tmdb_id', tmdbId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  },

  async upsertTitle(titleData: {
    tmdb_id: number;
    type: 'movie' | 'tv';
    title: string;
    original_title?: string | null;
    poster_path?: string | null;
    backdrop_path?: string | null;
    overview?: string | null;
    release_date?: string | null;
    first_air_date?: string | null;
    popularity?: number | null;
    vote_average?: number | null;
    vote_count?: number | null;
    adult?: boolean;
    metadata?: any;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('upsert_title', {
      p_tmdb_id: titleData.tmdb_id,
      p_type: titleData.type,
      p_title: titleData.title,
      p_original_title: titleData.original_title,
      p_poster_path: titleData.poster_path,
      p_backdrop_path: titleData.backdrop_path,
      p_overview: titleData.overview,
      p_release_date: titleData.release_date,
      p_first_air_date: titleData.first_air_date,
      p_popularity: titleData.popularity,
      p_vote_average: titleData.vote_average,
      p_vote_count: titleData.vote_count,
      p_adult: titleData.adult ?? false,
      p_metadata: titleData.metadata,
    });
    
    if (error) throw error;
    return data;
  },
};

/**
 * Swipe helpers
 */
/** Normalize so DB always gets number and lowercase type (avoids string/number or case mismatch) */
function normTmdbId(v: unknown): number {
  const n = Number(v);
  if (Number.isNaN(n) || !Number.isFinite(n)) throw new Error(`Invalid tmdb_id: ${v}`);
  return n;
}
function normType(v: unknown): 'movie' | 'tv' {
  if (v === 'tv') return 'tv';
  return 'movie';
}

export const swipeHelpers = {
  async createSwipe(swipe: Inserts<'swipes'>): Promise<Swipe> {
    const payload = {
      ...swipe,
      tmdb_id: normTmdbId(swipe.tmdb_id),
      type: normType(swipe.type),
    };
    const { data, error } = await supabase
      .from('swipes')
      .upsert(payload, {
        onConflict: 'user_id,tmdb_id,type',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async hasSwiped(userId: string, tmdbId: number, type: 'movie' | 'tv'): Promise<boolean> {
    const { data, error } = await supabase.rpc('has_user_swiped', {
      p_user_id: userId,
      p_tmdb_id: tmdbId,
      p_type: type,
    });
    
    if (error) throw error;
    return data ?? false;
  },

  async getUserSwipes(userId: string, type?: 'movie' | 'tv'): Promise<Swipe[]> {
    let query = supabase
      .from('swipes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (type) {
      query = query.eq('type', type);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getSwipeCount(userId: string, type?: 'movie' | 'tv') {
    const { data, error } = await supabase.rpc('get_user_swipe_count', {
      p_user_id: userId,
      p_type: type ?? null,
    });
    
    if (error) throw error;
    return data || [];
  },
};

/**
 * Match helpers
 */
export const matchHelpers = {
  async getUserMatches(userId: string): Promise<Match[]> {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  /**
   * Load the user's matches (likes only) with title data.
   * Uses RPC when available; otherwise builds list purely from swipes where decision = 'like'
   * (no view), so wrong films never appear even if the DB view or matches table is stale.
   */
  async getMatchesWithTitles(userId: string) {
    const { data, error } = await supabase.rpc('get_liked_matches_with_titles', {
      p_user_id: userId,
    });
    if (!error) return (data ?? []) as any[];
    // RPC not found — build from swipes only (single source of truth: decision = 'like')
    if (error.code === 'PGRST202') {
      return this.getMatchesWithTitlesFromLikesOnly(userId);
    }
    throw error;
  },

  /**
   * Build matches list only from swipes where decision = 'like'. Does not use the view.
   * Guarantees only liked titles appear regardless of matches table or view state.
   */
  async getMatchesWithTitlesFromLikesOnly(userId: string): Promise<any[]> {
    const { data: likes, error: likesErr } = await supabase
      .from('swipes')
      .select('tmdb_id, type, created_at')
      .eq('user_id', userId)
      .eq('decision', 'like')
      .order('created_at', { ascending: false });
    if (likesErr) throw likesErr;
    if (!likes?.length) return [];

    const { data: matches, error: matchesErr } = await supabase
      .from('matches')
      .select('id, tmdb_id, type, watched, notes, rating, updated_at')
      .eq('user_id', userId);
    if (matchesErr) throw matchesErr;
    const matchMap = new Map<string, any>();
    (matches ?? []).forEach((m) => matchMap.set(`${normTmdbId(m.tmdb_id)}-${normType(m.type)}`, m));

    const orParts = likes.map(
      (s) => `and(tmdb_id.eq.${normTmdbId(s.tmdb_id)},type.eq.${normType(s.type)})`
    );
    const { data: titleRows, error: titlesErr } = await supabase
      .from('titles')
      .select('tmdb_id, type, title, original_title, poster_path, backdrop_path, overview, release_date, first_air_date, popularity, vote_average, vote_count')
      .or(orParts.join(','));
    if (titlesErr) throw titlesErr;
    const titleMap = new Map<string, any>();
    (titleRows ?? []).forEach((t) => titleMap.set(`${normTmdbId(t.tmdb_id)}-${normType(t.type)}`, t));

    return likes.map((s) => {
      const key = `${normTmdbId(s.tmdb_id)}-${normType(s.type)}`;
      const m = matchMap.get(key);
      const t = titleMap.get(key);
      return {
        id: m?.id ?? null,
        user_id: userId,
        tmdb_id: s.tmdb_id,
        type: s.type,
        watched: m?.watched ?? false,
        notes: m?.notes ?? null,
        rating: m?.rating ?? null,
        created_at: s.created_at,
        updated_at: m?.updated_at ?? null,
        title: t?.title ?? null,
        original_title: t?.original_title ?? null,
        poster_path: t?.poster_path ?? null,
        backdrop_path: t?.backdrop_path ?? null,
        overview: t?.overview ?? null,
        release_date: t?.release_date ?? null,
        first_air_date: t?.first_air_date ?? null,
        popularity: t?.popularity ?? null,
        vote_average: t?.vote_average ?? null,
        vote_count: t?.vote_count ?? null,
      };
    });
  },

  async updateMatch(matchId: string, updates: Updates<'matches'>): Promise<Match> {
    const { data, error } = await supabase
      .from('matches')
      .update(updates)
      .eq('id', matchId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Create a match immediately when user likes a title
   */
  async createMatch(userId: string, tmdbId: number, type: 'movie' | 'tv'): Promise<Match> {
    const tid = normTmdbId(tmdbId);
    const t = normType(type);
    const { data, error } = await supabase
      .from('matches')
      .insert({
        user_id: userId,
        tmdb_id: tid,
        type: t,
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        const { data: existing, error: fetchError } = await supabase
          .from('matches')
          .select('*')
          .eq('user_id', userId)
          .eq('tmdb_id', tid)
          .eq('type', t)
          .single();
        if (fetchError) throw fetchError;
        if (existing) return existing as Match;
      }
      throw error;
    }
    return data;
  },

  /**
   * Remove a match when user passes on a title
   */
  async removeMatch(userId: string, tmdbId: number, type: 'movie' | 'tv'): Promise<void> {
    const tid = normTmdbId(tmdbId);
    const t = normType(type);
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', tid)
      .eq('type', t);

    if (error) throw error;
  },

  async syncFromSwipes(userId: string): Promise<number> {
    const { data, error } = await supabase.rpc('sync_matches_from_swipes', {
      p_user_id: userId,
    });
    
    if (error) throw error;
    return data ?? 0;
  },

  /**
   * Diagnostic function to check for mismatches between swipes and matches
   * Returns swipes that should have matches but don't, and matches that shouldn't exist
   */
  async diagnoseMismatches(userId: string) {
    // Get all likes
    const { data: likes } = await supabase
      .from('swipes')
      .select('tmdb_id, type, decision, created_at')
      .eq('user_id', userId)
      .eq('decision', 'like');

    // Get all matches
    const { data: matches } = await supabase
      .from('matches')
      .select('tmdb_id, type, created_at')
      .eq('user_id', userId);

    // Find likes without matches
    const likesWithoutMatches = (likes || []).filter(like => 
      !(matches || []).some(m => 
        m.tmdb_id === like.tmdb_id && m.type === like.type
      )
    );

    // Find matches without likes
    const matchesWithoutLikes = (matches || []).filter(match =>
      !(likes || []).some(like =>
        like.tmdb_id === match.tmdb_id && 
        like.type === match.type &&
        like.decision === 'like'
      )
    );

    // Find passes that have matches (shouldn't happen)
    const { data: passes } = await supabase
      .from('swipes')
      .select('tmdb_id, type, decision')
      .eq('user_id', userId)
      .eq('decision', 'pass');

    const passesWithMatches = (passes || []).filter(pass =>
      (matches || []).some(m =>
        m.tmdb_id === pass.tmdb_id && m.type === pass.type
      )
    );

    return {
      likesWithoutMatches,
      matchesWithoutLikes,
      passesWithMatches,
      totalLikes: likes?.length || 0,
      totalMatches: matches?.length || 0,
      totalPasses: passes?.length || 0,
    };
  },
};

/**
 * Movie feed helpers - uses TMDB Edge Function
 */
export interface FeedMovie {
  tmdb_id: number;
  title: string;
  poster_path: string | null;
  overview: string;
  release_date: string | null;
  popularity: number | null;
  vote_average: number | null;
  vote_count: number | null;
}

export interface FeedMoviesResponse {
  items: FeedMovie[];
  nextPage: number | null;
}

export const feedHelpers = {
  async getMovies(options: { limit?: number; page?: number } = {}): Promise<FeedMoviesResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const response = await supabase.functions.invoke('feed_movies', {
      body: {
        limit: options.limit || 20,
        page: options.page || 1,
        includeRentBuy: true,
        includeFlatrate: true,
      },
    });

    if (response.error) {
      // Log full response for debugging
      console.error('❌ Edge Function error response:', {
        error: response.error,
        data: response.data,
        status: (response.error as any)?.status,
        message: response.error.message,
      });      // Try to extract error message from various possible locations
      let errorMessage = 'Unknown error';
      let errorDetails = '';
      
      // Check if response.data is a JSON object with error info
      if (response.data && typeof response.data === 'object') {
        errorMessage = (response.data as any).error || (response.data as any).message || errorMessage;
        errorDetails = (response.data as any).details || '';
      }
      
      // Fallback to error.message if we didn't find anything in data
      if (errorMessage === 'Unknown error' && response.error.message) {
        errorMessage = response.error.message;
      }
      
      // Create enhanced error with all available info
      const enhancedError = new Error(errorMessage);
      (enhancedError as any).code = (response.error as any)?.name || (response.error as any)?.code || 'FUNCTIONS_ERROR';
      (enhancedError as any).details = errorDetails;
      (enhancedError as any).status = (response.error as any)?.status;
      (enhancedError as any).originalError = response.error;
      (enhancedError as any).responseData = response.data;
      
      throw enhancedError;
    }
    
    return response.data as FeedMoviesResponse;
  },
};