import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

type User = SupabaseUser | null;

type AuthContextType = {
  user: User;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Resolves with a session when the user is signed in immediately (no email confirmation). */
  signUp: (email: string, password: string, name?: string, phone?: string) => Promise<Session | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const RESET_PASSWORD_PATH = '/(auth)/reset-password';
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    checkAuthState();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuthState = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        // Invalid/expired refresh token (e.g. after Supabase restart) – clear local session so user can sign in again
        if (error.message?.includes('Refresh Token') || error.message?.includes('refresh_token')) {
          try {
            await supabase.auth.signOut();
          } catch (_) {
            // Ignore signOut errors; we still clear state below
          }
        }
        setSession(null);
        setUser(null);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
    } catch (error) {
      console.error('Error checking auth state:', error);
      setSession(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    setSession(data.session);
    setUser(data.user);
  };

  const signUp = async (email: string, password: string, name?: string, phone?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || '',
        },
      },
    });

    if (error) throw error;

    setSession(data.session);
    setUser(data.user ?? null);

    if (data.user && phone && phone.replace(/\D/g, '').length > 0) {
      const normalizedPhone = phone.replace(/\D/g, '');
      await supabase
        .from('profiles')
        .update({ phone: normalizedPhone })
        .eq('id', data.user.id);
    }

    return data.session ?? null;
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error);
        throw error;
      }
      
      // Clear state even if there was an error (best effort)
      setSession(null);
      setUser(null);
    } catch (error: any) {
      console.error('Error during sign out:', error);
      // Clear state anyway to ensure UI updates
      setSession(null);
      setUser(null);
      // Re-throw if it's not a response read error
      if (!error?.message?.includes('already read')) {
        throw error;
      }
    }
  };

  const resetPassword = async (email: string) => {
    const redirectTo = Linking.createURL(RESET_PASSWORD_PATH);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

