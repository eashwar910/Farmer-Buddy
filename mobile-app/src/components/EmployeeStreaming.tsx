import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  useRoomContext,
  VideoTrack,
  isTrackReference,
} from '@livekit/react-native';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
import { fetchLiveKitToken } from '../services/livekitToken';
import { LIVEKIT_URL } from '../services/livekit';
import { supabase } from '../services/supabase';

interface EmployeeStreamingProps {
  shiftId: string;
  employeeName: string;
  onEgressStarted?: () => void;
}

export default function EmployeeStreaming({ shiftId, employeeName, onEgressStarted }: EmployeeStreamingProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [egressId, setEgressId] = useState<string | null>(null);
  const [participantIdentity, setParticipantIdentity] = useState<string | null>(null);

  const handleStartStreaming = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);

    try {
      // ── 1. Request camera permission explicitly ──────────────────────────
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        throw new Error(
          'Camera permission denied. Go to Settings → SmartAgro → Camera and enable it.',
        );
      }

      // ── 2. Start audio session ───────────────────────────────────────────
      await AudioSession.startAudioSession();

      // ── 3. Fetch LiveKit token from Supabase Edge Function ───────────────
      const data = await fetchLiveKitToken(shiftId);
      setToken(data.token);
      setParticipantIdentity(data.identity);
      setIsStreaming(true);
    } catch (err: any) {
      const msg = err.message || 'Failed to connect';
      setError(msg);
      Alert.alert('Streaming Error', msg);
    } finally {
      setIsConnecting(false);
    }
  }, [shiftId, isConnecting]);

  const handleStopStreaming = useCallback(async () => {
    // Update UI immediately for instant feedback
    setIsStopping(true);
    const currentEgressId = egressId;
    setToken(null);
    setIsStreaming(false);
    setEgressId(null);
    // Stop audio session immediately to free resources
    AudioSession.stopAudioSession();

    // Fire stop-egress in background — don't wait for it to update UI
    if (currentEgressId) {
      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await supabase.functions.invoke('stop-egress', {
            body: { egressId: currentEgressId },
            headers: session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : undefined,
          });
        } catch (err) {
          console.warn('stop-egress call failed (non-critical):', err);
        } finally {
          setIsStopping(false);
        }
      })();
    } else {
      setIsStopping(false);
    }
  }, [egressId]);

  useEffect(() => {
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  if (!isStreaming || !token) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.startButton, (isConnecting || isStopping) && styles.buttonDisabled]}
          onPress={handleStartStreaming}
          disabled={isConnecting || isStopping}
        >
          {isConnecting ? (
            <ActivityIndicator color="#fff" />
          ) : isStopping ? (
            <>
              <ActivityIndicator color="#fff" />
              <Text style={styles.startText}>Stopping...</Text>
            </>
          ) : (
            <>
              <Text style={styles.startIcon}>📹</Text>
              <Text style={styles.startText}>Start Streaming</Text>
            </>
          )}
        </TouchableOpacity>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠️ {error}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LiveKitRoom
        serverUrl={LIVEKIT_URL}
        token={token}
        connect={true}
        options={{
          adaptiveStream: false,
          videoCaptureDefaults: {
            resolution: { width: 1280, height: 720, frameRate: 30 },
            facingMode: 'environment',
          },
          publishDefaults: {
            simulcast: false,
            videoEncoding: {
              maxBitrate: 1_500_000,
              maxFramerate: 30,
            },
          },
        }}
        audio={false}
        video={true}
      >
        <StreamingView
          shiftId={shiftId}
          participantIdentity={participantIdentity}
          onStop={handleStopStreaming}
          egressId={egressId}
          onEgressStarted={(id) => {
            setEgressId(id);
            onEgressStarted?.();
          }}
        />
      </LiveKitRoom>
    </View>
  );
}

interface StreamingViewProps {
  shiftId: string;
  participantIdentity: string | null;
  onStop: () => void;
  egressId: string | null;
  onEgressStarted: (id: string) => void;
}

