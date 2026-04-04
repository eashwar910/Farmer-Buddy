'use client';

import { useEffect, useState } from 'react';
import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
  useParticipants,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { getSupabaseClient } from '@/lib/supabase';

interface LiveStreamGridProps {
  shiftId: string;
}

export default function LiveStreamGrid({ shiftId }: LiveStreamGridProps) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shiftId) return;
    fetchToken(shiftId);
  }, [shiftId]);

  const fetchToken = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-livekit-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ shiftId: id }),
        },
      );

      if (!res.ok) {
        const text = await res.text();
        setError(`Token error: ${text}`);
        return;
      }

      const data = await res.json();
      setToken(data.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 bg-fb-card rounded-xl border border-fb-border animate-pulse">
        <span className="text-fb-subtext text-sm">Connecting to live streams…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-fb-red/5 rounded-xl border border-fb-red/20">
        <span className="text-fb-red text-sm">⚠️ {error}</span>
        <button
          onClick={() => fetchToken(shiftId)}
          className="mt-3 text-xs text-fb-accent hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center h-48 bg-fb-card rounded-xl border border-fb-border">
        <span className="text-fb-subtext text-sm">No active stream token</span>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      token={token}
      connect={true}
      audio={false}
      video={false}
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--fb-bg)' }}
    >
      <StreamGrid />
    </LiveKitRoom>
  );
}

function StreamGrid() {
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });

  // Filter to remote participants only (manager is local, view-only)
  const remoteTracks = tracks.filter((t) => !t.participant.isLocal);

  if (remoteTracks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-fb-card rounded-xl border border-fb-border">
        <div className="w-3 h-3 rounded-full bg-fb-border mb-3" />
        <p className="text-fb-subtext text-sm">No employees streaming yet</p>
        <p className="text-fb-subtext/50 text-xs mt-1">
          {participants.length > 1
            ? `${participants.length - 1} participant(s) in room, waiting for camera…`
            : 'Waiting for employees to start streaming'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`grid gap-3 ${
        remoteTracks.length === 1
          ? 'grid-cols-1'
          : remoteTracks.length <= 4
          ? 'grid-cols-2'
          : 'grid-cols-3'
      }`}
    >
      {remoteTracks.map((trackRef) => (
        <div
          key={`${trackRef.participant.sid}-${trackRef.publication?.trackSid}`}
          className="relative bg-black rounded-xl overflow-hidden aspect-video border border-fb-border"
        >
          <VideoTrack trackRef={trackRef} className="w-full h-full object-cover" />

          {/* Name label */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-fb-accent animate-pulse" />
              <span className="text-white text-xs font-semibold truncate">
                {trackRef.participant.name || trackRef.participant.identity}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
