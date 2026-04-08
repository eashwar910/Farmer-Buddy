import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Switch, Modal, FlatList, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeFarmData } from '../services/geminiService';
import { useAppContext } from '../context/AppContext';

// ── Constants ──────────────────────────────────────────────────────────────────

const FREQUENCIES = ['Every Day', 'Every 2 Days', 'Every 3 Days', 'Weekly'];

const DURATIONS = [
  { label: '10m', value: '10' },
  { label: '20m', value: '20' },
  { label: '30m', value: '30' },
  { label: '45m', value: '45' },
  { label: '1hr', value: '60' },
];

const IRRIGATION_TYPES = [
  { label: 'Drip Irrigation',  icon: 'water-outline'        },
  { label: 'Sprinkler',        icon: 'sprinkler-variant'    },
  { label: 'Flood / Furrow',   icon: 'waves'                },
  { label: 'Hand Watering',    icon: 'watering-can-outline' },
  { label: 'Soaker Hose',      icon: 'pipe'                 },
];

const FARM_TYPES = [
  'Small Home Garden', 'Raised Beds', 'Open Field Farm',
  'Greenhouse', 'Orchard', 'Potted / Container Plants',
];

const SOIL_TYPES = ['Sandy', 'Loamy', 'Clay', "Don't Know"];

