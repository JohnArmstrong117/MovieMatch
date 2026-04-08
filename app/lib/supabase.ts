// Import URL polyfill for React Native compatibility
// This must be imported before Supabase client
import 'react-native-url-polyfill';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolve Supabase URL from config.
 * In production builds, this must be explicitly provided.
 */
function getSupabaseUrlFromConfig(): string {
  const customUrl =
    Constants.expoConfig?.extra?.supabaseUrl || 
    process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (customUrl) {
    return customUrl;
  }

  if (!__DEV__) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL (or expo.extra.supabaseUrl). Production builds must use hosted Supabase.'
    );
  }

  // Dev-only local fallback: infer LAN host for Expo Go.
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:54321`;
    }
  }

  if (Platform.OS === 'web') {
    return 'http://127.0.0.1:54321';
  }

  return 'http://127.0.0.1:54321';
}

const supabaseUrl = getSupabaseUrlFromConfig();

// Debug: Log the Supabase URL being used (remove in production)
if (__DEV__) {
  console.log('🔗 Supabase URL:', supabaseUrl);
  console.log('📱 Platform:', Platform.OS);
  console.log('🌐 Host URI:', Constants.expoConfig?.hostUri);
}

const supabaseAnonKey = 
  Constants.expoConfig?.extra?.supabaseAnonKey || 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY (or expo.extra.supabaseAnonKey).'
  );
}

// Singleton pattern: only create one client instance
let supabaseClient: SupabaseClient | null = null;

/**
 * Get or create the Supabase client instance.
 * This ensures only one client is created across the entire app.
 */
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient;
  }

  supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Allow for clock skew issues (JWT issued at future)
      // This helps with the "JWT issued at future" error when device/server clocks differ
      flowType: 'pkce',
    },
    global: {
      // Standard fetch - let Supabase handle response parsing
      // Don't intercept responses here to avoid "already read" errors
      fetch: (url, options = {}) => {
        return fetch(url, options);
      },
    },
  });

  return supabaseClient;
}

// Export the client instance for convenience
export const supabase = getSupabaseClient();

/** Supabase project URL (for direct fetch to Edge Functions, etc.) */
export function getSupabaseUrl(): string {
  return getSupabaseUrlFromConfig();
}

/** Supabase anon key (use for Edge Function calls when session JWT causes 401) */
export function getSupabaseAnonKey(): string {
  return supabaseAnonKey;
}