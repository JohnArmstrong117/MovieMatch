/**
 * Test-friendly Supabase client
 * This bypasses React Native dependencies for Node.js tests
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// For tests, use localhost Supabase
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = 
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// In-memory storage for tests (since AsyncStorage doesn't work in Node.js)
class TestStorage {
  private storage: Map<string, string> = new Map();

  async getItem(key: string): Promise<string | null> {
    return this.storage.get(key) || null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.storage.delete(key);
  }
}

const testStorage = new TestStorage();

// Create Supabase client for tests
export function getTestSupabaseClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: testStorage as any,
      autoRefreshToken: false, // Disable for tests
      persistSession: false, // Disable for tests
      detectSessionInUrl: false,
    },
    global: {
      fetch: (url, options = {}) => {
        return fetch(url, options);
      },
    },
  });
}

export const testSupabase = getTestSupabaseClient();

