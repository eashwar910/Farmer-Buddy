import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { supabase } from '../services/supabase';
import { useAppContext } from '../context/AppContext';

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

interface Employee {
  id: string;
  name: string;
  email: string;
}

interface EmployeeWithRecordings {
  employee: Employee;
  recordings: Recording[];
}

interface ShiftReport {
  employee_id: string;
  report_url: string;
}

interface ShiftDetailsScreenProps {
  route: {
    params: {
      shiftId: string;
      shiftStartedAt: string;
      shiftStatus?: string;
    };
  };
  navigation: any;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'Ongoing';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const totalMins = Math.round(ms / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function SummaryContent({ summaryJson, themeColors }: { summaryJson: string; themeColors: any }) {
  const mStyles = getModalStyles(themeColors);
  let parsed: any = null;
  try {
    parsed = JSON.parse(summaryJson);
  } catch {
    return <Text style={mStyles.summaryText}>{summaryJson}</Text>;
  }

  return (
    <View>
      {parsed.executive_summary ? (
        <View style={mStyles.section}>
          <Text style={mStyles.sectionTitle}>📋 EXECUTIVE SUMMARY</Text>
          <Text style={mStyles.sectionBody}>{parsed.executive_summary}</Text>
        </View>
      ) : null}

      {parsed.overall_assessment ? (
        <View style={mStyles.section}>
          <Text style={mStyles.sectionTitle}>📊 OVERALL ASSESSMENT</Text>
          <Text style={mStyles.sectionBody}>{parsed.overall_assessment}</Text>
        </View>
      ) : null}

      {Array.isArray(parsed.timeline) && parsed.timeline.length > 0 ? (
        <View style={mStyles.section}>
          <Text style={mStyles.sectionTitle}>🕐 TIMELINE</Text>
          {parsed.timeline.map((t: any, i: number) => (
            <View key={i} style={mStyles.timelineRow}>
              <Text style={mStyles.timelineTime}>{t.time_estimate ?? t.frame_range ?? `${i + 1}`}</Text>
              <Text style={mStyles.timelineActivity}>{t.activity}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {Array.isArray(parsed.notable_events) && parsed.notable_events.length > 0 ? (
        <View style={mStyles.section}>
          <Text style={mStyles.sectionTitle}>⚡ NOTABLE EVENTS</Text>
          {parsed.notable_events.map((e: any, i: number) => (
            <Text key={i} style={mStyles.sectionBody}>• {e.description}{e.significance ? ` — ${e.significance}` : ''}</Text>
          ))}
        </View>
      ) : null}

      {parsed.safety_compliance ? (
        <View style={mStyles.section}>
          <Text style={mStyles.sectionTitle}>🛡️ SAFETY & COMPLIANCE</Text>
          {Array.isArray(parsed.safety_compliance.concerns) && parsed.safety_compliance.concerns.length > 0 && (
            <>
              <Text style={mStyles.subLabel}>Concerns:</Text>
              {parsed.safety_compliance.concerns.map((c: string, i: number) => (
                <Text key={i} style={[mStyles.sectionBody, { color: '#F87171' }]}>• {c}</Text>
              ))}
            </>
          )}
          {Array.isArray(parsed.safety_compliance.positive_observations) && parsed.safety_compliance.positive_observations.length > 0 && (
            <>
              <Text style={mStyles.subLabel}>Positive:</Text>
              {parsed.safety_compliance.positive_observations.map((p: string, i: number) => (
                <Text key={i} style={[mStyles.sectionBody, { color: '#4ADE80' }]}>• {p}</Text>
              ))}
            </>
          )}
        </View>
      ) : null}

      {parsed.note ? (
        <View style={[mStyles.section, { backgroundColor: themeColors.elevatedCard, borderRadius: 8, padding: 10 }]}>
          <Text style={[mStyles.sectionBody, { color: themeColors.subtext, fontStyle: 'italic' }]}>ℹ️ {parsed.note}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SummaryModal({
  visible,
  onClose,
  employeeName,
  recording,
  themeColors,
}: {
  visible: boolean;
  onClose: () => void;
  employeeName: string;
  recording: Recording | null;
  themeColors: any;
}) {
  const mStyles = getModalStyles(themeColors);
  if (!recording) return null;

  const isProcessing = recording.processing_status === 'processing';
  const isCompleted  = recording.processing_status === 'completed';
  const isFailed     = recording.processing_status === 'failed';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mStyles.overlay}>
        <View style={mStyles.sheet}>
          <View style={mStyles.handle} />
          <Text style={mStyles.title}>{employeeName}</Text>
          <Text style={mStyles.sub}>
            Recording — {formatTime(recording.started_at)}
            {recording.ended_at ? ` → ${formatTime(recording.ended_at)}` : ''}
          </Text>

          <ScrollView style={mStyles.body} showsVerticalScrollIndicator={false}>
            {isCompleted && recording.summary ? (
              <SummaryContent summaryJson={recording.summary} themeColors={themeColors} />
            ) : isProcessing ? (
              <View style={mStyles.stateBox}>
                <ActivityIndicator color="#F59E0B" />
                <Text style={mStyles.stateText}>AI is processing this recording…</Text>
              </View>
            ) : isFailed ? (
              <View style={mStyles.stateBox}>
                <Text style={mStyles.stateIcon}>❌</Text>
                <Text style={mStyles.stateText}>AI processing failed for this chunk.</Text>
              </View>
            ) : (
              <View style={mStyles.stateBox}>
                <Text style={mStyles.stateIcon}>⏳</Text>
                <Text style={mStyles.stateText}>
                  Summary will be generated automatically once the chunk is recorded.
                </Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={mStyles.closeBtn} onPress={onClose}>
            <Text style={mStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ShiftDetailsScreen({ route, navigation }: ShiftDetailsScreenProps) {
  const { shiftId, shiftStartedAt } = route.params;
  const { themeColors } = useAppContext();

  const [groups, setGroups]                   = useState<EmployeeWithRecordings[]>([]);
  const [shiftStatus, setShiftStatus]         = useState<string>('ended');
  const [loading, setLoading]                 = useState(true);
  const [refreshing, setRefreshing]           = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [selectedEmployee, setSelectedEmployee]   = useState<string>('');
  const [showModal, setShowModal]             = useState(false);
  const [shiftReports, setShiftReports]       = useState<ShiftReport[]>([]);
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);

  const styles = getStyles(themeColors);

  useEffect(() => {
    navigation.setOptions({ title: `Shift — ${formatDate(shiftStartedAt)}` });
    fetchData();

    const channel = supabase
      .channel(`shift-details-${shiftId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'recordings', filter: `shift_id=eq.${shiftId}` },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_reports', filter: `shift_id=eq.${shiftId}` },
        () => fetchShiftReports()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [shiftId]);

  const fetchShiftReports = useCallback(async () => {
    const { data } = await supabase
      .from('shift_reports')
      .select('employee_id, report_url')
      .eq('shift_id', shiftId);
    if (data) setShiftReports(data as ShiftReport[]);
  }, [shiftId]);

  const fetchData = useCallback(async () => {
    const [
      { data: recordings, error: recError },
      { data: employees, error: empError },
      { data: shiftData },
    ] = await Promise.all([
      supabase.from('recordings').select('*').eq('shift_id', shiftId).order('started_at', { ascending: true }),
      supabase.from('users').select('id, name, email').eq('role', 'employee'),
      supabase.from('shifts').select('status').eq('id', shiftId).single(),
    ]);

    if (recError) console.error('Failed to fetch recordings:', recError);
    if (empError) console.error('Failed to fetch employees:', empError);

    if (shiftData) setShiftStatus((shiftData as any).status ?? 'ended');

    if (recordings && employees) {
      const empMap: Record<string, Employee> = {};
      (employees as Employee[]).forEach((e) => { empMap[e.id] = e; });

      const groupMap: Record<string, Recording[]> = {};
      (recordings as Recording[]).forEach((r) => {
        if (!groupMap[r.employee_id]) groupMap[r.employee_id] = [];
        groupMap[r.employee_id].push(r);
      });

      const result: EmployeeWithRecordings[] = Object.entries(groupMap).map(
        ([empId, recs]) => ({
          employee: empMap[empId] ?? { id: empId, name: 'Unknown Employee', email: '' },
          recordings: recs,
        })
      );

      setGroups(result);
    }

    await fetchShiftReports();
    setLoading(false);
    setRefreshing(false);
  }, [shiftId, fetchShiftReports]);

  const handleGenerateReport = async (employeeId: string, employeeName: string) => {
    setGeneratingReport(employeeId);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        Alert.alert('Error', 'Session expired. Please sign in again.');
        return;
      }
      const accessToken = sessionData.session.access_token;
      const supabaseUrl = 'https://bkwrixhpykvcdpkvezsd.supabase.co';

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-shift-report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shiftId, employeeId }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Report generation failed: ${res.status} — ${errText}`);
      }

      const { reportUrl } = await res.json();
      await fetchShiftReports();

      Alert.alert(
        'Report Ready',
        `The report for ${employeeName} is ready.`,
        [
          { text: 'Open Report', onPress: () => Linking.openURL(reportUrl) },
          { text: 'OK' },
        ]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to generate report');
    } finally {
      setGeneratingReport(null);
    }
  };

  const handleViewSummary = (rec: Recording, empName: string) => {
    setSelectedRecording(rec);
    setSelectedEmployee(empName);
    setShowModal(true);
  };

  const renderRecording = (rec: Recording, index: number, empName: string) => {
    const isLive            = rec.status === 'recording';
    const isFailed          = rec.status === 'failed';
    const summaryReady      = rec.processing_status === 'completed';
    const summaryProcessing = rec.processing_status === 'processing';

    return (
      <View
        key={rec.id}
        style={[styles.recCard, isLive && styles.recCardActive, isFailed && styles.recCardFailed]}
      >
        <View style={styles.recHeader}>
          <Text style={styles.recLabel}>Session {index + 1}</Text>
          <View style={[styles.recBadge, isLive ? styles.badgeLive : isFailed ? styles.badgeFailed : styles.badgeDone]}>
            {isLive && <View style={styles.liveBlip} />}
            <Text style={[styles.recBadgeText, isLive ? styles.textLive : isFailed ? styles.textFailed : styles.textDone]}>
              {isLive ? 'RECORDING' : isFailed ? 'FAILED' : 'COMPLETED'}
            </Text>
          </View>
        </View>

        <View style={styles.recMeta}>
          <Text style={styles.recMetaItem}>🕐 {formatTime(rec.started_at)}</Text>
          {rec.ended_at && <Text style={styles.recMetaItem}>⏱ {formatDuration(rec.started_at, rec.ended_at)}</Text>}
        </View>

        {rec.status === 'completed' && (
          <>
            <TouchableOpacity
              style={[
                styles.summaryBtn,
                summaryReady && styles.summaryBtnReady,
                summaryProcessing && styles.summaryBtnProcessing,
                !summaryReady && !summaryProcessing && styles.summaryBtnPending,
              ]}
              onPress={() => summaryReady ? handleViewSummary(rec, empName) : undefined}
              disabled={!summaryReady}
            >
              {summaryProcessing ? (
                <>
                  <ActivityIndicator size="small" color="#F59E0B" />
                  <Text style={styles.summaryBtnText}>⏳ AI Processing…</Text>
                </>
              ) : summaryReady ? (
                <Text style={styles.summaryBtnText}>🤖 View AI Summary</Text>
              ) : (
                <Text style={[styles.summaryBtnText, { color: themeColors.subtext }]}>⏳ Pending…</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.chunksBtn}
              onPress={() => navigation.navigate('RecordingsList', {
                shiftId,
                employeeId: rec.employee_id,
                employeeName: empName,
                recordingId: rec.id,
              })}
            >
              <Text style={styles.chunksBtnText}>📂 View Chunks</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  const renderGroup = ({ item }: { item: EmployeeWithRecordings }) => {
    const existingReport  = shiftReports.find((r) => r.employee_id === item.employee.id);
    const isGenerating    = generatingReport === item.employee.id;
    const hasCompletedChunks = item.recordings.some(
      (r) => r.status === 'completed' && r.processing_status === 'completed'
    );
    const isShiftEnded = shiftStatus === 'ended';

    return (
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.employee.name?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupName}>{item.employee.name}</Text>
            <Text style={styles.groupSub}>
              {item.recordings.length} recording session{item.recordings.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {item.recordings.map((rec, i) => renderRecording(rec, i, item.employee.name))}

        {isShiftEnded && (
          <View style={styles.reportSection}>
            {existingReport ? (
              <TouchableOpacity
                style={styles.viewReportBtn}
                onPress={() => Linking.openURL(existingReport.report_url)}
              >
                <Text style={styles.viewReportBtnText}>📄 View Shift Report</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.generateReportBtn,
                  (!hasCompletedChunks || isGenerating) && styles.generateReportBtnDisabled,
                ]}
                onPress={() => hasCompletedChunks && !isGenerating
                  ? handleGenerateReport(item.employee.id, item.employee.name)
                  : undefined
                }
                disabled={!hasCompletedChunks || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <ActivityIndicator size="small" color={themeColors.text} />
                    <Text style={styles.generateReportBtnText}>Generating Report…</Text>
                  </>
                ) : (
                  <Text style={[
                    styles.generateReportBtnText,
                    !hasCompletedChunks && { color: themeColors.subtext },
                  ]}>
                    {hasCompletedChunks ? '📊 Generate Report' : '📊 No summaries yet'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {groups.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📼</Text>
          <Text style={styles.emptyTitle}>No Recordings</Text>
          <Text style={styles.emptySub}>
            No recordings were captured during this shift.
          </Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.employee.id}
          renderItem={renderGroup}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchData(); }}
              tintColor={themeColors.accent}
              colors={[themeColors.accent]}
            />
          }
        />
      )}

      <SummaryModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        employeeName={selectedEmployee}
        recording={selectedRecording}
        themeColors={themeColors}
      />
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: themeColors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  groupCard: {
    backgroundColor: themeColors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: themeColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: themeColors.text, fontSize: 18, fontWeight: '700' },
  groupName: { fontSize: 16, fontWeight: '700', color: themeColors.text },
  groupSub: { fontSize: 12, color: themeColors.subtext, marginTop: 2 },
  recCard: {
    backgroundColor: themeColors.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  recCardActive: { borderColor: '#EF4444', backgroundColor: '#1F0A0A' },
  recCardFailed: { opacity: 0.6 },
  recHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recLabel: { fontSize: 13, fontWeight: '700', color: themeColors.text },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  badgeLive: { backgroundColor: 'rgba(239,68,68,0.2)' },
  badgeFailed: { backgroundColor: 'rgba(71,85,105,0.3)' },
  badgeDone: { backgroundColor: 'rgba(34,197,94,0.15)' },
  liveBlip: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  recBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  textLive: { color: '#EF4444' },
  textFailed: { color: themeColors.subtext },
  textDone: { color: '#22C55E' },
  recMeta: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  recMetaItem: { fontSize: 12, color: themeColors.subtext },
  summaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    padding: 9,
  },
  summaryBtnReady: { backgroundColor: '#1C2A18', borderColor: themeColors.accent },
  summaryBtnProcessing: { backgroundColor: '#1F1C0A', borderColor: '#F59E0B' },
  summaryBtnPending: { backgroundColor: themeColors.card, borderColor: themeColors.border },
  summaryBtnText: { color: themeColors.text, fontWeight: '600', fontSize: 12 },
  chunksBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 8,
    padding: 9,
  },
  chunksBtnText: { color: themeColors.subtext, fontWeight: '600', fontSize: 12 },
  reportSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    paddingTop: 12,
  },
  generateReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1C2A18',
    borderWidth: 1,
    borderColor: themeColors.accent,
    borderRadius: 10,
    padding: 12,
  },
  generateReportBtnDisabled: {
    backgroundColor: themeColors.card,
    borderColor: themeColors.border,
  },
  generateReportBtnText: {
    color: themeColors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  viewReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: themeColors.accent,
    borderWidth: 1,
    borderColor: themeColors.accent,
    borderRadius: 10,
    padding: 12,
  },
  viewReportBtnText: {
    color: themeColors.textOnAccent,
    fontWeight: '700',
    fontSize: 13,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: themeColors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: themeColors.subtext, textAlign: 'center', lineHeight: 21 },
});

const getModalStyles = (themeColors: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: themeColors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  handle: {
    width: 40, height: 4, backgroundColor: themeColors.border, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: themeColors.text, marginBottom: 4 },
  sub: { fontSize: 13, color: themeColors.subtext, marginBottom: 16 },
  body: { maxHeight: 360 },
  summaryText: { color: themeColors.text, fontSize: 14, lineHeight: 22 },
  stateBox: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  stateIcon: { fontSize: 36 },
  stateText: { color: themeColors.subtext, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  closeBtn: {
    marginTop: 16, backgroundColor: themeColors.border, borderRadius: 10, padding: 14, alignItems: 'center',
  },
  closeBtnText: { color: themeColors.text, fontWeight: '600', fontSize: 14 },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: themeColors.subtext,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  sectionBody: { fontSize: 14, color: themeColors.text, lineHeight: 21, marginBottom: 4 },
  subLabel: { fontSize: 12, fontWeight: '600', color: themeColors.subtext, marginTop: 6, marginBottom: 3 },
  timelineRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  timelineTime: { fontSize: 12, color: themeColors.emphasis, fontWeight: '600', minWidth: 60 },
  timelineActivity: { flex: 1, fontSize: 13, color: themeColors.text, lineHeight: 19 },
});
