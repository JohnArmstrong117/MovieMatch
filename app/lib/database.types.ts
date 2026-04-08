/**
 * Database types for MovieMatch
 * These types are manually maintained to match the Supabase schema
 * For auto-generated types, use: supabase gen types typescript --local > lib/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          country_code: string | null
          avatar_url: string | null
          avatar_color: string | null
          email: string | null
          phone: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          country_code?: string | null
          avatar_url?: string | null
          avatar_color?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          country_code?: string | null
          avatar_url?: string | null
          avatar_color?: string | null
          email?: string | null
          phone?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      streaming_services: {
        Row: {
          id: string
          name: string
          provider_key: string
          logo_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          provider_key: string
          logo_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          provider_key?: string
          logo_url?: string | null
          created_at?: string
        }
      }
      user_streaming_services: {
        Row: {
          user_id: string
          service_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          service_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          service_id?: string
          created_at?: string
        }
      }
      genres: {
        Row: {
          id: string
          name: string
          external_id: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          external_id: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          external_id?: number
          created_at?: string
        }
      }
      user_genre_prefs: {
        Row: {
          user_id: string
          genre_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          genre_id: string
          created_at?: string
        }
        Update: {
          user_id?: string
          genre_id?: string
          created_at?: string
        }
      }
      titles: {
        Row: {
          id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          title: string
          original_title: string | null
          poster_path: string | null
          backdrop_path: string | null
          overview: string | null
          release_date: string | null
          first_air_date: string | null
          popularity: number | null
          vote_average: number | null
          vote_count: number | null
          adult: boolean
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tmdb_id: number
          type: 'movie' | 'tv'
          title: string
          original_title?: string | null
          poster_path?: string | null
          backdrop_path?: string | null
          overview?: string | null
          release_date?: string | null
          first_air_date?: string | null
          popularity?: number | null
          vote_average?: number | null
          vote_count?: number | null
          adult?: boolean
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tmdb_id?: number
          type?: 'movie' | 'tv'
          title?: string
          original_title?: string | null
          poster_path?: string | null
          backdrop_path?: string | null
          overview?: string | null
          release_date?: string | null
          first_air_date?: string | null
          popularity?: number | null
          vote_average?: number | null
          vote_count?: number | null
          adult?: boolean
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
      }
      swipes: {
        Row: {
          id: string
          user_id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          decision: 'like' | 'pass'
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          decision: 'like' | 'pass'
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tmdb_id?: number
          type?: 'movie' | 'tv'
          decision?: 'like' | 'pass'
          created_at?: string
        }
      }
      matches: {
        Row: {
          id: string
          user_id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          watched: boolean
          notes: string | null
          rating: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          watched?: boolean
          notes?: string | null
          rating?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tmdb_id?: number
          type?: 'movie' | 'tv'
          watched?: boolean
          notes?: string | null
          rating?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      friend_requests: {
        Row: {
          id: string
          from_user_id: string
          to_user_id: string
          status: 'pending' | 'accepted' | 'rejected'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          from_user_id: string
          to_user_id: string
          status?: 'pending' | 'accepted' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          from_user_id?: string
          to_user_id?: string
          status?: 'pending' | 'accepted' | 'rejected'
          created_at?: string
          updated_at?: string
        }
      }
      recommendations: {
        Row: {
          id: string
          from_user_id: string
          to_user_id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          created_at: string
          message: string | null
        }
        Insert: {
          id?: string
          from_user_id: string
          to_user_id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          created_at?: string
          message?: string | null
        }
        Update: {
          id?: string
          from_user_id?: string
          to_user_id?: string
          tmdb_id?: number
          type?: 'movie' | 'tv'
          created_at?: string
          message?: string | null
        }
      }
      user_unified_genres: {
        Row: {
          user_id: string
          slug: string
          created_at: string
        }
        Insert: {
          user_id: string
          slug: string
          created_at?: string
        }
        Update: {
          user_id?: string
          slug?: string
          created_at?: string
        }
      }
    }
    Views: {
      matches_with_titles: {
        Row: {
          id: string
          user_id: string
          tmdb_id: number
          type: 'movie' | 'tv'
          watched: boolean
          notes: string | null
          rating: number | null
          created_at: string
          updated_at: string
          title: string | null
          original_title: string | null
          poster_path: string | null
          backdrop_path: string | null
          overview: string | null
          release_date: string | null
          first_air_date: string | null
          popularity: number | null
          vote_average: number | null
          vote_count: number | null
        }
      }
      user_swipe_stats: {
        Row: {
          user_id: string
          type: 'movie' | 'tv'
          decision: 'like' | 'pass'
          count: number
          last_swipe_at: string
        }
      }
    }
    Functions: {
      sync_matches_from_swipes: {
        Args: {
          p_user_id: string
        }
        Returns: number
      }
      get_user_provider_keys: {
        Args: {
          p_user_id: string
        }
        Returns: string[]
      }
      get_user_genre_ids: {
        Args: {
          p_user_id: string
        }
        Returns: number[]
      }
      has_user_swiped: {
        Args: {
          p_user_id: string
          p_tmdb_id: number
          p_type: string
        }
        Returns: boolean
      }
      get_user_swipe_count: {
        Args: {
          p_user_id: string
          p_type?: string | null
        }
        Returns: {
          type: string
          decision: string
          count: number
        }[]
      }
      upsert_title: {
        Args: {
          p_tmdb_id: number
          p_type: string
          p_title: string
          p_original_title?: string | null
          p_poster_path?: string | null
          p_backdrop_path?: string | null
          p_overview?: string | null
          p_release_date?: string | null
          p_first_air_date?: string | null
          p_popularity?: number | null
          p_vote_average?: number | null
          p_vote_count?: number | null
          p_adult?: boolean
          p_metadata?: Json | null
        }
        Returns: string
      }
      lookup_users_by_emails: {
        Args: {
          p_caller_id: string
          p_emails: string[]
        }
        Returns: {
          email: string
          user_id: string
          display_name: string | null
        }[]
      }
      lookup_users_by_phones: {
        Args: {
          p_caller_id: string
          p_phones: string[]
        }
        Returns: {
          phone: string
          user_id: string
          display_name: string | null
        }[]
      }
    }
  }
}

