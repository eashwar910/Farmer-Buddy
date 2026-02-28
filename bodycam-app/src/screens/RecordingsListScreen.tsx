import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '../services/supabase';

interface Recording {
  id: string;
  shift_id: string;
  employee_id: string;
  egress_id: string | null;
  chunk_index: number;
  storage_url: string | null;
  status: 'recording' | 'completed' | 'failed';
  started_at: string;
  ended_at: string | null;
}

interface RecordingsListScreenProps {
  route: {
    params: {
      shiftId: string;
      employeeId: string;
      employeeName: string;
    };
  };
  navigation: any;
}

export default function RecordingsListScreen({ route, navigation }: RecordingsListScreenProps) {
  const { shiftId, employeeId, employeeName } = route.params;
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: `${employeeName} — Recordings` });
    fetchRecordings();

    // Subscribe to realtime updates (new chunks coming in)
    const channel = supabase
      .channel(`recordings-${shiftId}-${employeeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recordings',
          filter: `shift_id=eq.${shiftId}`,
        },
        () => {
          fetchRecordings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shiftId, employeeId]);

  const fetchRecordings = async () => {
    const { data, error } = await supabase
      .from('recordings')
      .select('*')
      .eq('shift_id', shiftId)
      .eq('employee_id', employeeId)
      .order('started_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch recordings:', error);
    } else {
      setRecordings(data as Recording[]);
    }
    setLoading(false);
  };

  const handleOpen = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot Open', 'No app available to open this link.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to open recording link.');
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const renderRecording = ({ item, index }: { item: Recording; index: number }) => {
    const isLive      = item.status === 'recording';
    const isFailed    = item.status === 'failed';
    const hasUrl      = !!item.storage_url;
    const duration    = item.ended_at
      ? Math.round((new Date(item.ended_at).getTime() - new Date(item.started_at).getTime()) / 60000)
      : null;

    return (
      <View style={[styles.card, isLive && styles.cardLive, isFailed && styles.cardFailed]}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.chunkLabel}>
            <Text style={styles.chunkNumber}>Chunk {index + 1}</Text>
          </View>
          <View style={[styles.statusBadge, isLive ? styles.badgeLive : isFailed ? styles.badgeFailed : styles.badgeDone]}>
            {isLive && <View style={styles.livePulse} />}
            <Text style={[styles.statusText, isLive ? styles.statusLive : isFailed ? styles.statusFailed : styles.statusDone]}>
              {isLive ? 'RECORDING' : isFailed ? 'FAILED' : 'COMPLETED'}
            </Text>
          </View>
        </View>

        {/* Time info */}
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Started</Text>
          <Text style={styles.timeValue}>{formatTime(item.started_at)}</Text>
        </View>

        {item.ended_at && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Ended</Text>
            <Text style={styles.timeValue}>{formatTime(item.ended_at)}</Text>
          </View>
        )}

        {duration !== null && (
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Duration</Text>
            <Text style={styles.timeValue}>{duration} min</Text>
          </View>
        )}

        {/* Open button */}
        {hasUrl && item.status === 'completed' && (
          <TouchableOpacity
            style={styles.openButton}
            onPress={() => handleOpen(item.storage_url!)}
          >
            <Text style={styles.openButtonText}>⬆ Open in Browser</Text>
          </TouchableOpacity>
        )}

        {isLive && (
          <View style={styles.liveIndicator}>
            <ActivityIndicator size="small" color="#EF4444" />
            <Text style={styles.liveText}>Recording in progress...</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>{employeeName}</Text>
      <Text style={styles.headerSubtitle}>{recordings.length} recording{recordings.length !== 1 ? 's' : ''}</Text>

      {recordings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📼</Text>
          <Text style={styles.emptyTitle}>No Recordings Yet</Text>
          <Text style={styles.emptySubtext}>
            Recordings will appear here automatically once the employee starts streaming.
          </Text>
        </View>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={(item) => item.id}
          renderItem={renderRecording}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
  },
  list: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardLive: {
    borderColor: '#EF4444',
    backgroundColor: '#1F0A0A',
  },
  cardFailed: {
    borderColor: '#475569',
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chunkLabel: {},
  chunkNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
  },
  badgeLive: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  badgeFailed: {
    backgroundColor: 'rgba(71,85,105,0.3)',
  },
  badgeDone: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  livePulse: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusLive:   { color: '#EF4444' },
  statusFailed: { color: '#64748B' },
  statusDone:   { color: '#22C55E' },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  timeValue: {
    fontSize: 13,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  openButton: {
    marginTop: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  openButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  liveText: {
    color: '#EF4444',
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});
