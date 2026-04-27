/**
 * Database helper functions for common operations
 * These functions provide type-safe wrappers around Supabase queries
 */

import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

import { getSupabaseAnonKey, getSupabaseUrl, supabase } from './supabase';
import type { Database } from './database.types';
import {
  normalizeUnifiedSlugs,
  slugsFromLegacyMovieGenreIds,
  UNIFIED_GENRE_SLUGS,
} from './unified-genres';
import { assertModerationAllowed, checkModerationAllowed } from './moderation';

/**
 * Call Edge Functions with plain fetch. On Android/React Native, `supabase.functions.invoke`
 * often omits the `Authorization` header in the actual HTTP request (401 in logs with no auth header).
 */
async function invokeEdgeFunctionPost<TResponse>(
  functionName: string,
  session: Session,
  body: Record<string, unknown>
): Promise<TResponse> {
  const base = getSupabaseUrl().replace(/\/$/, '');
  const url = `${base}/functions/v1/${functionName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: getSupabaseAnonKey(),
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(text.slice(0, 200) || `Edge function ${functionName} returned ${res.status}`);
    }
  }
  if (!res.ok) {
    const msg =
      (typeof json.error === 'string' && json.error) ||
      (typeof json.message === 'string' && json.message) ||
      (typeof json.hint === 'string' && json.hint) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return json as TResponse;
}

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
    if (updates.display_name !== undefined && updates.display_name !== null) {
      const dn = String(updates.display_name).trim();
      if (dn.length > 0) {
        await assertModerationAllowed(dn);
      }
    }
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Ensures a profiles row exists (FK target for user_providers / user_unified_genres).
   * Handles rare cases where the auth trigger did not run or failed.
   */
  async ensureProfile(user: SupabaseUser): Promise<void> {
    const existing = await this.getProfile(user.id);
    if (existing) return;

    let displayName =
      (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
      user.email?.split('@')[0] ||
      'User';
    if (displayName.trim() && !(await checkModerationAllowed(displayName))) {
      displayName = 'User';
    }
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      display_name: displayName,
      email: user.email ?? null,
    });

    if (error && error.code !== '23505') {
      throw error;
    }
  },

  /**
   * Upload a profile picture from a local file URI (e.g. from expo-image-picker).
   * Uploads to storage at avatars/{userId}/avatar.{ext}, updates profile.avatar_url, returns public URL.
   */
  async uploadAvatar(userId: string, fileUri: string, mimeType: string = 'image/jpeg'): Promise<string> {
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/gif' ? 'gif' : 'jpg';
    const path = `${userId}/avatar.${ext}`;

    const response = await fetch(fileUri);
    const blob = await response.blob();

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: mimeType, upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    await this.updateProfile(userId, { avatar_url: publicUrl });
    return publicUrl;
  },
};

export type FriendRequest = Tables<'friend_requests'>;

export type FriendWithProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  request_id: string;
  created_at: string;
};

export type PendingRequestWithProfile = {
  id: string;
  display_name: string | null;
  request_id: string;
  created_at: string;
  direction: 'incoming' | 'outgoing';
};

/**
 * Friends helpers
 */
export const friendHelpers = {
  /** User ids involved in any block with the current user (either direction). */
  async getBlockedRelatedUserIds(): Promise<Set<string>> {
    const { data, error } = await supabase.rpc('user_ids_with_block_relationship');
    if (error) throw error;
    const rows = (data ?? []) as { other_user_id: string }[];
    return new Set(rows.map((r) => r.other_user_id));
  },

  /** True if the current user cannot interact with the other user (block exists either way). */
  async isBlockedWith(otherUserId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('is_blocked_with', {
      p_other_user_id: otherUserId,
    });
    if (error) throw error;
    return data === true;
  },

  /** List of accepted friends (excludes anyone you have a block relationship with). */
  async getFriends(): Promise<FriendWithProfile[]> {
    const { data, error } = await supabase.rpc('list_accepted_friends_for_user');
    if (error) throw error;
    const rows = (data ?? []) as {
      id: string;
      display_name: string | null;
      avatar_url: string | null;
      request_id: string;
      created_at: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      display_name: r.display_name,
      avatar_url: r.avatar_url,
      request_id: r.request_id,
      created_at: r.created_at,
    }));
  },

  /** Pending requests received (others want to be friends with me) */
  async getPendingReceived(userId: string): Promise<PendingRequestWithProfile[]> {
    const blocked = await this.getBlockedRelatedUserIds();
    const { data, error } = await supabase
      .from('friend_requests')
      .select('id, from_user_id, created_at')
      .eq('to_user_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    const list = (data || []) as { id: string; from_user_id: string; created_at: string }[];
    const filtered = list.filter((r) => !blocked.has(r.from_user_id));
    if (filtered.length === 0) return [];
    const ids = filtered.map((r) => r.from_user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', ids);
    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    return filtered.map((r) => {
      const p = byId.get(r.from_user_id);
      return {
        id: r.from_user_id,
        display_name: p?.display_name ?? null,
        request_id: r.id,
        created_at: r.created_at,
        direction: 'incoming' as const,
      };
    });
  },

  /** Pending requests sent (I requested them) */
  async getPendingSent(userId: string): Promise<PendingRequestWithProfile[]> {
    const blocked = await this.getBlockedRelatedUserIds();
    const { data, error } = await supabase
      .from('friend_requests')
      .select('id, to_user_id, created_at')
      .eq('from_user_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    const list = (data || []) as { id: string; to_user_id: string; created_at: string }[];
    const filtered = list.filter((r) => !blocked.has(r.to_user_id));
    if (filtered.length === 0) return [];
    const ids = filtered.map((r) => r.to_user_id);
    const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', ids);
    const byId = new Map((profiles || []).map((p) => [p.id, p]));
    return filtered.map((r) => {
      const p = byId.get(r.to_user_id);
      return {
        id: r.to_user_id,
        display_name: p?.display_name ?? null,
        request_id: r.id,
        created_at: r.created_at,
        direction: 'outgoing' as const,
      };
    });
  },

  /** Search users by display_name (for adding friends). Excludes self, blocks, and existing friends/pending. */
  async searchByDisplayName(query: string, limit = 20): Promise<{ id: string; display_name: string | null }[]> {
    const q = query.trim();
    if (!q) return [];
    const { data, error } = await supabase.rpc('search_profiles_for_friends', {
      p_query: q,
      p_limit: limit,
    });
    if (error) throw error;
    return (data ?? []) as { id: string; display_name: string | null }[];
  },

  /** Report a received recommendation message (moderation queue). */
  async reportRecommendation(
    recommendationId: string,
    reasonCode: string,
    reasonDetail?: string | null
  ): Promise<void> {
    const { error } = await supabase.rpc('report_recommendation', {
      p_recommendation_id: recommendationId,
      p_reason_code: reasonCode,
      p_reason_detail: reasonDetail ?? '',
    });
    if (error) throw error;
  },

  /**
   * Block a user: creates a moderation event, removes any friend/pending rows between you,
   * and hides them from inbox, search, and recommendations going forward.
   */
  async blockUser(
    blockedUserId: string,
    opts?: { reasonCode?: string; reasonDetail?: string | null; recommendationId?: string | null }
  ): Promise<void> {
    const { error } = await supabase.rpc('block_user', {
      p_blocked_id: blockedUserId,
      p_reason_code: opts?.reasonCode ?? 'unspecified',
      p_reason_detail: opts?.reasonDetail ?? '',
      p_recommendation_id: opts?.recommendationId ?? null,
    });
    if (error) throw error;
  },

  async sendRequest(fromUserId: string, toUserId: string): Promise<void> {
    if (fromUserId === toUserId) throw new Error('Cannot send request to yourself');
    const { error } = await supabase.from('friend_requests').insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      status: 'pending',
    });
    if (error) throw error;
  },

  async acceptRequest(requestId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('to_user_id', userId);
    if (error) throw error;
  },

  async rejectRequest(requestId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .eq('to_user_id', userId);
    if (error) throw error;
  },

  /** Cancel a request I sent */
  async cancelRequest(requestId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId)
      .eq('from_user_id', userId);
    if (error) throw error;
  },

  /** Remove a friend (delete the accepted request) */
  async removeFriend(userId: string, friendId: string): Promise<void> {
    const { data: row } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`)
      .maybeSingle();
    if (!row) throw new Error('Friend request not found');
    const { error } = await supabase.from('friend_requests').delete().eq('id', row.id);
    if (error) throw error;
  },

  /** Shared matches with a friend (titles in both users' match lists). Same row shape as get_liked_matches_with_titles. */
  async getSharedMatchesWithFriend(friendId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_shared_matches_with_friend', {
      p_friend_id: friendId,
    });
    if (error) throw error;
    return (data ?? []) as any[];
  },

  /** Titles the user has already recommended to this friend (tmdb_id + type). */
  async getRecommendationsSentToFriend(fromUserId: string, toUserId: string): Promise<{ tmdb_id: number; type: string }[]> {
    const { data, error } = await supabase
      .from('recommendations')
      .select('tmdb_id, type')
      .eq('from_user_id', fromUserId)
      .eq('to_user_id', toUserId);
    if (error) throw error;
    return (data ?? []) as { tmdb_id: number; type: string }[];
  },

  /** Recommend a title (from your matches) to a friend. Fails if not friends. Optional short message to the friend. */
  async sendRecommendation(
    fromUserId: string,
    toUserId: string,
    tmdbId: number,
    type: 'movie' | 'tv',
    message?: string | null
  ): Promise<void> {
    const payload: Record<string, unknown> = {
      from_user_id: fromUserId,
      to_user_id: toUserId,
      tmdb_id: tmdbId,
      type,
    };
    const trimmed = typeof message === 'string' ? message.trim() : '';
    if (trimmed) {
      await assertModerationAllowed(trimmed);
      payload.message = trimmed;
    }
    const { error } = await supabase.from('recommendations').insert(payload);
    if (error) throw error;
  },

  /** Recommendations received by the current user (inbox), with sender name and title info. Excludes blocked users. */
  async getRecommendationsReceived(): Promise<RecommendationReceived[]> {
    const { data, error } = await supabase.rpc('get_recommendations_received');
    if (error) throw error;
    return (data ?? []) as RecommendationReceived[];
  },

  /** Count of recommendations received since the given ISO timestamp (for inbox badge). If since is null, returns total. */
  async getRecommendationsReceivedUnreadCount(sinceIso: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('get_recommendations_received_unread_count', {
      p_since: sinceIso,
    });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  },

  /** Count of pending friend requests received (for Friends tab badge). */
  async getPendingReceivedCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('friend_requests')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', userId)
      .eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
  },

  /** Normalize phone to digits only (for storage and lookup). */
  normalizePhone(phone: string): string {
    return (phone ?? '').replace(/\D/g, '');
  },

  /** Look up which emails belong to registered users (for Add from contacts). Returns email, user_id, display_name; excludes self and existing friends/pending. */
  async lookupByEmails(
    userId: string,
    emails: string[]
  ): Promise<{ email: string; user_id: string; display_name: string | null }[]> {
    const normalized = emails.map((e) => e?.trim().toLowerCase()).filter(Boolean);
    if (normalized.length === 0) return [];
    const { data, error } = await supabase.rpc('lookup_users_by_emails', {
      p_caller_id: userId,
      p_emails: normalized,
    });
    if (error) throw error;
    return (data ?? []).map((r: { email: string; user_id: string; display_name: string | null }) => ({
      email: r.email,
      user_id: r.user_id,
      display_name: r.display_name,
    }));
  },

  /** Look up which phone numbers (digits) belong to registered users. Inputs normalized to digits. Excludes self and existing friends/pending. */
  async lookupByPhones(
    userId: string,
    phones: string[]
  ): Promise<{ phone: string; user_id: string; display_name: string | null }[]> {
    const normalized = phones.map((p) => friendHelpers.normalizePhone(p)).filter(Boolean);
    if (normalized.length === 0) return [];
    const { data, error } = await supabase.rpc('lookup_users_by_phones', {
      p_caller_id: userId,
      p_phones: normalized,
    });
    if (error) throw error;
    return (data ?? []).map((r: { phone: string; user_id: string; display_name: string | null }) => ({
      phone: r.phone,
      user_id: r.user_id,
      display_name: r.display_name,
    }));
  },
};

