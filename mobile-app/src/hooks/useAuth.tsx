import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string, role: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error.message);
      return null;
    }
    return data as UserProfile;
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id);
      setProfile(p);
    }
  };

  useEffect(() => {
    // onAuthStateChange must be registered BEFORE getSession() so that the
    // INITIAL_SESSION event is never missed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Supabase fires SIGNED_OUT after a failed auto-refresh (invalid token).
        // Wipe local storage so the client won't attempt another refresh next launch.
        if (event === 'SIGNED_OUT') {
          supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Only hold the loading gate for events that require re-navigating the stack.
          // TOKEN_REFRESHED is a background event — setting loading=true here would
          // unmount the Stack.Navigator and kick users back to HomeScreen mid-session.
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            setLoading(true);
          }
          const p = await fetchProfile(session.user.id);
          setProfile(p);
        } else {
          setProfile(null);
        }

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || !session) {
          setLoading(false);
        }
      }
    );

    // Trigger the INITIAL_SESSION event via getSession.
    // If the stored token is invalid the client will fire SIGNED_OUT above.
    supabase.auth.getSession().catch(() => {
      // Suppress any uncaught promise rejection from a bad stored token.
      setSession(null);
      setUser(null);
      setProfile(null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && !profile) {
      // onAuthStateChange is the authority on loading state for the sign-in path.
      // Calling setLoading(false) here would race against its async fetchProfile
      // and could clear the loading gate before the role is known.
      fetchProfile(user.id).then((p) => {
        setProfile(p);
      });
    } else if (!user) {
      setLoading(false);
    }
  }, [user]);

  const signUp = async (email: string, password: string, name: string, role: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) return { error };

    // Create user profile row with role assigned at sign-up
    if (data.user) {
      const { error: profileError } = await supabase.from('users').upsert({
        id: data.user.id,
        email,
        name,
        role,
      }, { onConflict: 'id' });
      if (profileError) {
        console.error('Error creating profile:', profileError.message);
        return { error: profileError };
      }
    }

    return { error: null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    try {
      // Race against a 3s timeout — if Supabase hangs, we still clear local state
      await Promise.race([
        supabase.auth.signOut(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('signOut timeout')), 3000)
        ),
      ]);
    } catch (e) {
      console.warn('[signOut] error (ignored, clearing local state anyway):', e);
    } finally {
      // Always clear — guarantees navigation to login regardless of network
      setProfile(null);
      setSession(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
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
