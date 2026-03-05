import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';
import { RootStackParamList } from '../navigation/types';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface Shift {
  id: string;
  status: 'active' | 'ended';
  started_at: string;
  ended_at: string | null;
  manager_id: string;
}

interface ShiftWithCounts extends Shift {
  recording_count: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
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

export default function ShiftsScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();
  const [shifts, setShifts] = useState<ShiftWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchShifts = useCallback(async () => {
    if (!profile) return;

    const { data: shiftData, error } = await supabase
      .from('shifts')
      .select('*')
      .order('started_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch shifts:', error);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Fetch recording counts per shift
    const { data: recData } = await supabase
      .from('recordings')
      .select('shift_id');

    const counts: Record<string, number> = {};
    if (recData) {
      recData.forEach((r: { shift_id: string }) => {
        counts[r.shift_id] = (counts[r.shift_id] ?? 0) + 1;
      });
    }

    const combined: ShiftWithCounts[] = (shiftData ?? []).map((s: Shift) => ({
      ...s,
      recording_count: counts[s.id] ?? 0,
    }));

    setShifts(combined);
    setLoading(false);
    setRefreshing(false);
  }, [profile]);

  useEffect(() => {
    fetchShifts();

    // Subscribe to realtime shift changes
    const channel = supabase
      .channel('shifts-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => fetchShifts()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchShifts]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchShifts();
  };

  const renderShift = ({ item }: { item: ShiftWithCounts }) => {
    const isActive = item.status === 'active';
    return (
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardActive]}
        onPress={() =>
          navigation.navigate('ShiftDetails', {
            shiftId: item.id,
            shiftStartedAt: item.started_at,
          })
        }
        activeOpacity={0.75}
      >
        <View style={styles.cardTop}>
          <View style={styles.dateBlock}>
            <Text style={styles.dateText}>{formatDate(item.started_at)}</Text>
            <Text style={styles.timeText}>
              {formatTime(item.started_at)}
              {item.ended_at ? ` – ${formatTime(item.ended_at)}` : ''}
            </Text>
          </View>
          <View style={[styles.badge, isActive ? styles.badgeActive : styles.badgeEnded]}>
            {isActive && <View style={styles.liveDot} />}
            <Text style={[styles.badgeText, isActive ? styles.badgeTextActive : styles.badgeTextEnded]}>
              {isActive ? 'ACTIVE' : 'ENDED'}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatDuration(item.started_at, item.ended_at)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.recording_count}</Text>
            <Text style={styles.statLabel}>Recording{item.recording_count !== 1 ? 's' : ''}</Text>
          </View>
        </View>

        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shifts</Text>
        <Text style={styles.headerSub}>{shifts.length} shift{shifts.length !== 1 ? 's' : ''} total</Text>
      </View>

      {shifts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Shifts Yet</Text>
          <Text style={styles.emptySub}>
            Shifts will appear here once you start one from the Dashboard.
          </Text>
        </View>
      ) : (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id}
          renderItem={renderShift}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3B82F6"
              colors={['#3B82F6']}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSub: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardActive: {
    borderColor: '#22C55E',
    backgroundColor: '#0D2818',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  dateBlock: {
    flex: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  timeText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  badgeActive: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  badgeEnded: {
    backgroundColor: 'rgba(100,116,139,0.2)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeTextActive: { color: '#22C55E' },
  badgeTextEnded: { color: '#64748B' },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: '#334155',
  },
  arrow: {
    position: 'absolute',
    right: 16,
    top: '50%',
    fontSize: 26,
    color: '#334155',
    marginTop: -4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
  },
});
