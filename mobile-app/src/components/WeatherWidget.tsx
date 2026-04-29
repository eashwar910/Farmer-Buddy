import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAppContext } from '../context/AppContext';

const WEATHER_CODE_MAP: Record<number, string> = {
  0:  'Clear ☀️',
  1:  'Mostly Clear 🌤',
  2:  'Partly Cloudy ⛅',
  3:  'Overcast ☁️',
  45: 'Foggy 🌫',
  51: 'Light Drizzle 🌦',
  61: 'Rain 🌧',
  71: 'Snow 🌨',
  80: 'Showers 🌦',
  95: 'Thunderstorm ⛈',
};

const getCondition = (code: number): string =>
  WEATHER_CODE_MAP[code] ?? 'Cloudy ☁️';

interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  locationName: string;
}

const WeatherWidget = () => {
  const { themeColors } = useAppContext();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const shimmer = useRef(new Animated.Value(0.3)).current;

  // Shimmer while loading
  useEffect(() => {
    if (!loading) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [loading]);

  // Weather fetch with 30-min cache
  useEffect(() => {
    (async () => {
      try {
        // Check 30-min cache
        const cachedStr = await AsyncStorage.getItem('weather_widget_cache');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Date.now() - cached.timestamp < 30 * 60 * 1000 && cached.data) {
            setWeather(cached.data);
            setLoading(false);
            return;
          }
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setLoading(false); return; }

        const loc = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = loc.coords;

        // Reverse geocode
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        const locationName =
          geocode?.[0]?.city ?? geocode?.[0]?.subregion ?? geocode?.[0]?.region ?? 'Unknown';
        await AsyncStorage.setItem('user_location', locationName);

        // Fetch weather
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current_weather=true&hourly=relativehumidity_2m,uv_index&windspeed_unit=kmh`
        );
        if (!res.ok) throw new Error('fetch failed');
        const json = await res.json();

        const cw   = json.current_weather;
        const hour = new Date(cw.time).getHours();
        const idx  = (json.hourly.time as string[]).findIndex(
          (t) => new Date(t).getHours() === hour
        );
        const i = idx >= 0 ? idx : 0;

        const data: WeatherData = {
          temp:         Math.round(cw.temperature),
          condition:    getCondition(cw.weathercode),
          humidity:     json.hourly.relativehumidity_2m[i] ?? 0,
          windSpeed:    Math.round(cw.windspeed),
          uvIndex:      Math.round(json.hourly.uv_index[i] ?? 0),
          locationName,
        };

        setWeather(data);
        await AsyncStorage.setItem('weather_widget_cache', JSON.stringify({ timestamp: Date.now(), data }));
      } catch {
        // Fallback to stale cache
        try {
          const cachedStr = await AsyncStorage.getItem('weather_widget_cache');
          if (cachedStr) {
            const cached = JSON.parse(cachedStr);
            if (cached.data) setWeather(cached.data);
          }
        } catch {}
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const styles = getStyles(themeColors);

  if (loading) {
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.skeletonRow, { opacity: shimmer }]}>
          <View style={[styles.skeletonBox, { width: 80,  height: 11 }]} />
          <View style={[styles.skeletonBox, { width: 52,  height: 20 }]} />
          <View style={[styles.skeletonBox, { width: 110, height: 11 }]} />
        </Animated.View>
      </View>
    );
  }

  const temp      = weather ? `${weather.temp}°` : '--°';
  const condition = weather?.condition ?? 'Unavailable';
  const humidity  = weather ? `${weather.humidity}%` : '--';
  const wind      = weather ? `${weather.windSpeed} km/h` : '--';
  const uv        = weather ? `${weather.uvIndex}` : '--';
  const locName   = weather?.locationName ?? '--';

  return (
    <View style={styles.container}>

      {/* Left — location */}
      <View style={styles.locationSection}>
        <MaterialCommunityIcons name="map-marker" size={12} color={themeColors.emphasis} />
        <Text style={styles.locationText} numberOfLines={1}>{locName}</Text>
      </View>

      {/* Center — temperature + condition */}
      <View style={styles.tempSection}>
        <Text style={styles.tempText}>{temp}</Text>
        <Text style={styles.conditionText} numberOfLines={1}>{condition}</Text>
      </View>

      {/* Right — humidity · wind · UV */}
      <View style={styles.statsSection}>
        <View style={styles.stat}>
          <MaterialCommunityIcons name="water-percent" size={11} color={themeColors.subtext} />
          <Text style={styles.statValue}>{humidity}</Text>
        </View>
        <View style={styles.stat}>
          <MaterialCommunityIcons name="weather-windy" size={11} color={themeColors.subtext} />
          <Text style={styles.statValue}>{wind}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>UV</Text>
          <Text style={styles.statValue}>{uv}</Text>
        </View>
      </View>

    </View>
  );
};

export default WeatherWidget;

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: themeColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },

  // Left
  locationSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 8,
  },
  locationText: {
    fontSize: 12,
    color: themeColors.subtext,
    flex: 1,
    fontFamily: 'Satoshi-Regular',
  },

  // Center
  tempSection: {
    alignItems: 'center',
    marginHorizontal: 8,
  },
  tempText: {
    fontSize: 22,
    fontWeight: '700',
    color: themeColors.text,
    lineHeight: 26,
    fontFamily: 'CabinetGrotesk-Bold',
  },
  conditionText: {
    fontSize: 11,
    color: themeColors.subtext,
    maxWidth: 96,
    textAlign: 'center',
    fontFamily: 'Satoshi-Regular',
  },

  // Right — stat group
  statsSection: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 8,
  },
  stat: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '600',
    color: themeColors.text,
    fontFamily: 'Satoshi-Regular',
  },
  statLabel: {
    fontSize: 10,
    color: themeColors.subtext,
    fontFamily: 'Satoshi-Regular',
  },

  // Loading skeleton
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  skeletonBox: {
    backgroundColor: themeColors.border,
    borderRadius: 4,
  },
});