const CROP_SUGGESTIONS = [
  'Tomatoes', 'Rice', 'Wheat', 'Lettuce', 'Maize', 'Herbs',
  'Mixed Vegetables', 'Ornamental/Garden', 'Chili', 'Pepper',
  'Cucumber', 'Eggplant', 'Cabbage', 'Strawberry', 'Mango',
  'Banana', 'Corn', 'Soybeans', 'Spinach', 'Carrot',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const generateTimeSlots = (overnight: boolean): string[] => {
  const slots: string[] = [];
  const startH = overnight ? 0 : 6;
  const endH   = overnight ? 23 : 19;
  for (let h = startH; h <= endH; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (!overnight && h === 19 && m > 0) break;
      slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  return slots;
};

export const format12h = (time24: string): string => {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface BuddyResult {
  schedule:       string;
  irrigationType: string;
  tips:           string;
  applyData: {
    time:      string;
    frequency: string;
    duration:  string;
    type:      string;
  } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IrrigationTimerScreen({ navigation }: any) {
  const { themeColors } = useAppContext();

  // Tab
  const [activeTab, setActiveTab] = useState<'manual' | 'buddy'>('manual');

  // Manual schedule
  const [frequency,            setFrequency]            = useState('Every Day');
  const [selectedTime,         setSelectedTime]         = useState('07:00');
  const [duration,             setDuration]             = useState('20');
  const [overnightAllowed,     setOvernightAllowed]     = useState(false);
  const [showOvernightWarning, setShowOvernightWarning] = useState(false);
  const [irrigationType,       setIrrigationType]       = useState('Drip Irrigation');
  const [showTimePicker,       setShowTimePicker]       = useState(false);

  // Toast
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [toastMsg,   setToastMsg]   = useState('');

  // Buddy tab
  const [cropType,       setCropType]       = useState('');
  const [filteredCrops,  setFilteredCrops]  = useState<string[]>([]);
  const [farmType,       setFarmType]       = useState('');
  const [soilType,       setSoilType]       = useState('');
  const [locationName,   setLocationName]   = useState('');
  const [locLoading,     setLocLoading]     = useState(false);
  const [locDenied,      setLocDenied]      = useState(false);
  const [analyzing,      setAnalyzing]      = useState(false);
  const [buddyResult,    setBuddyResult]    = useState<BuddyResult | null>(null);

  // ── Load saved schedule on mount ──────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('irrigation_schedule');
        if (saved) {
          const s = JSON.parse(saved);
          if (s.frequency)                    setFrequency(s.frequency);
          if (s.time)                         setSelectedTime(s.time);
          if (s.duration)                     setDuration(s.duration);
          if (s.overnightAllowed !== undefined) setOvernightAllowed(s.overnightAllowed);
          if (s.irrigationType)               setIrrigationType(s.irrigationType);
        }
      } catch {}
    })();
    fetchLocation();
  }, []);

  // ── Location ──────────────────────────────────────────────────────────────

  const fetchLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocDenied(true); setLocLoading(false); return; }
      const pos = await Location.getCurrentPositionAsync({});
      const geo = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const city    = geo?.[0]?.city ?? geo?.[0]?.subregion ?? geo?.[0]?.region ?? '';
      const country = geo?.[0]?.country ?? '';
      setLocationName(city ? `${city}, ${country}` : country);
      setLocDenied(false);
    } catch {
      setLocDenied(true);
    }
    setLocLoading(false);
  };

  // ── Crop suggestions ──────────────────────────────────────────────────────

  const handleCropChange = (text: string) => {
    setCropType(text);
    setFilteredCrops(
      text.length > 0
        ? CROP_SUGGESTIONS.filter(c => c.toLowerCase().startsWith(text.toLowerCase()))
        : []
    );
  };

  // ── Overnight toggle ──────────────────────────────────────────────────────

  const handleOvernightToggle = (value: boolean) => {
    if (value) {
      setShowOvernightWarning(true);
    } else {
      setOvernightAllowed(false);
      setShowOvernightWarning(false);
      const h = parseInt(selectedTime.split(':')[0], 10);
      if (h < 6 || h >= 19) setSelectedTime('07:00');
    }
  };

  // ── Toast ─────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToastMsg(msg);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  };

  // ── Save schedule ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    const schedule = { frequency, time: selectedTime, duration, overnightAllowed, irrigationType };
    await AsyncStorage.setItem('irrigation_schedule', JSON.stringify(schedule));
    showToast('Irrigation scheduled.');
    setTimeout(() => navigation.goBack(), 2200);
  };

  // ── Buddy submit ──────────────────────────────────────────────────────────

  const handleBuddySubmit = async () => {
    if (!cropType.trim() || !farmType || !locationName.trim()) return;

    setAnalyzing(true);
    setBuddyResult(null);

    const month  = new Date().getMonth();
    const season = month >= 2 && month <= 4 ? 'Spring'
      : month >= 5 && month <= 7 ? 'Summer'
      : month >= 8 && month <= 10 ? 'Autumn'
      : 'Winter';

    let weatherContext = '';
    try {
      const cached = await AsyncStorage.getItem('weather_widget_cache');
      if (cached) {
        const w = JSON.parse(cached).data;
        if (w) weatherContext = `Current weather: ${w.condition}, ${w.temp}°C, humidity ${w.humidity}%, wind ${w.windSpeed} km/h.`;
      }
    } catch {}

    const prompt = `You are an expert agricultural advisor. Provide a personalised irrigation recommendation.

Inputs:
- Crop: ${cropType}
- Farm type: ${farmType}
- Soil type: ${soilType || 'Unknown'}
- Location: ${locationName}
- Season: ${season}
${weatherContext ? `- ${weatherContext}` : ''}

Respond in exactly this format (plain text, no markdown, no filler):

RECOMMENDED_SCHEDULE:
[1-2 sentences: best time of day, frequency, and duration per cycle]

IRRIGATION_TYPE:
[Best irrigation type for this crop and setup with a 1-sentence reason]

TIPS:
[3-4 bullet points with crop-specific irrigation advice]

APPLY:
time=[HH:MM in 24h, prefer 06:00-19:00 unless strong agronomic reason]
frequency=[one of: Every Day, Every 2 Days, Every 3 Days, Weekly]
duration=[one of: 10, 20, 30, 45, 60]
type=[one of: Drip Irrigation, Sprinkler, Flood / Furrow, Hand Watering, Soaker Hose]`;

    try {
      const text = await analyzeFarmData(prompt);

      const parseSection = (header: string): string => {
        const m = text.match(new RegExp(`${header}:\\n([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`));
        return m ? m[1].trim() : '';
      };

      let applyData: BuddyResult['applyData'] = null;
      const applyBlock = text.match(/APPLY:\n([\s\S]*?)(?=\n[A-Z_]+:|$)/);
      if (applyBlock) {
        const kv: Record<string, string> = {};
        applyBlock[1].split('\n').forEach(line => {
          const eq = line.indexOf('=');
          if (eq > 0) kv[line.substring(0, eq).trim()] = line.substring(eq + 1).trim();
        });
        applyData = {
          time:      kv.time || '07:00',
          frequency: FREQUENCIES.includes(kv.frequency) ? kv.frequency : 'Every Day',
          duration:  ['10', '20', '30', '45', '60'].includes(kv.duration) ? kv.duration : '20',
          type:      IRRIGATION_TYPES.map(t => t.label).includes(kv.type) ? kv.type : 'Drip Irrigation',
        };
      }

      setBuddyResult({
        schedule:       parseSection('RECOMMENDED_SCHEDULE'),
        irrigationType: parseSection('IRRIGATION_TYPE'),
        tips:           parseSection('TIPS'),
        applyData,
      });
    } catch (e: any) {
      setBuddyResult({
        schedule: '', irrigationType: '', applyData: null,
        tips: `Could not get recommendation: ${e.message}`,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Apply AI recommendation to manual tab ─────────────────────────────────

  const handleApply = () => {
    if (!buddyResult?.applyData) return;
    const { time, frequency: freq, duration: dur, type } = buddyResult.applyData;
    setFrequency(freq);
    setSelectedTime(time);
    setDuration(dur);
    setIrrigationType(type);
    setActiveTab('manual');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const styles    = getStyles(themeColors);
  const timeSlots = generateTimeSlots(overnightAllowed);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>

      {/* ── Tab row ──────────────────────────────────────────────────────── */}
      <View style={styles.tabRow}>
        {(['manual', 'buddy'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'manual' ? 'Manual Schedule' : 'Ask Farmer Buddy'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ════════════════════════════════════════════════════════════════
            MANUAL SCHEDULE TAB
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'manual' && (
          <>
            {/* Frequency */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>FREQUENCY</Text>
              <View style={styles.pillRow}>
                {FREQUENCIES.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.pill, frequency === f && styles.pillActive]}
                    onPress={() => setFrequency(f)}
                  >
                    <Text style={[styles.pillText, frequency === f && styles.pillTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Start time */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>START TIME</Text>
              <TouchableOpacity style={styles.timeField} onPress={() => setShowTimePicker(true)}>
                <MaterialCommunityIcons name="clock-outline" size={18} color={themeColors.emphasis} />
                <Text style={styles.timeFieldText}>{format12h(selectedTime)}</Text>
                <MaterialCommunityIcons name="chevron-down" size={18} color={themeColors.subtext} />
              </TouchableOpacity>
            </View>

            {/* Duration */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>DURATION PER CYCLE</Text>
              <View style={styles.pillRow}>
                {DURATIONS.map(d => (
                  <TouchableOpacity
                    key={d.value}
                    style={[styles.pill, duration === d.value && styles.pillActive]}
                    onPress={() => setDuration(d.value)}
                  >
                    <Text style={[styles.pillText, duration === d.value && styles.pillTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Overnight toggle */}
            <View style={styles.section}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <Text style={styles.toggleLabel}>Continue through the night?</Text>
                  <Text style={styles.toggleSub}>Enables scheduling outside daylight hours</Text>
                </View>
                <Switch
                  value={overnightAllowed}
                  onValueChange={handleOvernightToggle}
                  trackColor={{ false: themeColors.border, true: themeColors.accent }}
                  thumbColor={overnightAllowed ? '#fff' : themeColors.subtext}
                />
              </View>

              {showOvernightWarning && (
                <View style={styles.warningCard}>
                  <MaterialCommunityIcons name="alert-outline" size={18} color="#C49430" />
                  <Text style={styles.warningText}>
                    Night irrigation can cause root rot and fungal disease in most crops. Only recommended for specific cases like sandy soils in high-heat climates. Are you sure?
                  </Text>
                  <View style={styles.warningBtns}>
                    <TouchableOpacity
                      style={styles.warnConfirmBtn}
                      onPress={() => { setOvernightAllowed(true); setShowOvernightWarning(false); }}
                    >
                      <Text style={styles.warnConfirmText}>Confirm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.warnCancelBtn}
                      onPress={() => { setOvernightAllowed(false); setShowOvernightWarning(false); }}
                    >
                      <Text style={styles.warnCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Irrigation type */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>IRRIGATION TYPE</Text>
              <View style={styles.typeGrid}>
                {IRRIGATION_TYPES.map(t => (
                  <TouchableOpacity
                    key={t.label}
                    style={[styles.typeCard, irrigationType === t.label && styles.typeCardActive]}
                    onPress={() => setIrrigationType(t.label)}
                  >
                    <MaterialCommunityIcons
                      name={t.icon as any}
                      size={28}
                      color={irrigationType === t.label ? themeColors.accent : themeColors.emphasis}
                    />
                    <Text style={[styles.typeLabel, irrigationType === t.label && styles.typeLabelActive]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Save */}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.primaryBtnText}>Save Schedule</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            FARMER BUDDY TAB
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === 'buddy' && (
          <>
            {/* Crop type */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>CROP TYPE</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Tomatoes, Rice, Wheat…"
                placeholderTextColor={themeColors.subtext}
                value={cropType}
                onChangeText={handleCropChange}
              />
              {filteredCrops.length > 0 && (
                <View style={styles.suggestBox}>
                  {filteredCrops.slice(0, 5).map(c => (
                    <TouchableOpacity
                      key={c}
                      style={styles.suggestItem}
                      onPress={() => { setCropType(c); setFilteredCrops([]); }}
                    >
                      <Text style={styles.suggestText}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Farm/garden type */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>FARM / GARDEN TYPE</Text>
              <View style={styles.pillWrap}>
                {FARM_TYPES.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.pill, farmType === f && styles.pillActive]}
                    onPress={() => setFarmType(f)}
                  >
                    <Text style={[styles.pillText, farmType === f && styles.pillTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Soil type */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SOIL TYPE (OPTIONAL)</Text>
              <View style={styles.pillRow}>
                {SOIL_TYPES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.pill, soilType === s && styles.pillActive]}
                    onPress={() => setSoilType(soilType === s ? '' : s)}
                  >
                    <Text style={[styles.pillText, soilType === s && styles.pillTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Location */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>LOCATION</Text>
              {locLoading ? (
                <View style={styles.locRow}>
                  <ActivityIndicator size="small" color={themeColors.accent} />
                  <Text style={styles.locHint}>Fetching location…</Text>
                </View>
              ) : locDenied ? (
                <TextInput
                  style={styles.input}
                  placeholder="Enter your city or region"
                  placeholderTextColor={themeColors.subtext}
                  value={locationName}
                  onChangeText={setLocationName}
                />
              ) : (
                <View style={styles.locField}>
                  <MaterialCommunityIcons name="map-marker" size={14} color={themeColors.emphasis} />
                  <Text style={styles.locText}>{locationName || '—'}</Text>
                  <TouchableOpacity onPress={fetchLocation}>
                    <Text style={styles.locRefresh}>Use my location</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (!cropType.trim() || !farmType || !locationName.trim()) && styles.primaryBtnDisabled,
              ]}
              disabled={!cropType.trim() || !farmType || !locationName.trim() || analyzing}
              onPress={handleBuddySubmit}
            >
              {analyzing
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryBtnText}>✨ Get Recommendation</Text>
              }
            </TouchableOpacity>
            {analyzing && (
              <Text style={styles.analyzingHint}>Farmer Buddy is checking your conditions…</Text>
            )}

            {/* Buddy result card */}
            {buddyResult && (
              <View style={styles.resultCard}>
                {buddyResult.schedule ? (
                  <>
                    <ResultSection
                      icon="calendar-clock"
                      title="Recommended Schedule"
                      body={buddyResult.schedule}
                      themeColors={themeColors}
                      styles={styles}
                    />
                    <View style={styles.resultDivider} />
                    <ResultSection
                      icon="water-outline"
                      title="Irrigation Type Suggestion"
                      body={buddyResult.irrigationType}
                      themeColors={themeColors}
                      styles={styles}
                    />
                    <View style={styles.resultDivider} />
                    <ResultSection
                      icon="leaf"
                      title="Tips for your crop"
                      body={buddyResult.tips}
                      themeColors={themeColors}
                      styles={styles}
                    />
                    {buddyResult.applyData && (
                      <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
                        <Text style={styles.applyBtnText}>Apply this schedule →</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <Text style={[styles.resultBody, { color: themeColors.statusAlert, padding: 16 }]}>
                    {buddyResult.tips}
                  </Text>
                )}
              </View>
            )}
          </>
        )}

      </ScrollView>

      {/* ── Time picker modal ─────────────────────────────────────────────── */}
      <Modal visible={showTimePicker} transparent animationType="slide">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Text style={styles.pickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            {!overnightAllowed && (
              <Text style={styles.pickerHint}>
                Irrigation works best in daylight hours — this helps prevent fungal growth and waterlogging overnight.
              </Text>
            )}
            <FlatList
              data={timeSlots}
              keyExtractor={item => item}
              showsVerticalScrollIndicator={false}
              style={styles.pickerList}
              getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
              initialScrollIndex={Math.max(0, timeSlots.indexOf(selectedTime))}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, selectedTime === item && styles.pickerItemActive]}
                  onPress={() => { setSelectedTime(item); setShowTimePicker(false); }}
                >
                  <Text style={[styles.pickerItemText, selectedTime === item && styles.pickerItemTextActive]}>
                    {format12h(item)}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <MaterialCommunityIcons name="check-circle-outline" size={16} color="#fff" />
        <Text style={styles.toastText}>{toastMsg}</Text>
      </Animated.View>

    </SafeAreaView>
  );
}

// ── Small helper component ────────────────────────────────────────────────────

function ResultSection({ icon, title, body, themeColors, styles }: any) {
  return (
    <View style={styles.resultSection}>
      <View style={styles.resultSectionHeader}>
        <MaterialCommunityIcons name={icon} size={15} color={themeColors.emphasis} />
        <Text style={styles.resultSectionTitle}>{title.toUpperCase()}</Text>
      </View>
      <Text style={styles.resultBody}>{body}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: themeColors.card,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: themeColors.accent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: themeColors.subtext,
    fontFamily: 'Satoshi-Regular',
  },
  tabTextActive: {
    color: themeColors.textOnAccent,
    fontFamily: 'CabinetGrotesk-Medium',
  },

  scroll: {
    padding: 16,
    paddingBottom: 48,
  },

  // Sections
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 11,
    color: themeColors.faint,
    letterSpacing: 1.4,
    marginBottom: 10,
    fontFamily: 'Satoshi-Regular',
  },

  // Pills
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  pillActive: {
    backgroundColor: themeColors.accent,
    borderColor: themeColors.accent,
  },
  pillText: {
    fontSize: 13,
    color: themeColors.text,
    fontFamily: 'Satoshi-Regular',
  },
  pillTextActive: {
    color: themeColors.textOnAccent,
    fontWeight: '600',
  },

  // Time field
  timeField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  timeFieldText: {
    flex: 1,
    fontSize: 16,
    color: themeColors.text,
    fontFamily: 'CabinetGrotesk-Bold',
  },

  // Overnight toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: themeColors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
    padding: 16,
  },
  toggleLeft: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    color: themeColors.text,
    fontWeight: '500',
    fontFamily: 'Satoshi-Regular',
  },
  toggleSub: {
    fontSize: 12,
    color: themeColors.subtext,
    marginTop: 2,
    fontFamily: 'Satoshi-Regular',
  },

  // Overnight warning
  warningCard: {
    backgroundColor: 'rgba(196,148,48,0.1)',
    borderWidth: 1,
    borderColor: '#C49430',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    gap: 8,
  },
  warningText: {
    fontSize: 13,
    color: themeColors.text,
    lineHeight: 19,
    fontFamily: 'Satoshi-Regular',
  },
  warningBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  warnConfirmBtn: {
    flex: 1,
    backgroundColor: '#C49430',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  warnConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontFamily: 'Satoshi-Regular',
  },
  warnCancelBtn: {
    flex: 1,
    backgroundColor: themeColors.card,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  warnCancelText: {
    color: themeColors.text,
    fontFamily: 'Satoshi-Regular',
  },

  // Irrigation type grid
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    width: '30%',
    backgroundColor: themeColors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: themeColors.border,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
    minHeight: 80,
    justifyContent: 'center',
  },
  typeCardActive: {
    borderColor: themeColors.accent,
    backgroundColor: themeColors.elevatedCard,
  },
  typeLabel: {
    fontSize: 11,
    color: themeColors.subtext,
    textAlign: 'center',
    fontFamily: 'Satoshi-Regular',
    lineHeight: 14,
  },
  typeLabelActive: {
    color: themeColors.accent,
    fontWeight: '600',
  },

  // Primary button
  primaryBtn: {
    backgroundColor: themeColors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnDisabled: {
    backgroundColor: themeColors.border,
  },
  primaryBtnText: {
    color: themeColors.textOnAccent,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'CabinetGrotesk-Bold',
  },

  // Input
  input: {
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    color: themeColors.text,
    padding: 12,
    fontSize: 15,
    fontFamily: 'Satoshi-Regular',
  },

  // Crop suggestions
  suggestBox: {
    backgroundColor: themeColors.elevatedCard,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  suggestText: {
    color: themeColors.text,
    fontSize: 14,
    fontFamily: 'Satoshi-Regular',
  },

  // Location
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 4,
  },
  locHint: {
    color: themeColors.subtext,
    fontSize: 13,
    fontFamily: 'Satoshi-Regular',
  },
  locField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  locText: {
    flex: 1,
    color: themeColors.text,
    fontSize: 14,
    fontFamily: 'Satoshi-Regular',
  },
  locRefresh: {
    color: themeColors.accent,
    fontSize: 13,
    fontFamily: 'Satoshi-Regular',
  },

  // Analyzing hint
  analyzingHint: {
    textAlign: 'center',
    color: themeColors.subtext,
    fontSize: 13,
    marginTop: 10,
    fontFamily: 'Satoshi-Regular',
  },

  // Result card
  resultCard: {
    backgroundColor: themeColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginTop: 20,
    overflow: 'hidden',
  },
  resultSection: {
    padding: 16,
  },
  resultSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  resultSectionTitle: {
    fontSize: 10,
    color: themeColors.faint,
    letterSpacing: 1.2,
    fontFamily: 'Satoshi-Regular',
  },
  resultBody: {
    fontSize: 14,
    color: themeColors.text,
    lineHeight: 21,
    fontFamily: 'Satoshi-Regular',
  },
  resultDivider: {
    height: 1,
    backgroundColor: themeColors.border,
    marginHorizontal: 16,
  },
  applyBtn: {
    margin: 16,
    backgroundColor: themeColors.accent,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  applyBtnText: {
    color: themeColors.textOnAccent,
    fontWeight: '700',
    fontSize: 15,
    fontFamily: 'CabinetGrotesk-Bold',
  },

  // Time picker modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: themeColors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: themeColors.text,
    fontFamily: 'CabinetGrotesk-Bold',
  },
  pickerDone: {
    fontSize: 16,
    color: themeColors.accent,
    fontWeight: '600',
    fontFamily: 'Satoshi-Regular',
  },
  pickerHint: {
    fontSize: 12,
    color: themeColors.subtext,
    marginBottom: 12,
    lineHeight: 17,
    fontFamily: 'Satoshi-Regular',
  },
  pickerList: {
    maxHeight: 300,
  },
  pickerItem: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  pickerItemActive: {
    backgroundColor: themeColors.elevatedCard,
  },
  pickerItemText: {
    fontSize: 15,
    color: themeColors.subtext,
    fontFamily: 'Satoshi-Regular',
  },
  pickerItemTextActive: {
    color: themeColors.accent,
    fontWeight: '700',
    fontSize: 17,
    fontFamily: 'CabinetGrotesk-Bold',
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: themeColors.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toastText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Satoshi-Regular',
  },
});
