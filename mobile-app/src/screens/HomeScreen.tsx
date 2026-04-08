import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WeatherWidget from '../components/WeatherWidget';

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TILE_HEIGHT = 148;

export default function HomeScreen({ navigation }: any) {
  const { profile } = useAuth();
  const { themeColors, t } = useAppContext();
  const [stats, setStats] = useState({
    sensorCount: 0,
    lastScan: '',
    farmHealth: null as number | null,
    irrigationTime: null as string | null, // 24h 'HH:MM', null = not set
  });
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isLive = false; // placeholder — wire to streaming state when available

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  // Pulsing dot animation for live Bodycam state
  useEffect(() => {
    if (!isLive) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isLive]);

  const loadStats = async () => {
    try {
      const sensorsStr     = await AsyncStorage.getItem('iot_sensors');
      const sensors        = sensorsStr ? JSON.parse(sensorsStr) : [];
      const scanDate       = await AsyncStorage.getItem('last_leaf_scan_date');
      const healthStr      = await AsyncStorage.getItem('farm_health_score');
      const scheduleStr    = await AsyncStorage.getItem('irrigation_schedule');
      const farmHealth     = healthStr   ? parseInt(healthStr, 10) : null;
      const irrigationTime = scheduleStr ? (JSON.parse(scheduleStr).time ?? null) : null;
      setStats({ sensorCount: sensors.length, lastScan: scanDate || '', farmHealth, irrigationTime });
    } catch (e) {
      console.error(e);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 18) return t('goodAfternoon');
    return t('goodEvening');
  };

  const getDateString = () => {
    const now = new Date();
    return `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
  };

  const handleBodycamPress = () => {
    if (profile?.role === 'gardener') return;
    if (profile?.role) {
      navigation.navigate(profile.role === 'manager' ? 'ManagerTabs' : 'EmployeeTabs');
      return;
    }
  };

  const handleLeafDetectionPress  = () => navigation.navigate('LeafDetection');
  const handleIoTPress             = () => navigation.navigate('IoTSensorScreen');
  const handleAgronomistChatPress  = () => navigation.navigate('AgronomistChat');
  const handleIrrigationPress      = () => navigation.navigate('IrrigationTimer');

  const format12h = (time24: string): string => {
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const styles     = getStyles(themeColors);
  const isGardener = profile?.role === 'gardener';

  const farmHealth = stats.farmHealth;
  const healthScore = farmHealth !== null ? `${farmHealth}%` : '--%';
  const healthLabel = farmHealth === null ? 'No data'
    : farmHealth >= 75 ? 'Good'
    : farmHealth >= 50 ? 'Fair'
    : farmHealth >= 25 ? 'Low'
    : 'Poor';

  // Dynamic donut arc using border-color trick (4 quarter-buckets)
  const ringColor = '#4A7838';
  const ringEmpty = themeColors.elevatedCard;
  const donutBorders = farmHealth === null
    ? { borderTopColor: ringEmpty, borderRightColor: ringEmpty, borderBottomColor: ringEmpty, borderLeftColor: ringEmpty }
    : farmHealth >= 75
    ? { borderTopColor: ringColor, borderRightColor: ringColor, borderBottomColor: ringColor, borderLeftColor: ringColor }
    : farmHealth >= 50
    ? { borderTopColor: ringColor, borderRightColor: ringColor, borderBottomColor: ringColor, borderLeftColor: ringEmpty }
    : farmHealth >= 25
    ? { borderTopColor: ringColor, borderRightColor: ringColor, borderBottomColor: ringEmpty, borderLeftColor: ringEmpty }
    : { borderTopColor: ringColor, borderRightColor: ringEmpty, borderBottomColor: ringEmpty, borderLeftColor: ringEmpty };

  const statusLine = [
    stats.sensorCount > 0 ? `${stats.sensorCount} sensors active` : 'No sensors',
    stats.lastScan ? `Last scan: ${stats.lastScan}` : 'No scan data',
  ].join(' · ');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>
              {getGreeting()}{profile?.name ? `, ${profile.name}` : ''}
            </Text>
            <Text style={styles.dateSubtitle}>{getDateString()}</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('SettingsScreen')}
            style={styles.settingsIcon}
          >
            <MaterialCommunityIcons name="cog-outline" size={22} color={themeColors.emphasis} />
          </TouchableOpacity>
        </View>

        {/* ── Weather strip ───────────────────────────────────── */}
        <WeatherWidget />

        {/* ── Section label ───────────────────────────────────── */}
        <Text style={styles.sectionLabel}>QUICK ACCESS</Text>

        {/* ── Feature grid ────────────────────────────────────── */}
        <View style={styles.gridContainer}>

          {/* Row 1: Bodycam (wide 2/3) + Leaf Detection (narrow 1/3)
              Gardeners skip Bodycam — Leaf fills the full row       */}
          <View style={styles.gridRow}>
            {!isGardener && (
              <TouchableOpacity
                style={{ flex: 1.95 }}
                onPress={handleBodycamPress}
                activeOpacity={0.75}
              >
                <View style={styles.tileCard}>
                  <View style={styles.tileTopRow}>
                    <MaterialCommunityIcons
                      name="video-outline"
                      size={20}
                      color={themeColors.emphasis}
                    />
                    {isLive && (
                      <View style={styles.liveBadge}>
                        <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                        <Text style={styles.liveText}>Live</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.tileLabel}>{t('bodycam').toUpperCase()}</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{ flex: isGardener ? 1 : 1.05 }}
              onPress={handleLeafDetectionPress}
              activeOpacity={0.75}
            >
              <View style={styles.tileCard}>
                <MaterialCommunityIcons name="leaf" size={20} color={themeColors.emphasis} />
                <Text style={styles.tileLabel}>{t('leafDisease').toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Row 2: IoT Sensor (narrow 1/3) + Agronomist Chat (wide 2/3) */}
          <View style={styles.gridRow}>
            <TouchableOpacity
              style={{ flex: 1.05 }}
              onPress={handleIoTPress}
              activeOpacity={0.75}
            >
              <View style={styles.tileCard}>
                <MaterialCommunityIcons name="signal-variant" size={20} color={themeColors.emphasis} />
                <Text style={styles.tileLabel}>{t('sensorAnalysis').toUpperCase()}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ flex: 1.95 }}
              onPress={handleAgronomistChatPress}
              activeOpacity={0.75}
            >
              <View style={styles.tileCard}>
                <MaterialCommunityIcons name="robot-outline" size={20} color={themeColors.emphasis} />
                <Text style={styles.tileLabel}>
                  {(t('agronomistChat') || 'Agronomist Chat').toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

        </View>

        {/* ── Farm insights ───────────────────────────────────── */}
        <View style={styles.insightsRow}>

          {/* Farm Health — donut chart (live from last Gemini analysis) */}
          <View style={styles.insightCard}>
            <View style={styles.donutWrap}>
              <View style={[styles.donutRing, donutBorders]} />
              <View style={styles.donutHole}>
                <Text style={styles.donutValue}>{healthScore}</Text>
              </View>
            </View>
            <Text style={styles.insightLabel}>FARM HEALTH</Text>
            <Text style={styles.insightSub}>{healthLabel}</Text>
          </View>

          {/* Irrigation Timer — taps into IrrigationTimerScreen */}
          <TouchableOpacity style={styles.insightCard} onPress={handleIrrigationPress} activeOpacity={0.75}>
            <MaterialCommunityIcons
              name="timer-outline"
              size={38}
              color={themeColors.emphasis}
              style={styles.insightIcon}
            />
            <Text style={styles.insightLabel}>IRRIGATION</Text>
            <Text style={styles.insightSub}>
              {stats.irrigationTime ? `Next: ${format12h(stats.irrigationTime)}` : 'Tap to set'}
            </Text>
          </TouchableOpacity>

        </View>

        {/* ── Status line ─────────────────────────────────────── */}
        <Text style={styles.statusText}>{statusLine}</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.heading,
    marginBottom: 3,
    fontFamily: 'CabinetGrotesk-Bold',
  },
  dateSubtitle: {
    fontSize: 13,
    color: themeColors.subtext,
    fontFamily: 'Satoshi-Regular',
  },
  settingsIcon: {
    padding: 8,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    color: themeColors.faint,
    letterSpacing: 1.4,
    marginBottom: 12,
    marginTop: 2,
    fontFamily: 'Satoshi-Regular',
  },

  // Grid
  gridContainer: {
    gap: 10,
    marginBottom: 20,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
  },

  // Tile card
  tileCard: {
    backgroundColor: themeColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    padding: 20,
    height: TILE_HEIGHT,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  tileTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: themeColors.tileLabel,
    letterSpacing: 1.0,
    fontFamily: 'CabinetGrotesk-Medium',
  },

  // Live indicator
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#60A048',
  },
  liveText: {
    fontSize: 11,
    color: '#60A048',
    fontWeight: '600',
    fontFamily: 'Satoshi-Regular',
  },

  // Status line
  statusText: {
    fontSize: 12,
    color: themeColors.subtext,
    paddingTop: 12,
    fontFamily: 'Satoshi-Regular',
  },

  // Farm insights row
  insightsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 16,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  insightCard: {
    flex: 1,
    backgroundColor: themeColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  insightIcon: {
    marginBottom: 10,
  },
  insightLabel: {
    fontSize: 10,
    color: themeColors.faint,
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 3,
    fontFamily: 'Satoshi-Regular',
  },
  insightSub: {
    fontSize: 13,
    color: themeColors.subtext,
    fontFamily: 'Satoshi-Regular',
  },

  // Donut chart (farm health)
  donutWrap: {
    width: 64,
    height: 64,
    position: 'relative',
  },
  donutRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 7,
    // Border colors are applied dynamically via donutBorders spread in JSX
    // rotate(45deg) aligns the fill start to 12 o'clock
    transform: [{ rotate: '45deg' }],
  },
  donutHole: {
    position: 'absolute',
    top: 11,
    left: 11,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: themeColors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutValue: {
    fontSize: 13,
    fontWeight: '700',
    color: themeColors.text,
    fontFamily: 'CabinetGrotesk-Bold',
  },
});
