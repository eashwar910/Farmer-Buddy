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
import RecordingSummaryModal from '../components/RecordingSummaryModal';

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
  summary: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | null;
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
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

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

  const handleViewSummary = (recording: Recording) => {
    setSelectedRecording(recording);
    setShowSummaryModal(true);
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

        {/* AI Summary Button */}
        {item.status === 'completed' && (
          <TouchableOpacity
            style={[
              styles.summaryButton,
              item.processing_status === 'completed' && styles.summaryButtonReady,
              item.processing_status === 'processing' && styles.summaryButtonProcessing,
              item.processing_status !== 'completed' && item.processing_status !== 'processing' && styles.summaryButtonPending,
            ]}
            onPress={() => item.processing_status === 'completed' ? handleViewSummary(item) : undefined}
            disabled={item.processing_status !== 'completed'}
          >
            {item.processing_status === 'processing' ? (
              <>
                <ActivityIndicator size="small" color="#F59E0B" />
                <Text style={styles.summaryButtonText}>⏳ AI Processing...</Text>
              </>
            ) : item.processing_status === 'completed' ? (
              <Text style={styles.summaryButtonText}>🤖 View AI Summary</Text>
            ) : (
              <Text style={[styles.summaryButtonText, { color: '#64748B' }]}>⏳ Pending...</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Open button */}
        {hasUrl && item.status === 'completed' && (
          <TouchableOpacity
            style={styles.openButton}
            onPress={() => handleOpen(item.storage_url!)}
          >
            <Text style={styles.openButtonText}>⬆ Open Video</Text>
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
      {recordings.length === 0 ? (
        <>
          <Text style={styles.headerTitle}>{employeeName}</Text>
          <Text style={styles.headerSubtitle}>0 recordings</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📼</Text>
            <Text style={styles.emptyTitle}>No Recordings Yet</Text>
            <Text style={styles.emptySubtext}>
              Recordings will appear here automatically once the employee starts streaming.
            </Text>
          </View>
        </>
      ) : (
        <FlatList
          data={recordings}
          keyExtractor={(item) => item.id}
          renderItem={renderRecording}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{employeeName}</Text>
              <Text style={styles.headerSubtitle}>{recordings.length} recording{recordings.length !== 1 ? 's' : ''}</Text>
            </View>
          }
          showsVerticalScrollIndicator={true}
        />
      )}

      {/* Summary Modal */}
      <RecordingSummaryModal
        visible={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        employeeName={employeeName}
        summary={selectedRecording?.summary || null}
        loading={selectedRecording?.processing_status === 'processing'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  centered: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
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
    marginBottom: 8,
  },
  chunkLabel: {},
  chunkNumber: {
    fontSize: 15,
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
    marginBottom: 4,
  },
  timeLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  timeValue: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  summaryButton: {
    marginTop: 10,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryButtonReady: {
    backgroundColor: '#1E3A8A',
    borderColor: '#3B82F6',
  },
  summaryButtonProcessing: {
    backgroundColor: '#1F1C0A',
    borderColor: '#F59E0B',
  },
  summaryButtonPending: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
    opacity: 0.65,
  },
  summaryButtonText: {
    color: '#E2E8F0',
    fontWeight: '600',
    fontSize: 13,
  },
  openButton: {
    marginTop: 6,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  openButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
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
