// Import URL polyfill for React Native compatibility
// This must be imported before Supabase client
import 'react-native-url-polyfill';

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Get the local network IP address for Expo Go
 * Expo Go on physical devices needs the actual IP, not localhost
 */
function getLocalNetworkUrl(): string {
  // Check if we have a custom URL set
  const customUrl = 
    Constants.expoConfig?.extra?.supabaseUrl || 
    process.env.EXPO_PUBLIC_SUPABASE_URL;
  
  if (customUrl) {
    return customUrl;
  }

  // For Expo Go on physical devices, we need the local network IP
  // Try to extract it from the Expo dev server URL
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    // hostUri format: "192.168.1.100:8081" or "localhost:8081"
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:54321`;
    }
  }

  // Fallback: use localhost for web/simulator, or you can set your IP manually
  // For physical devices, you'll need to set EXPO_PUBLIC_SUPABASE_URL with your local IP
  // Example: EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.100:54321
  if (Platform.OS === 'web') {
    return 'http://127.0.0.1:54321';
  }

  // Default fallback
  return 'http://127.0.0.1:54321';
}

// Get Supabase URL and Anon Key from environment variables
// For local development, use the local Supabase instance
const supabaseUrl = getLocalNetworkUrl();

// Debug: Log the Supabase URL being used (remove in production)
if (__DEV__) {
  console.log('🔗 Supabase URL:', supabaseUrl);
  console.log('📱 Platform:', Platform.OS);
  console.log('🌐 Host URI:', Constants.expoConfig?.hostUri);
}

const supabaseAnonKey = 
  Constants.expoConfig?.extra?.supabaseAnonKey || 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

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
      // Handle JWT clock sync issues
      fetch: async (url, options = {}) => {
        try {
          const response = await fetch(url, options);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            // Handle "JWT issued at future" error - this happens when device/server clocks differ
            // For local dev, we can ignore this or wait and retry
            if (errorData.code === 'PGRST303' || errorData.message?.includes('JWT issued at future')) {
              console.warn('JWT clock sync issue detected, waiting before retry...');
              // Wait a bit and retry once
              await new Promise(resolve => setTimeout(resolve, 1000));
              return fetch(url, options);
            }
          }
          return response;
        } catch (error) {
          throw error;
        }
      },
    },
  });

  return supabaseClient;
}

// Export the client instance for convenience
export const supabase = getSupabaseClient();

