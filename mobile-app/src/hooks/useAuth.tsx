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
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error?.message?.includes('Refresh Token Not Found') || error?.message?.includes('Invalid Refresh Token')) {
        // Stale session in AsyncStorage — wipe it and force re-login
        supabase.auth.signOut().finally(() => {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
        });
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // TOKEN_REFRESH_FAILED fires when the stored refresh token is invalid
        if (event === 'TOKEN_REFRESHED' && !session) {
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
          // unmount the Stack.Navigator, reset navigation state, and kick the employee
          // back to HomeScreen (losing their place mid-shift).
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            setLoading(true);
          }
          const p = await fetchProfile(session.user.id);
          setProfile(p);
        } else {
          setProfile(null);
        }
        // Only release the loading gate for events that set it, or on sign-out.
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || !session) {
          setLoading(false);
        }
      }
    );

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
