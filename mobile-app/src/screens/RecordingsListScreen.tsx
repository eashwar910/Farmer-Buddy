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

import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { supabase } from '../services/supabase';
import RecordingSummaryModal from '../components/RecordingSummaryModal';
import { useAppContext } from '../context/AppContext';
import { Recording } from '../types';
import { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordingsList'>;

export default function RecordingsListScreen({ route, navigation }: Props) {
  const { shiftId, employeeId, employeeName, recordingId } = route.params;
  const { themeColors } = useAppContext();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const styles = getStyles(themeColors);

  useEffect(() => {
    navigation.setOptions({ title: `${employeeName} — Recordings` });
    fetchRecordings();

    // When showing per-chunk data for a specific recording session, subscribe to
    // recording_chunks changes; otherwise subscribe to the recordings table.
    const channel = recordingId
      ? supabase
          .channel(`chunks-${recordingId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'recording_chunks',
              filter: `recording_id=eq.${recordingId}`,
            },
            () => { fetchRecordings(); }
          )
          .subscribe()
      : supabase
          .channel(`recordings-${shiftId}-${employeeId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'recordings',
              filter: `shift_id=eq.${shiftId}`,
            },
            () => { fetchRecordings(); }
          )
          .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [shiftId, employeeId, recordingId]);

  const fetchRecordings = async () => {
    if (recordingId) {
      // Fetch per-chunk rows and map them to the Recording interface
      const { data, error } = await supabase
        .from('recording_chunks')
        .select('id, recording_id, chunk_index, storage_url, started_at, ended_at, summary, processing_status')
        .eq('recording_id', recordingId)
        .order('chunk_index', { ascending: true });

      if (error) {
        console.error('Failed to fetch recording_chunks:', error);
      } else {
        // Map recording_chunks fields onto Recording shape
        const mapped: Recording[] = (data ?? []).map((c: any) => ({
          id:               c.id,
          shift_id:         shiftId,
          employee_id:      employeeId,
          egress_id:        null,
          chunk_index:      c.chunk_index,
          storage_url:      c.storage_url ?? null,
          // Derive a status: treat pending/processing with no end time as 'recording'
          status:           (!c.ended_at && (c.processing_status === 'pending' || c.processing_status === 'processing'))
                              ? 'recording'
                              : 'completed',
          started_at:       c.started_at,
          ended_at:         c.ended_at ?? null,
          summary:          c.summary ?? null,
          processing_status: c.processing_status ?? null,
        }));
        setRecordings(mapped);
      }
    } else {
      // Existing behavior: fetch session-level recordings for this employee
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
              <Text style={[styles.summaryButtonText, { color: themeColors.subtext }]}>⏳ Pending...</Text>
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
        <ActivityIndicator size="large" color={themeColors.accent} />
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

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: themeColors.background,
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
    color: themeColors.text,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: themeColors.subtext,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  cardLive: {
    borderColor: '#EF4444',
    backgroundColor: '#1F0A0A',
  },
  cardFailed: {
    borderColor: themeColors.border,
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
    color: themeColors.text,
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
  statusFailed: { color: themeColors.subtext },
  statusDone:   { color: themeColors.statusOk },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  timeLabel: {
    fontSize: 12,
    color: themeColors.subtext,
  },
  timeValue: {
    fontSize: 12,
    color: themeColors.text,
    fontWeight: '500',
  },
  summaryButton: {
    marginTop: 10,
    backgroundColor: themeColors.card,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  summaryButtonReady: {
    backgroundColor: themeColors.elevatedCard,
    borderColor: themeColors.accent,
  },
  summaryButtonProcessing: {
    backgroundColor: '#1F1C0A',
    borderColor: '#F59E0B',
  },
  summaryButtonPending: {
    backgroundColor: themeColors.card,
    borderColor: themeColors.border,
    opacity: 0.65,
  },
  summaryButtonText: {
    color: themeColors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  openButton: {
    marginTop: 6,
    backgroundColor: themeColors.accent,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  openButtonText: {
    color: themeColors.textOnAccent,
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
    color: themeColors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: themeColors.subtext,
    textAlign: 'center',
    lineHeight: 20,
  },
});
