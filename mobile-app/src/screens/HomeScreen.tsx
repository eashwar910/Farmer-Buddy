import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import WeatherWidget from '../components/WeatherWidget';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 2-column grid: screen minus 32px padding minus 12px gap between buttons
const BUTTON_SIZE = Math.floor((SCREEN_WIDTH - 32 - 12) / 2);

export default function HomeScreen({ navigation }: any) {
  const { profile } = useAuth();
  const { themeColors, t } = useAppContext();
  const [stats, setStats] = useState({ sensorCount: 0, lastScan: '' });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const sensorsStr = await AsyncStorage.getItem('iot_sensors');
      const sensors = sensorsStr ? JSON.parse(sensorsStr) : [];
      const scanDate = await AsyncStorage.getItem('last_leaf_scan_date');
      setStats({ sensorCount: sensors.length, lastScan: scanDate || '' });
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

  const handleBodycamPress = () => {
    if (profile?.role === 'gardener') return; // gardeners have no bodycam access
    if (profile?.role) {
      navigation.navigate(profile.role === 'manager' ? 'ManagerTabs' : 'EmployeeTabs');
      return;
    }
  };

  const handleLeafDetectionPress = () => navigation.navigate('LeafDetection');
  const handleIoTPress = () => navigation.navigate('IoTSensorScreen');
  const handleAgronomistChatPress = () => navigation.navigate('AgronomistChat');

  const styles = getStyles(themeColors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}{profile?.name ? `, ${profile.name}` : ''}</Text>
            <Text style={styles.subtitle}>{t('subtitle')}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('SettingsScreen')} style={styles.settingsIcon}>
            <MaterialCommunityIcons name="cog-outline" size={28} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {/* Weather Widget */}
        <WeatherWidget />

        {/* Feature Grid */}
        <View style={styles.gridContainer}>
          {/* Top row: Bodycam (hidden for gardeners) + Leaf Detection */}
          <View style={profile?.role === 'gardener' ? styles.gridRowCentered : styles.gridRow}>
            {profile?.role !== 'gardener' && (
              <TouchableOpacity onPress={handleBodycamPress} activeOpacity={0.8}>
                <LinearGradient colors={['#374151', '#111827']} style={[styles.gridButton, { width: BUTTON_SIZE, height: BUTTON_SIZE }]}>
                  <View style={styles.gridIconCircle}>
                    <MaterialCommunityIcons name="video-outline" size={30} color="#fff" />
                  </View>
                  <Text style={styles.gridLabel}>{t('bodycam')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={handleLeafDetectionPress} activeOpacity={0.8}>
              <LinearGradient colors={['#065f46', '#022c22']} style={[styles.gridButton, { width: BUTTON_SIZE, height: BUTTON_SIZE }]}>
                <View style={styles.gridIconCircle}>
                  <MaterialCommunityIcons name="leaf" size={30} color="#4ade80" />
                </View>
                <Text style={styles.gridLabel}>{t('leafDisease')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Bottom centered: IoT Sensor + Agronomist Chat */}
          <View style={styles.gridRow}>
            <TouchableOpacity onPress={handleIoTPress} activeOpacity={0.8}>
              <LinearGradient colors={['#1e40af', '#172554']} style={[styles.gridButton, { width: BUTTON_SIZE, height: BUTTON_SIZE }]}>
                <View style={styles.gridIconCircle}>
                  <MaterialCommunityIcons name="signal-variant" size={30} color="#60a5fa" />
                </View>
                <Text style={styles.gridLabel}>{t('sensorAnalysis')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleAgronomistChatPress} activeOpacity={0.8}>
              <LinearGradient colors={['#9333ea', '#4c1d95']} style={[styles.gridButton, { width: BUTTON_SIZE, height: BUTTON_SIZE }]}>
                <View style={styles.gridIconCircle}>
                  <MaterialCommunityIcons name="robot-outline" size={30} color="#c084fc" />
                </View>
                <Text style={styles.gridLabel}>{t('agronomistChat') || 'Agronomist Chat'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.quickStatsRow}>
          <Text style={styles.quickStatsText}>
            {stats.sensorCount > 0 ? `${stats.sensorCount} sensors active` : 'No data yet'}
          </Text>
          <Text style={styles.quickStatsDot}>•</Text>
          <Text style={styles.quickStatsText}>
            {stats.lastScan ? `Last scan: ${stats.lastScan}` : 'No data yet'}
          </Text>
        </View>


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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: themeColors.subtext,
  },
  settingsIcon: {
    padding: 8,
  },
  gridContainer: {
    gap: 12,
    marginBottom: 24,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gridRowCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  // kept for backward-compat but grid now uses gridRow for all rows
  gridButton: {
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  gridIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  quickStatsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    gap: 8,
    marginTop: 8,
  },
  quickStatsText: {
    fontSize: 12,
    color: themeColors.subtext,
  },
  quickStatsDot: {
    fontSize: 12,
    color: themeColors.subtext,
  },
});
