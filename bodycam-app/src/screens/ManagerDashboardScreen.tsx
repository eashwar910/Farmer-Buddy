import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { useShift } from '../hooks/useShift';
import { usePresence } from '../hooks/usePresence';
import { supabase } from '../services/supabase';
import { UserProfile } from '../types';
import ManagerLiveGrid from '../components/ManagerLiveGrid';
import { RootStackParamList } from '../navigation/types';

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface RecordingSummary {
  employee_id: string;
  count: number;
  summaryCount: number;
}

export default function ManagerDashboardScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile, signOut } = useAuth();
  const { activeShift, startShift, endShift, elapsedSeconds, loading: shiftLoading } = useShift();
  const { isUserOnline } = usePresence(profile?.id, profile?.name, profile?.role);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [recordingSummaries, setRecordingSummaries] = useState<RecordingSummary[]>([]);
  const actionLockRef = useRef(false);

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Subscribe to recordings table when a shift is active
  useEffect(() => {
    if (!activeShift) {
      setRecordingSummaries([]);
      return;
    }

    fetchRecordingSummaries(activeShift.id);

    const channel = supabase
      .channel(`recordings-shift-${activeShift.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recordings',
          filter: `shift_id=eq.${activeShift.id}`,
        },
        () => fetchRecordingSummaries(activeShift.id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeShift?.id]);

  const fetchRecordingSummaries = async (shiftId: string) => {
    const { data } = await supabase
      .from('recordings')
      .select('employee_id, processing_status')
      .eq('shift_id', shiftId);

    if (data) {
      const counts: Record<string, { count: number; summaryCount: number }> = {};
      data.forEach((r: { employee_id: string; processing_status: string | null }) => {
        if (!counts[r.employee_id]) counts[r.employee_id] = { count: 0, summaryCount: 0 };
        counts[r.employee_id].count += 1;
        if (r.processing_status === 'completed') counts[r.employee_id].summaryCount += 1;
      });
      setRecordingSummaries(
        Object.entries(counts).map(([employee_id, { count, summaryCount }]) => ({ employee_id, count, summaryCount }))
      );
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchEmployees();
    setRefreshing(false);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'employee')
      .order('name');

    if (data) {
      setEmployees(data as UserProfile[]);
    }
  };

  const handleStartShift = async () => {
    if (actionLockRef.current || !profile) return;
    actionLockRef.current = true;
    setActionLoading(true);

    const { error } = await startShift(profile.id);

    setActionLoading(false);
    actionLockRef.current = false;

    if (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleEndShift = async () => {
    if (actionLockRef.current) return;

    Alert.alert(
      'End Shift',
      'Are you sure you want to end the current shift? All employees will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Shift',
          style: 'destructive',
          onPress: async () => {
            actionLockRef.current = true;
            setActionLoading(true);

            const shiftIdSnapshot = activeShift?.id;
            const { error } = await endShift();

            setActionLoading(false);
            actionLockRef.current = false;

            if (error) {
              Alert.alert('Error', error.message);
            } else if (shiftIdSnapshot) {
              // Fire-and-forget: trigger report generation for each employee
              triggerReportsForShift(shiftIdSnapshot);
            }
          },
        },
      ]
    );
  };

  const triggerReportsForShift = async (shiftId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) return;

      // Find all employees with completed recordings for this shift
      const { data: recs } = await supabase
        .from('recordings')
        .select('employee_id')
        .eq('shift_id', shiftId)
        .eq('processing_status', 'completed');

      if (!recs || recs.length === 0) return;

      const uniqueEmployeeIds = [...new Set((recs as { employee_id: string }[]).map((r) => r.employee_id))];
      const supabaseUrl = 'https://bkwrixhpykvcdpkvezsd.supabase.co';

      for (const employeeId of uniqueEmployeeIds) {
        fetch(`${supabaseUrl}/functions/v1/generate-shift-report`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ shiftId, employeeId }),
        }).then((res) => {
          if (res.ok) {
            console.log(`Report triggered for employee: ${employeeId}`);
          } else {
            res.text().then((t) => console.warn(`Report failed for ${employeeId}:`, t));
          }
        }).catch((err) => {
          console.warn('Report trigger error (non-critical):', err);
        });
      }
    } catch (err) {
      console.warn('triggerReportsForShift error (non-critical):', err);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const onlineCount = employees.filter((e) => isUserOnline(e.id)).length;

  const renderEmployee = ({ item }: { item: UserProfile }) => {
    const online = isUserOnline(item.id);
    return (
      <View style={styles.employeeCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeName}>{item.name}</Text>
          <Text style={styles.employeeEmail}>{item.email}</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, online ? styles.statusDotOnline : styles.statusDotOffline]} />
          <Text style={[styles.statusLabel, online ? styles.statusLabelOnline : styles.statusLabelOffline]}>
            {online ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#3B82F6"
          colors={['#3B82F6']}
        />
      }
    >
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{profile?.name || 'Manager'}</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Shift Control Card */}
      <View style={[styles.shiftCard, activeShift ? styles.shiftCardActive : null]}>
        {activeShift ? (
          <>
            <View style={styles.shiftHeader}>
              <View style={styles.shiftLiveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>SHIFT ACTIVE</Text>
              </View>
              <Text style={styles.shiftTimer}>{formatTime(elapsedSeconds)}</Text>
            </View>
            <TouchableOpacity
              style={[styles.shiftButton, styles.endShiftButton, actionLoading && styles.buttonDisabled]}
              onPress={handleEndShift}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.shiftButtonText}>End Shift</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.shiftHeader}>
              <Text style={styles.shiftIdleText}>No active shift</Text>
            </View>
            <TouchableOpacity
              style={[styles.shiftButton, styles.startShiftButton, actionLoading && styles.buttonDisabled]}
              onPress={handleStartShift}
              disabled={actionLoading || shiftLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.shiftButtonText}>Start Shift</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Live Video Grid (only during active shift) */}
      {activeShift && (
        <View style={styles.liveGridSection}>
          <Text style={styles.sectionTitle}>Live Feeds</Text>
          <ManagerLiveGrid shiftId={activeShift.id} />
        </View>
      )}

      {/* Recordings section (visible during active shift) */}
      {activeShift && recordingSummaries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📼 Recordings</Text>
          {employees
            .filter((e) => recordingSummaries.find((r) => r.employee_id === e.id))
            .map((emp) => {
              const rec = recordingSummaries.find((r) => r.employee_id === emp.id);
              const count = rec?.count ?? 0;
              const summaryCount = rec?.summaryCount ?? 0;
              return (
                <TouchableOpacity
                  key={emp.id}
                  style={styles.recordingCard}
                  onPress={() =>
                    navigation.navigate('RecordingsList', {
                      shiftId: activeShift.id,
                      employeeId: emp.id,
                      employeeName: emp.name,
                    })
                  }
                >
                  <View style={styles.recordingInfo}>
                    <Text style={styles.recordingName}>{emp.name}</Text>
                    <Text style={styles.recordingCount}>
                      {count} recording{count !== 1 ? 's' : ''}
                      {summaryCount > 0 ? ` · ${summaryCount} AI ${summaryCount !== 1 ? 'summaries' : 'summary'} ready` : ''}
                    </Text>
                  </View>
                  <Text style={styles.recordingArrow}>›</Text>
                </TouchableOpacity>
              );
            })}
        </View>
      )}

      {/* Employee List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Employees ({employees.length}) — {onlineCount} online
        </Text>
        {employees.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No employees yet</Text>
            <Text style={styles.emptySubtext}>
              Employees will appear here once their accounts are created and assigned the employee role.
            </Text>
          </View>
        ) : (
          employees.map((item) => {
            const online = isUserOnline(item.id);
            return (
              <View key={item.id} style={styles.employeeCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name?.charAt(0)?.toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.employeeInfo}>
                  <Text style={styles.employeeName}>{item.name}</Text>
                  <Text style={styles.employeeEmail}>{item.email}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <View style={[styles.statusDot, online ? styles.statusDotOnline : styles.statusDotOffline]} />
                  <Text style={[styles.statusLabel, online ? styles.statusLabelOnline : styles.statusLabelOffline]}>
                    {online ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: '#94A3B8',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  signOutBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  // Shift Card
  shiftCard: {
    backgroundColor: '#1E293B',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  shiftCardActive: {
    borderColor: '#22C55E',
    backgroundColor: '#0D2818',
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  shiftLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 1,
  },
  shiftTimer: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
    fontVariant: ['tabular-nums'],
  },
  shiftIdleText: {
    fontSize: 16,
    color: '#64748B',
  },
  shiftButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  startShiftButton: {
    backgroundColor: '#22C55E',
  },
  endShiftButton: {
    backgroundColor: '#EF4444',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  shiftButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Live Grid
  liveGridSection: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  // Recording cards
  recordingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  recordingCount: {
    fontSize: 12,
    color: '#22C55E',
    marginTop: 2,
  },
  recordingArrow: {
    fontSize: 22,
    color: '#64748B',
  },
  // Employee List
  section: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  list: {
    paddingBottom: 20,
  },
  employeeCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  employeeEmail: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusDotOnline: {
    backgroundColor: '#22C55E',
  },
  statusDotOffline: {
    backgroundColor: '#475569',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusLabelOnline: {
    color: '#22C55E',
  },
  statusLabelOffline: {
    color: '#64748B',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});
