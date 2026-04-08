'use client';

import { useEffect, useState } from 'react';

const WEATHER_CODE_MAP: Record<number, string> = {
  0: 'Clear ☀️',
  1: 'Mostly Clear 🌤',
  2: 'Partly Cloudy ⛅',
  3: 'Overcast ☁️',
  45: 'Foggy 🌫',
  51: 'Light Drizzle 🌦',
  61: 'Rain 🌧',
  71: 'Snow 🌨',
  80: 'Showers 🌦',
  95: 'Thunderstorm ⛈',
};

function getCondition(code: number) {
  return WEATHER_CODE_MAP[code] ?? 'Cloudy ☁️';
}

interface WeatherData {
  temp: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  uvIndex: number;
  locationName: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CACHE_KEY = 'fb_weather_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockTime, setClockTime] = useState('');
  const [dayDate, setDayDate] = useState('');

  // Live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      setClockTime(`${hh}:${mm}`);
      setDayDate(
        `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Weather fetch with localStorage cache
  useEffect(() => {
    (async () => {
      try {
        // Check cache
        const cachedStr = localStorage.getItem(CACHE_KEY);
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Date.now() - cached.timestamp < CACHE_TTL && cached.data) {
            setWeather(cached.data);
            setLoading(false);
            return;
          }
        }

        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 8000,
          }),
        );
        const { latitude, longitude } = pos.coords;

        // Reverse geocode via Open-Meteo compatible geocoder
        let locationName = 'Your Location';
        try {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          );
          if (geoRes.ok) {
            const geoJson = await geoRes.json();
            locationName =
              geoJson.address?.city ||
              geoJson.address?.town ||
              geoJson.address?.village ||
              geoJson.address?.county ||
              'Your Location';
          }
        } catch {
          // Geocode failure is non-critical
        }

        // Fetch weather from Open-Meteo (free, no key required)
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
            `&current_weather=true&hourly=relativehumidity_2m,uv_index&windspeed_unit=kmh`,
        );
        if (!res.ok) throw new Error('Weather fetch failed');
        const json = await res.json();

        const cw = json.current_weather;
        const hour = new Date(cw.time).getHours();
        const idx = (json.hourly.time as string[]).findIndex(
          (t) => new Date(t).getHours() === hour,
        );
        const i = idx >= 0 ? idx : 0;

        const data: WeatherData = {
          temp: Math.round(cw.temperature),
          condition: getCondition(cw.weathercode),
          humidity: json.hourly.relativehumidity_2m[i] ?? 0,
          windSpeed: Math.round(cw.windspeed),
          uvIndex: Math.round(json.hourly.uv_index[i] ?? 0),
          locationName,
        };

        setWeather(data);
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), data }),
        );
      } catch {
        // Try stale cache on error
        try {
          const cachedStr = localStorage.getItem(CACHE_KEY);
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

  if (loading) {
    return (
      <div className="w-full h-40 rounded-2xl bg-fb-card border border-fb-border/50 flex items-center justify-center animate-pulse">
        <span className="text-fb-subtext text-sm">Loading weather…</span>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-2xl border border-fb-border overflow-hidden relative"
      style={{
        background: 'linear-gradient(135deg, rgba(22,24,20,0.98) 0%, rgba(32,36,28,0.98) 100%)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <div className="p-5 flex flex-col gap-4">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5 text-fb-subtext text-sm">
            <span>📍</span>
            <span className="truncate max-w-[180px]">
              {weather?.locationName ?? 'Location unavailable'}
            </span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-fb-text tracking-widest">
              {clockTime}
            </div>
            <div className="text-xs text-fb-subtext mt-0.5">{dayDate}</div>
          </div>
        </div>

        {/* Temperature */}
        <div>
          <div className="text-5xl font-bold text-fb-text leading-none">
            {weather ? `${weather.temp}°` : '--°'}
          </div>
          <div className="text-fb-subtext text-sm mt-1">
            {weather?.condition ?? 'Unavailable'}
          </div>
        </div>

        {/* Pills */}
        <div className="flex flex-wrap gap-2">
          <Pill label="Humidity" value={weather ? `${weather.humidity}%` : '--'} icon="💧" />
          <Pill label="Wind" value={weather ? `${weather.windSpeed} km/h` : '--'} icon="💨" />
          <Pill label="UV Index" value={weather ? `${weather.uvIndex}` : '--'} icon="☀️" />
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-fb-elevated rounded-full px-3 py-1.5 text-xs border border-fb-border">
      <span>{icon}</span>
      <span className="font-semibold text-fb-text">{value}</span>
      <span className="text-fb-subtext">{label}</span>
    </div>
  );
}