export type RecommendationReceived = {
  id: string;
  from_user_id: string;
  from_user_display_name: string | null;
  tmdb_id: number;
  type: string;
  created_at: string;
  message: string | null;
  title: string | null;
  original_title: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  first_air_date: string | null;
  vote_average: number | null;
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

    if (!error && (data?.length ?? 0) > 0) {
      return data || [];
    }

    // Backward-compatible fallback for projects still on legacy tables.
    const { data: legacyData, error: legacyError } = await supabase
      .from('streaming_services')
      .select('*')
      .order('name');

    if (legacyError) {
      if (error) throw error;
      throw legacyError;
    }

    return (legacyData || []).map((item) => ({
      provider_id: Number(item.provider_key),
      provider_name: item.name,
      logo_path: item.logo_url,
      display_priority: null,
      updated_at: item.created_at,
    }));
  },

  async getUserServices(userId: string): Promise<TMDBProvider[]> {
    const { data, error } = await supabase
      .from('user_providers')
      .select('tmdb_providers_movie(*)')
      .eq('user_id', userId);

    if (!error) {
      // Filter out null values in case of missing joins
      const joined = (data || [])
        .map((item: any) => item.tmdb_providers_movie)
        .filter((provider: any) => provider != null);
      if (joined.length > 0) return joined;
    }

    // Backward-compatible fallback for legacy user streaming service schema.
    const { data: legacyData, error: legacyError } = await supabase
      .from('user_streaming_services')
      .select('streaming_services(*)')
      .eq('user_id', userId);

    if (legacyError) {
      if (error) throw error;
      throw legacyError;
    }

    return (legacyData || [])
      .map((item: any) => item.streaming_services)
      .filter((provider: any) => provider != null)
      .map((item: any) => ({
        provider_id: Number(item.provider_key),
        provider_name: item.name,
        logo_path: item.logo_url,
        display_priority: null,
        updated_at: item.created_at,
      }));
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

    const data = await invokeEdgeFunctionPost<Record<string, unknown>>('sync_providers', session, {});
    if (typeof data.error === 'string' && data.error) {
      throw new Error(data.error);
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
 * Unified genre slugs (one picker for movies + TV; TMDB IDs differ per medium in Edge Function).
 */
export const unifiedGenreHelpers = {
  async getUserSlugs(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('user_unified_genres')
      .select('slug')
      .eq('user_id', userId);
    if (error) throw error;
    return normalizeUnifiedSlugs((data ?? []).map((r) => r.slug).filter(Boolean));
  },

  /**
   * Replace all unified genre rows for the user. Clears legacy user_genres so the feed uses one source.
   */
  async setUserSlugs(userId: string, slugs: string[]): Promise<void> {
    const unique = normalizeUnifiedSlugs(
      slugs.filter((s) => s && UNIFIED_GENRE_SLUGS.has(s))
    );
    const { error: delUnified } = await supabase
      .from('user_unified_genres')
      .delete()
      .eq('user_id', userId);
    if (delUnified) throw delUnified;
    if (unique.length > 0) {
      const { error: ins } = await supabase.from('user_unified_genres').insert(
        unique.map((slug) => ({ user_id: userId, slug }))
      );
      if (ins) throw ins;
    }
    const { error: delLegacy } = await supabase.from('user_genres').delete().eq('user_id', userId);
    if (delLegacy) throw delLegacy;
  },

  /** Slugs for UI: DB first, else map legacy movie genre rows (before migration / save). */
  async getUserSlugsOrLegacy(userId: string): Promise<string[]> {
    const fromDb = await this.getUserSlugs(userId);
    if (fromDb.length > 0) return fromDb;
    const legacy = await genreHelpers.getUserGenres(userId);
    return slugsFromLegacyMovieGenreIds(legacy.map((g) => g.genre_id));
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

  /**
   * Remove all PASS swipes for a user (optionally filtered by type).
   * This lets passed titles re-enter the potential swipe feed.
   */
  async clearPassedSwipes(userId: string, type?: 'movie' | 'tv'): Promise<void> {
    let query = supabase
      .from('swipes')
      .delete()
      .eq('user_id', userId)
      .eq('decision', 'pass');

    if (type) {
      query = query.eq('type', type);
    }

    const { error } = await query;
    if (error) throw error;
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
   * Optional type filter: 'movie' | 'tv' to show only movies or only TV shows.
   * Uses RPC when available; otherwise builds list purely from swipes where decision = 'like'.
   */
  async getMatchesWithTitles(userId: string, type?: 'movie' | 'tv') {
    const { data, error } = await supabase.rpc('get_liked_matches_with_titles', {
      p_user_id: userId,
      p_type: type ?? null,
    });
    if (!error) return (data ?? []) as any[];
    // RPC not found (e.g. old signature) — fallback
    if (error.code === 'PGRST202') {
      return this.getMatchesWithTitlesFromLikesOnly(userId, type);
    }
    throw error;
  },

  /**
   * Build matches list only from swipes where decision = 'like'. Does not use the view.
   * Guarantees only liked titles appear regardless of matches table or view state.
   */
  async getMatchesWithTitlesFromLikesOnly(userId: string, type?: 'movie' | 'tv'): Promise<any[]> {
    let query = supabase
      .from('swipes')
      .select('tmdb_id, type, created_at')
      .eq('user_id', userId)
      .eq('decision', 'like')
      .order('created_at', { ascending: false });
    if (type) {
      query = query.eq('type', type);
    }
    const { data: likes, error: likesErr } = await query;
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
      .select('tmdb_id, type, title, original_title, poster_path, backdrop_path, overview, release_date, first_air_date, popularity, vote_average, vote_count, metadata')
      .or(orParts.join(','));
    if (titlesErr) throw titlesErr;
    const titleMap = new Map<string, any>();
    (titleRows ?? []).forEach((t) => titleMap.set(`${normTmdbId(t.tmdb_id)}-${normType(t.type)}`, t));

    return likes.map((s) => {
      const key = `${normTmdbId(s.tmdb_id)}-${normType(s.type)}`;
      const m = matchMap.get(key);
      const t = titleMap.get(key);
      const meta = t?.metadata;
      const genreIds = Array.isArray(meta?.genre_ids) ? meta.genre_ids : [];
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
        genre_ids: genreIds,
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
   * Returns true if the user already has this title in their matches (liked).
   */
  async hasMatch(userId: string, tmdbId: number, type: 'movie' | 'tv'): Promise<boolean> {
    const tid = normTmdbId(tmdbId);
    const t = normType(type);
    const { data, error } = await supabase
      .from('matches')
      .select('id')
      .eq('user_id', userId)
      .eq('tmdb_id', tid)
      .eq('type', t)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data != null;
  },

  /**
   * Add a title to the user's matches from inbox (record like swipe + match).
   * Safe to call if already in matches (no-op / idempotent).
   */
  async addToMatchesFromInbox(userId: string, tmdbId: number, type: 'movie' | 'tv'): Promise<void> {
    await swipeHelpers.createSwipe({
      user_id: userId,
      tmdb_id: tmdbId,
      type,
      decision: 'like',
    });
    await this.createMatch(userId, tmdbId, type);
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
  first_air_date?: string | null;
  popularity: number | null;
  vote_average: number | null;
  vote_count: number | null;
  genre_ids?: number[];
}

export interface FeedMoviesResponse {
  items: FeedMovie[];
  nextPage: number | null;
}

export const feedHelpers = {
  async getMovies(options: { limit?: number; page?: number } = {}): Promise<FeedMoviesResponse> {
    return this.getFeed({ ...options, type: 'movie' });
  },

  async getTv(options: { limit?: number; page?: number } = {}): Promise<FeedMoviesResponse> {
    return this.getFeed({ ...options, type: 'tv' });
  },

  async getFeed(options: { type?: 'movie' | 'tv'; limit?: number; page?: number } = {}): Promise<FeedMoviesResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const type = options.type === 'tv' ? 'tv' : 'movie';
    return invokeEdgeFunctionPost<FeedMoviesResponse>('feed_movies', session, {
      type,
      limit: options.limit || 20,
      page: options.page || 1,
      includeRentBuy: true,
      includeFlatrate: true,
    });
  },
};

/**
 * Permanently delete the signed-in user (auth + cascaded profile data). Avatar files in storage are removed first.
 */
export const accountHelpers = {
  async deleteMyAccount(): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    await invokeEdgeFunctionPost<{ ok?: boolean }>('delete_account', session, {});
  },
};

/**
 * TMDB search for "Add to matches" – searches both movies and TV.
 */
export interface TmdbSearchResult {
  tmdb_id: number;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  overview: string | null;
  release_date: string | null;
  first_air_date: string | null;
  vote_average: number | null;
}

export interface TmdbSearchResponse {
  results: TmdbSearchResult[];
  page: number;
  total_pages: number;
  total_results: number;
}

export const searchHelpers = {
  async searchTmdb(query: string, page: number = 1): Promise<TmdbSearchResponse> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const data = await invokeEdgeFunctionPost<TmdbSearchResponse>('search_tmdb', session, {
      query: query.trim(),
      page,
    });
    return {
      results: data?.results ?? [],
      page: data?.page ?? 1,
      total_pages: data?.total_pages ?? 0,
      total_results: data?.total_results ?? 0,
    };
  },
};