import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import { RootStackParamList } from '../navigation/types';
import { formatDuration } from '../utils/format';

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

export default function ShiftsScreen() {
  const navigation = useNavigation<NavProp>();
  const { profile } = useAuth();
  const { themeColors } = useAppContext();
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

  const styles = getStyles(themeColors);

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
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
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
              tintColor={themeColors.accent}
              colors={[themeColors.accent]}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

function getStyles(themeColors: any) { return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors.background,
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
    borderBottomColor: themeColors.border,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: themeColors.heading,
    fontFamily: 'CabinetGrotesk-Bold',
  },
  headerSub: {
    fontSize: 13,
    color: themeColors.subtext,
    marginTop: 2,
    fontFamily: 'Satoshi-Regular',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: themeColors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  cardActive: {
    borderColor: themeColors.statusOk,
    backgroundColor: themeColors.elevatedCard,
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
    color: themeColors.text,
    marginBottom: 2,
    fontFamily: 'CabinetGrotesk-Bold',
  },
  timeText: {
    fontSize: 13,
    color: themeColors.subtext,
    fontFamily: 'Satoshi-Regular',
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
    backgroundColor: themeColors.statusOk + '26', // ~15% opacity
  },
  badgeEnded: {
    backgroundColor: themeColors.faint + '33', // ~20% opacity
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: themeColors.statusOk,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: 'Satoshi-Regular',
  },
  badgeTextActive: { color: themeColors.statusOk },
  badgeTextEnded: { color: themeColors.faint },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.background,
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
    color: themeColors.text,
    fontFamily: 'CabinetGrotesk-Bold',
  },
  statLabel: {
    fontSize: 11,
    color: themeColors.subtext,
    marginTop: 2,
    fontFamily: 'Satoshi-Regular',
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: themeColors.border,
  },
  arrow: {
    position: 'absolute',
    right: 16,
    top: '50%',
    fontSize: 26,
    color: themeColors.border,
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
    color: themeColors.heading,
    marginBottom: 8,
    fontFamily: 'CabinetGrotesk-Bold',
  },
  emptySub: {
    fontSize: 14,
    color: themeColors.subtext,
    textAlign: 'center',
    lineHeight: 21,
    fontFamily: 'Satoshi-Regular',
  },
}); }
