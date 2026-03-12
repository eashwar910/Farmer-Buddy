import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../services/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HomeScreen({ navigation }: any) {
  const { profile, user, refreshProfile } = useAuth();
  const { themeColors, t } = useAppContext();
  const [updatingRole, setUpdatingRole] = useState(false);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [weatherData, setWeatherData] = useState<{ temp: number; emoji: string } | null>(null);
  const [stats, setStats] = useState({ sensorCount: 0, lastScan: '' });

  useEffect(() => {
    loadLocationAndWeather();
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const sensorsStr = await AsyncStorage.getItem('iot_sensors');
      const sensors = sensorsStr ? JSON.parse(sensorsStr) : [];
      const scanDate = await AsyncStorage.getItem('last_leaf_scan_date');
      setStats({
        sensorCount: sensors.length,
        lastScan: scanDate || ''
      });
    } catch (e) {
      console.error(e);
    }
  };

  const loadLocationAndWeather = async () => {
    try {
      // 1. Check permissions & Get Location
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({});
      const geocode = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      });

      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        const city = place.city || place.subregion || place.region || 'Unknown';
        setLocationName(city);
        await AsyncStorage.setItem('user_location', city);
      }

      // 2. Weather with cache
      const cachedWeatherStr = await AsyncStorage.getItem('weather_cache');
      if (cachedWeatherStr) {
        const cachedWeather = JSON.parse(cachedWeatherStr);
        if (Date.now() - cachedWeather.timestamp < 30 * 60 * 1000) {
          setWeatherData({ temp: cachedWeather.temp, emoji: cachedWeather.emoji });
          return;
        }
      }

      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.coords.latitude}&longitude=${loc.coords.longitude}&current_weather=true`);
      if (res.ok) {
        const data = await res.json();
        const temp = Math.round(data.current_weather.temperature);
        const code = data.current_weather.weathercode;
        // Simple mapping
        let emoji = '🌤️';
        if (code <= 3) emoji = '☀️';
        else if (code <= 48) emoji = '☁️';
        else if (code <= 67) emoji = '🌧️';
        else if (code <= 77) emoji = '❄️';
        else if (code <= 82) emoji = '🌧️';
        else if (code <= 99) emoji = '⛈️';

        setWeatherData({ temp, emoji });
        await AsyncStorage.setItem('weather_cache', JSON.stringify({ timestamp: Date.now(), temp, emoji }));
      }
    } catch (e) {
      console.error(e);
      // Fallback to cache if exists
      const cachedLoc = await AsyncStorage.getItem('user_location');
      if (cachedLoc) setLocationName(cachedLoc);
      const cachedWea = await AsyncStorage.getItem('weather_cache');
      if (cachedWea) setWeatherData(JSON.parse(cachedWea));
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning');
    if (hour < 18) return t('goodAfternoon');
    return t('goodEvening');
  };

  const handleBodycamPress = async () => {
    if (profile?.role) {
      navigation.navigate(profile.role === 'manager' ? 'ManagerTabs' : 'EmployeeTabs');
      return;
    }
    setUpdatingRole(true);
    try {
      if (user) {
        const { error } = await supabase.from('users').update({ role: 'employee' }).eq('id', user.id);
        if (error) throw error;
        refreshProfile().catch(console.error);
        navigation.navigate('EmployeeTabs');
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not update role. Please try again.');
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleManagerPress = async () => {
    setUpdatingRole(true);
    try {
      if (user) {
        const { error } = await supabase.from('users').update({ role: 'manager' }).eq('id', user.id);
        if (error) throw error;
        refreshProfile().catch(console.error);
        navigation.navigate('ManagerTabs');
      }
    } catch (e: any) {
      Alert.alert('Error', 'Could not update role. Please try again.');
    } finally {
      setUpdatingRole(false);
    }
  };

  const handleLeafDetectionPress = () => navigation.navigate('LeafDetection');
  const handleIoTPress = () => navigation.navigate('IoTSensorScreen');

  const styles = getStyles(themeColors);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()}{profile?.name ? `, ${profile.name}` : ''}</Text>
            <Text style={styles.subtitle}>{t('subtitle')}</Text>
            
            {(locationName || weatherData) && (
              <View style={styles.weatherRow}>
                {locationName && (
                  <Text style={styles.locationText}>
                    <MaterialCommunityIcons name="map-marker" size={14} color={themeColors.subtext} /> {locationName}
                  </Text>
                )}
                {weatherData && (
                  <View style={styles.weatherPill}>
                    <Text style={styles.weatherText}>{weatherData.temp}°C {weatherData.emoji}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('SettingsScreen')} style={styles.settingsIcon}>
            <MaterialCommunityIcons name="cog-outline" size={28} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        {/* Feature Cards */}
        <View style={styles.cardContainer}>
          <TouchableOpacity onPress={handleBodycamPress} disabled={updatingRole} activeOpacity={0.8}>
            <LinearGradient colors={['#374151', '#111827']} style={styles.gradientCard}>
              <View style={styles.cardContent}>
                <View style={styles.iconCircle}>
                  {updatingRole ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialCommunityIcons name="video-outline" size={28} color="#fff" />
                  )}
                </View>
                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>{t('bodycam')}</Text>
                  <Text style={styles.cardDesc}>{t('bodycamDesc')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.7)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLeafDetectionPress} disabled={updatingRole} activeOpacity={0.8}>
            <LinearGradient colors={['#065f46', '#022c22']} style={styles.gradientCard}>
              <View style={styles.cardContent}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name="leaf" size={28} color="#4ade80" />
                </View>
                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>{t('leafDisease')}</Text>
                  <Text style={styles.cardDesc}>{t('leafDiseaseDesc')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.7)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleIoTPress} disabled={updatingRole} activeOpacity={0.8}>
            <LinearGradient colors={['#1e40af', '#172554']} style={styles.gradientCard}>
              <View style={styles.cardContent}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name="signal-variant" size={28} color="#60a5fa" />
                </View>
                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>{t('sensorAnalysis')}</Text>
                  <Text style={styles.cardDesc}>{t('sensorAnalysisDesc')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.7)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
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

        {profile !== null && !profile?.role && !updatingRole && (
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleManagerPress}>
              <Text style={styles.managerText}>If you are a manager, click this</Text>
            </TouchableOpacity>
          </View>
        )}

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
    marginBottom: 32,
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
    marginBottom: 12,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  locationText: {
    fontSize: 14,
    color: themeColors.subtext,
    fontWeight: '500',
  },
  weatherPill: {
    backgroundColor: themeColors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  weatherText: {
    fontSize: 12,
    color: themeColors.text,
    fontWeight: '600',
  },
  settingsIcon: {
    padding: 8,
  },
  cardContainer: {
    gap: 16,
    marginBottom: 24,
  },
  gradientCard: {
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
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
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  managerText: {
    color: themeColors.subtext,
    fontSize: 14,
    textDecorationLine: 'underline',
    padding: 8,
  },
});
