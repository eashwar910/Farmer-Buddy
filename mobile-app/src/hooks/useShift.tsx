import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabase';
import { Shift } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';

interface ShiftContextType {
  activeShift: Shift | null;
  loading: boolean;
  startShift: (managerId: string) => Promise<{ error: any }>;
  endShift: () => Promise<{ error: any }>;
  elapsedSeconds: number;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export function ShiftProvider({ children }: { children: React.ReactNode }) {
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate elapsed seconds from shift start
  const updateElapsed = useCallback((shift: Shift | null) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (shift && shift.status === 'active') {
      const startTime = new Date(shift.started_at).getTime();
      const tick = () => {
        const now = Date.now();
        setElapsedSeconds(Math.floor((now - startTime) / 1000));
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setElapsedSeconds(0);
    }
  }, []);

  // Fetch the current active shift on mount
  const fetchActiveShift = useCallback(async () => {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching active shift:', error.message);
    }

    const shift = data as Shift | null;
    setActiveShift(shift);
    updateElapsed(shift);
    setLoading(false);
  }, [updateElapsed]);

  // Subscribe to realtime changes on the shifts table
  useEffect(() => {
    fetchActiveShift();

    const channel = supabase
      .channel('shifts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        (payload) => {
          const newShift = payload.new as Shift;
          const eventType = payload.eventType;

          if (eventType === 'INSERT' && newShift.status === 'active') {
            setActiveShift(newShift);
            updateElapsed(newShift);
          } else if (eventType === 'UPDATE') {
            if (newShift.status === 'ended') {
              setActiveShift(null);
              updateElapsed(null);
            } else {
              setActiveShift(newShift);
              updateElapsed(newShift);
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [fetchActiveShift, updateElapsed]);

  // Re-fetch when app comes back to foreground
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchActiveShift();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [fetchActiveShift]);

  const startShift = async (managerId: string) => {
    // Double-press guard: check if there's already an active shift
    if (activeShift) {
      return { error: { message: 'A shift is already active' } };
    }

    const { data, error } = await supabase
      .from('shifts')
      .insert({ manager_id: managerId })
      .select()
      .single();

    if (error) return { error };

    // Realtime will pick this up, but set it immediately for responsiveness
    const shift = data as Shift;
    setActiveShift(shift);
    updateElapsed(shift);
    return { error: null };
  };

  const endShift = async () => {
    if (!activeShift) {
      return { error: { message: 'No active shift to end' } };
    }

    const { error } = await supabase
      .from('shifts')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', activeShift.id);

    if (error) return { error };

    // Realtime will pick this up, but clear immediately for responsiveness
    setActiveShift(null);
    updateElapsed(null);
    return { error: null };
  };

  return (
    <ShiftContext.Provider
      value={{
        activeShift,
        loading,
        startShift,
        endShift,
        elapsedSeconds,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift() {
  const context = useContext(ShiftContext);
  if (context === undefined) {
    throw new Error('useShift must be used within a ShiftProvider');
  }
  return context;
}
