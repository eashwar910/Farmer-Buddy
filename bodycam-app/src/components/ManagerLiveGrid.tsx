import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  ActivityIndicator,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  useRoomContext,
  useParticipants,
  VideoTrack,
  isTrackReference,
} from '@livekit/react-native';
import { Track, RoomEvent, ConnectionState } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core';
import { fetchLiveKitToken } from '../services/livekitToken';
import { LIVEKIT_URL } from '../services/livekit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ManagerLiveGridProps {
  shiftId: string;
}

export default function ManagerLiveGrid({ shiftId }: ManagerLiveGridProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    setError(null);

    try {
      await AudioSession.startAudioSession();
      const data = await fetchLiveKitToken(shiftId);
      setToken(data.token);
      setIsConnected(true);
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setIsConnecting(false);
    }
  }, [shiftId, isConnecting]);

  // Auto-connect when shift is active
  useEffect(() => {
    connect();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  if (!isConnected || !token) {
    return (
      <View style={styles.connectingContainer}>
        {isConnecting ? (
          <>
            <ActivityIndicator color="#3B82F6" size="large" />
            <Text style={styles.connectingText}>Connecting to live feed...</Text>
          </>
        ) : error ? (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={connect}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect={true}
      options={{
        adaptiveStream: { pixelDensity: 'screen' },
      }}
      audio={false}
      video={false}
    >
      <GridView />
    </LiveKitRoom>
  );
}

function GridView() {
  const room = useRoomContext();
  const participants = useParticipants();
  const tracks = useTracks([Track.Source.Camera]);
  const [connectionState, setConnectionState] = useState<string>('connecting');
  const [fullscreenTrack, setFullscreenTrack] = useState<TrackReferenceOrPlaceholder | null>(null);

  useEffect(() => {
    if (!room) return;

    const handleStateChange = (state: ConnectionState) => {
      setConnectionState(state);
    };

    room.on(RoomEvent.ConnectionStateChanged, handleStateChange);
    setConnectionState(room.state);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleStateChange);
    };
  }, [room]);

  // Filter to only remote tracks (employees)
  const remoteTracks = tracks.filter(
    (t) => isTrackReference(t) && !t.participant.isLocal
  );

  const gridSize = Math.ceil(Math.sqrt(Math.max(remoteTracks.length, 1)));
  const cellWidth = (SCREEN_WIDTH - 48 - (gridSize - 1) * 8) / gridSize;
  const cellHeight = cellWidth * (4 / 3);

  return (
    <View style={styles.gridContainer}>
      {/* Connection status */}
      <View style={styles.statusBar}>
        <View
          style={[
            styles.statusDot,
            connectionState === 'connected' ? styles.dotConnected : styles.dotOther,
          ]}
        />
        <Text style={styles.statusText}>
          {connectionState === 'connected'
            ? `${remoteTracks.length} stream${remoteTracks.length !== 1 ? 's' : ''}`
            : connectionState === 'reconnecting'
            ? 'Reconnecting...'
            : 'Connecting...'}
        </Text>
      </View>

      {/* Video Grid */}
      {remoteTracks.length === 0 ? (
        <View style={styles.emptyGrid}>
          <Text style={styles.emptyIcon}>📡</Text>
          <Text style={styles.emptyTitle}>Waiting for streams</Text>
          <Text style={styles.emptySubtext}>
            Employee streams will appear here when they press "Start Streaming".
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {remoteTracks.map((trackRef) => {
            if (!isTrackReference(trackRef)) return null;
            const participantName = trackRef.participant.name || trackRef.participant.identity;

            return (
              <TouchableOpacity
                key={trackRef.participant.identity}
                style={[styles.gridCell, { width: cellWidth, height: cellHeight }]}
                onPress={() => setFullscreenTrack(trackRef)}
                activeOpacity={0.8}
              >
                <VideoTrack trackRef={trackRef} style={styles.gridVideo} />
                <View style={styles.nameOverlay}>
                  <Text style={styles.nameText} numberOfLines={1}>
                    {participantName}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Disconnected participants placeholder */}
      {participants
        .filter((p) => !p.isLocal && !remoteTracks.find((t) => isTrackReference(t) && t.participant.identity === p.identity))
        .map((p) => (
          <View key={p.identity} style={styles.disconnectedCard}>
            <Text style={styles.disconnectedIcon}>📵</Text>
            <Text style={styles.disconnectedText}>
              {p.name || p.identity} — camera off
            </Text>
          </View>
        ))}

      {/* Fullscreen Modal */}
      <Modal
        visible={!!fullscreenTrack}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={() => setFullscreenTrack(null)}
      >
        <View style={styles.fullscreenContainer}>
          {fullscreenTrack && isTrackReference(fullscreenTrack) ? (
            <>
              <VideoTrack trackRef={fullscreenTrack} style={styles.fullscreenVideo} />
              <View style={styles.fullscreenOverlay}>
                <Text style={styles.fullscreenName}>
                  {fullscreenTrack.participant.name || fullscreenTrack.participant.identity}
                </Text>
              </View>
            </>
          ) : null}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setFullscreenTrack(null)}
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  connectingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  connectingText: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  gridContainer: {
    flex: 1,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dotConnected: {
    backgroundColor: '#22C55E',
  },
  dotOther: {
    backgroundColor: '#F59E0B',
  },
  statusText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyGrid: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridCell: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    position: 'relative',
  },
  gridVideo: {
    flex: 1,
  },
  nameOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  nameText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  disconnectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  disconnectedIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  disconnectedText: {
    color: '#64748B',
    fontSize: 13,
  },
  // Fullscreen
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullscreenVideo: {
    flex: 1,
  },
  fullscreenOverlay: {
    position: 'absolute',
    top: 60,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fullscreenName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
