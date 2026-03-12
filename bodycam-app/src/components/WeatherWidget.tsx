import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
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

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function WeatherWidget() {
  const { themeColors } = useAppContext();
  const [weather, setWeather]   = useState<WeatherData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [clockTime, setClockTime] = useState('');
  const [dayDate, setDayDate]   = useState('');
  const shimmer = useRef(new Animated.Value(0.3)).current;

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setClockTime(`${hh}:${mm}`);
      setDayDate(`${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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

  // Weather fetch with cache
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
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.overlay} />
        <Animated.View style={[styles.skeletonWrap, { opacity: shimmer }]}>
          <View style={styles.skeletonLeft}>
            <View style={[styles.skeletonBox, { width: 110, height: 13, marginBottom: 18 }]} />
            <View style={[styles.skeletonBox, { width: 90,  height: 50, marginBottom: 6  }]} />
            <View style={[styles.skeletonBox, { width: 70,  height: 13               }]} />
          </View>
          <View style={styles.skeletonRight}>
            <View style={[styles.skeletonBox, { width: 72, height: 28, marginBottom: 8 }]} />
            <View style={[styles.skeletonBox, { width: 120, height: 12               }]} />
          </View>
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
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.overlay} />

      <View style={styles.content}>
        {/* Top row: location + clock */}
        <View style={styles.topRow}>
          <View style={styles.locationRow}>
            <MaterialCommunityIcons name="map-marker" size={13} color={themeColors.accent} />
            <Text style={styles.locationText} numberOfLines={1}>{locName}</Text>
          </View>
          <View style={styles.clockWrap}>
            <Text style={styles.clockText}>{clockTime}</Text>
            <Text style={styles.dayDateText}>{dayDate}</Text>
          </View>
        </View>

        {/* Temperature + condition */}
        <View style={styles.tempSection}>
          <Text style={styles.tempText}>{temp}</Text>
          <Text style={styles.conditionText}>{condition}</Text>
        </View>

        {/* Bottom pills */}
        <View style={styles.pillsRow}>
          <View style={styles.pill}>
            <MaterialCommunityIcons name="water-percent" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.pillValue}>{humidity}</Text>
            <Text style={styles.pillLabel}>Humidity</Text>
          </View>
          <View style={styles.pill}>
            <MaterialCommunityIcons name="weather-windy" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.pillValue}>{wind}</Text>
            <Text style={styles.pillLabel}>Wind</Text>
          </View>
          <View style={styles.pill}>
            <MaterialCommunityIcons name="weather-sunny-alert" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.pillValue}>{uv}</Text>
            <Text style={styles.pillLabel}>UV Index</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    width: '100%',
    height: 168,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
    maxWidth: 170,
  },
  clockWrap: {
    alignItems: 'flex-end',
  },
  clockText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 1,
  },
  dayDateText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    textAlign: 'right',
  },
  tempSection: {
    flexDirection: 'column',
  },
  tempText: {
    fontSize: 52,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 54,
  },
  conditionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pillValue: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  pillLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },
  // Skeleton
  skeletonWrap: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
  },
  skeletonLeft: {
    justifyContent: 'flex-start',
  },
  skeletonRight: {
    alignItems: 'flex-end',
  },
  skeletonBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
  },
});