function StreamingView({ shiftId, participantIdentity, onStop, egressId, onEgressStarted }: StreamingViewProps) {
  const room = useRoomContext();
  const [connectionState, setConnectionState] = useState<string>('connecting');
  const egressStartedRef = useRef(false);

  useEffect(() => {
    if (!room) return;

    const handleStateChange = (state: ConnectionState) => {
      setConnectionState(state);
    };

    const handleConnected = async () => {
      setConnectionState('connected');

      if (egressStartedRef.current) return;
      egressStartedRef.current = true;

      try {
        console.log('Room connected — starting egress for shift:', shiftId);

        // ── FIX: explicitly pass the session token ──────────────────────────
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session?.access_token) {
          console.error('No valid session found, cannot start egress:', sessionError);
          return;
        }

        console.log('Session token found, invoking start-egress...');

        const { data, error } = await supabase.functions.invoke('start-egress', {
          body: { shiftId, participantIdentity },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (error) {
          console.error('start-egress error:', error);
        } else if (data?.egressId) {
          console.log('Egress started:', data.egressId);
          onEgressStarted(data.egressId);
        } else {
          console.warn('start-egress returned no egressId:', data);
        }
      } catch (err) {
        console.error('start-egress invoke failed:', err);
      }
    };

    const handleDisconnected = () => setConnectionState('disconnected');
    const handleReconnecting = () => setConnectionState('reconnecting');
    const handleReconnected  = () => setConnectionState('connected');

    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.ConnectionStateChanged, handleStateChange);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.Reconnecting, handleReconnecting);
    room.on(RoomEvent.Reconnected, handleReconnected);

    if (room.state === ConnectionState.Connected) {
      handleConnected();
    } else {
      setConnectionState(room.state);
    }

    return () => {
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.ConnectionStateChanged, handleStateChange);
      room.off(RoomEvent.Disconnected, handleDisconnected);
      room.off(RoomEvent.Reconnecting, handleReconnecting);
      room.off(RoomEvent.Reconnected, handleReconnected);
    };
  }, [room, shiftId, onEgressStarted]);

  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const localTrack = tracks.find(
    (t) => isTrackReference(t) && t.participant.isLocal
  );

  return (
    <View style={styles.streamingContainer}>
      <View style={styles.connectionBar}>
        <View
          style={[
            styles.connectionDot,
            connectionState === 'connected'
              ? styles.dotConnected
              : connectionState === 'reconnecting'
              ? styles.dotReconnecting
              : styles.dotDisconnected,
          ]}
        />
        <Text style={styles.connectionText}>
          {connectionState === 'connected'
            ? 'Streaming Live'
            : connectionState === 'reconnecting'
            ? 'Reconnecting...'
            : connectionState === 'connecting'
            ? 'Connecting...'
            : 'Disconnected'}
        </Text>

        {egressId && connectionState === 'connected' && (
          <View style={styles.recBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC</Text>
          </View>
        )}
      </View>

      <View style={styles.previewContainer}>
        {localTrack && isTrackReference(localTrack) ? (
          <VideoTrack trackRef={localTrack} style={styles.localVideo} />
        ) : (
          <View style={styles.noVideo}>
            <Text style={styles.noVideoText}>Camera initializing...</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.stopButton} onPress={onStop}>
        <Text style={styles.stopText}>Stop Streaming</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  startButton: {
    backgroundColor: '#22C55E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  startIcon: {
    fontSize: 24,
  },
  startText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 14,
    marginTop: 12,
  },
  errorBannerText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  streamingContainer: {
    flex: 1,
  },
  connectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotConnected: {
    backgroundColor: '#22C55E',
  },
  dotReconnecting: {
    backgroundColor: '#F59E0B',
  },
  dotDisconnected: {
    backgroundColor: '#EF4444',
  },
  connectionText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  recText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  previewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    aspectRatio: 3 / 4,
    width: '100%',
  },
  localVideo: {
    flex: 1,
  },
  noVideo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noVideoText: {
    color: '#64748B',
    fontSize: 14,
  },
  stopButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  stopText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});