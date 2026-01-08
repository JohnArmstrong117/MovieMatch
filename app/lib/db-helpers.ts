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
 * Streaming services helpers
 */
export const streamingServiceHelpers = {
  async getAll(): Promise<StreamingService[]> {
    const { data, error } = await supabase
      .from('streaming_services')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data;
  },

  async getUserServices(userId: string): Promise<StreamingService[]> {
    const { data, error } = await supabase
      .from('user_streaming_services')
      .select('streaming_services(*)')
      .eq('user_id', userId);
    
    if (error) throw error;
    return data.map((item: any) => item.streaming_services);
  },

  async addUserService(userId: string, serviceId: string): Promise<void> {
    const { error } = await supabase
      .from('user_streaming_services')
      .insert({ user_id: userId, service_id: serviceId });
    
    if (error) throw error;
  },

  async removeUserService(userId: string, serviceId: string): Promise<void> {
    const { error } = await supabase
      .from('user_streaming_services')
      .delete()
      .eq('user_id', userId)
      .eq('service_id', serviceId);
    
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
 * Genre helpers
 */
export const genreHelpers = {
  async getAll(): Promise<Genre[]> {
    const { data, error } = await supabase
      .from('genres')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data;
  },

  async getUserGenres(userId: string): Promise<Genre[]> {
    const { data, error } = await supabase
      .from('user_genre_prefs')
      .select('genres(*)')
      .eq('user_id', userId);
    
    if (error) throw error;
    return data.map((item: any) => item.genres);
  },

  async addUserGenre(userId: string, genreId: string): Promise<void> {
    const { error } = await supabase
      .from('user_genre_prefs')
      .insert({ user_id: userId, genre_id: genreId });
    
    if (error) throw error;
  },

  async removeUserGenre(userId: string, genreId: string): Promise<void> {
    const { error } = await supabase
      .from('user_genre_prefs')
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
    const { data, error } = await supabase
      .from('swipes')
      .insert(swipe)
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

  async syncFromSwipes(userId: string): Promise<number> {
    const { data, error } = await supabase.rpc('sync_matches_from_swipes', {
      p_user_id: userId,
    });
    
    if (error) throw error;
    return data ?? 0;
  },
};

