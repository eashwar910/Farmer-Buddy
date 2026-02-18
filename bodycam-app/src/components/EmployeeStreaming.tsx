import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
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

interface EmployeeStreamingProps {
  shiftId: string;
  employeeName: string;
}

export default function EmployeeStreaming({ shiftId, employeeName }: EmployeeStreamingProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartStreaming = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);

    try {
      await AudioSession.startAudioSession();
      const data = await fetchLiveKitToken(shiftId);
      setToken(data.token);
      setIsStreaming(true);
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      Alert.alert('Connection Error', err.message || 'Failed to start streaming');
    } finally {
      setIsConnecting(false);
    }
  }, [shiftId, isConnecting]);

  const handleStopStreaming = useCallback(async () => {
    setToken(null);
    setIsStreaming(false);
    await AudioSession.stopAudioSession();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  if (!isStreaming || !token) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.startButton, isConnecting && styles.buttonDisabled]}
          onPress={handleStartStreaming}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.startIcon}>📹</Text>
              <Text style={styles.startText}>Start Streaming</Text>
            </>
          )}
        </TouchableOpacity>
        {error && <Text style={styles.errorText}>{error}</Text>}
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
          adaptiveStream: { pixelDensity: 'screen' },
        }}
        audio={false}
        video={true}
      >
        <StreamingView onStop={handleStopStreaming} />
      </LiveKitRoom>
    </View>
  );
}

function StreamingView({ onStop }: { onStop: () => void }) {
  const room = useRoomContext();
  const [connectionState, setConnectionState] = useState<string>('connecting');

  useEffect(() => {
    if (!room) return;

    const handleStateChange = (state: ConnectionState) => {
      setConnectionState(state);
    };

    const handleDisconnected = () => {
      setConnectionState('disconnected');
    };

    const handleReconnecting = () => {
      setConnectionState('reconnecting');
    };

    const handleReconnected = () => {
      setConnectionState('connected');
    };

    room.on(RoomEvent.ConnectionStateChanged, handleStateChange);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.Reconnecting, handleReconnecting);
    room.on(RoomEvent.Reconnected, handleReconnected);

    // Set initial state
    setConnectionState(room.state);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleStateChange);
      room.off(RoomEvent.Disconnected, handleDisconnected);
      room.off(RoomEvent.Reconnecting, handleReconnecting);
      room.off(RoomEvent.Reconnected, handleReconnected);
    };
  }, [room]);

  // Get local camera track
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const localTrack = tracks.find(
    (t) => isTrackReference(t) && t.participant.isLocal
  );

  return (
    <View style={styles.streamingContainer}>
      {/* Connection status */}
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
      </View>

      {/* Local camera preview */}
      <View style={styles.previewContainer}>
        {localTrack && isTrackReference(localTrack) ? (
          <VideoTrack trackRef={localTrack} style={styles.localVideo} />
        ) : (
          <View style={styles.noVideo}>
            <Text style={styles.noVideoText}>Camera initializing...</Text>
          </View>
        )}
      </View>

      {/* Stop button */}
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
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
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
