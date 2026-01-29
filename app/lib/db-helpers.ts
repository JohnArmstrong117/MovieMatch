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
      .single();
    
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
export const swipeHelpers = {
  async createSwipe(swipe: Inserts<'swipes'>): Promise<Swipe> {
    // Use upsert to handle cases where user swipes on the same movie again
    // This allows updating the decision if they change their mind
    const { data, error } = await supabase
      .from('swipes')
      .upsert(swipe, { 
        onConflict: 'user_id,tmdb_id,type',
        ignoreDuplicates: false 
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

  async getMatchesWithTitles(userId: string) {
    const { data, error } = await supabase
      .from('matches_with_titles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
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
    const { data, error } = await supabase
      .from('matches')
      .insert({
        user_id: userId,
        tmdb_id: tmdbId,
        type: type,
      })
      .select()
      .single();
    
    if (error) {
      // If match already exists (conflict), that's okay - just return it
      if (error.code === '23505') { // Unique violation
        const { data: existing } = await supabase
          .from('matches')
          .select('*')
          .eq('user_id', userId)
          .eq('tmdb_id', tmdbId)
          .eq('type', type)
          .single();
        if (existing) return existing;
      }
      throw error;
    }
    return data;
  },

  /**
   * Remove a match when user passes on a title
   */
  async removeMatch(userId: string, tmdbId: number, type: 'movie' | 'tv'): Promise<void> {
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', tmdbId)
      .eq('type', type);
    
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
      });

      // Try to extract error message from various possible locations
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
