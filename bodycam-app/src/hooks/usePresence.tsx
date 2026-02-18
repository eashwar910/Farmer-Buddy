import { useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../services/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface PresenceState {
  userId: string;
  name: string;
  role: string;
  online_at: string;
}

export function usePresence(userId: string | undefined, name: string | undefined, role: string | undefined) {
  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceState>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!userId || !name || !role) return;

    const channel = supabase.channel('online-users', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const users: Record<string, PresenceState> = {};
        for (const [key, presences] of Object.entries(state)) {
          if (presences && presences.length > 0) {
            users[key] = presences[0] as PresenceState;
          }
        }
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            userId,
            name,
            role,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    // Handle app state changes for presence
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && channelRef.current) {
        await channelRef.current.track({
          userId,
          name,
          role,
          online_at: new Date().toISOString(),
        });
      } else if (nextState === 'background' && channelRef.current) {
        await channelRef.current.untrack();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppState);

    return () => {
      appStateSub.remove();
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, name, role]);

  const isUserOnline = (uid: string): boolean => {
    return !!onlineUsers[uid];
  };

  return { onlineUsers, isUserOnline };
}
