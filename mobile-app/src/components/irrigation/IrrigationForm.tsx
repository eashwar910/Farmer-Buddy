import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

export const FREQUENCIES = ['Every Day', 'Every 2 Days', 'Every 3 Days', 'Weekly'];

export const DURATIONS = [
  { label: '10m', value: '10' },
  { label: '20m', value: '20' },
  { label: '30m', value: '30' },
  { label: '45m', value: '45' },
  { label: '1hr', value: '60' },
];

export const IRRIGATION_TYPES = [
  { label: 'Drip Irrigation',  icon: 'water-outline'        },
  { label: 'Sprinkler',        icon: 'sprinkler-variant'    },
  { label: 'Flood / Furrow',   icon: 'waves'                },
  { label: 'Hand Watering',    icon: 'watering-can-outline' },
  { label: 'Soaker Hose',      icon: 'pipe'                 },
];

export const format12h = (time24: string): string => {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
};

interface IrrigationFormProps {
  frequency: string;
  setFrequency: (v: string) => void;
  selectedTime: string;
  duration: string;
  setDuration: (v: string) => void;
  overnightAllowed: boolean;
  showOvernightWarning: boolean;
  irrigationType: string;
  setIrrigationType: (v: string) => void;
  onOpenTimePicker: () => void;
  onOvernightToggle: (v: boolean) => void;
  onConfirmOvernight: () => void;
  onCancelOvernight: () => void;
  onSave: () => void;
  themeColors: any;
}

export const IrrigationForm = ({
  frequency, setFrequency,
  selectedTime,
  duration, setDuration,
  overnightAllowed, showOvernightWarning,
  irrigationType, setIrrigationType,
  onOpenTimePicker,
  onOvernightToggle,
  onConfirmOvernight,
  onCancelOvernight,
  onSave,
  themeColors,
}: IrrigationFormProps) => {
  const styles = getStyles(themeColors);
  return (
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
        <TouchableOpacity style={styles.timeField} onPress={onOpenTimePicker}>
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
            onValueChange={onOvernightToggle}
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
              <TouchableOpacity style={styles.warnConfirmBtn} onPress={onConfirmOvernight}>
                <Text style={styles.warnConfirmText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.warnCancelBtn} onPress={onCancelOvernight}>
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
      <TouchableOpacity style={styles.primaryBtn} onPress={onSave}>
        <Text style={styles.primaryBtnText}>Save Schedule</Text>
      </TouchableOpacity>
    </>
  );
};

const getStyles = (themeColors: any) => StyleSheet.create({
  section: { marginBottom: 22 },
  sectionLabel: {
    fontSize: 11,
    color: themeColors.faint,
    letterSpacing: 1.4,
    marginBottom: 10,
    fontFamily: 'Satoshi-Regular',
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: themeColors.card, borderWidth: 1, borderColor: themeColors.border,
  },
  pillActive: { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
  pillText: { fontSize: 13, color: themeColors.text, fontFamily: 'Satoshi-Regular' },
  pillTextActive: { color: themeColors.textOnAccent, fontWeight: '600' },
  timeField: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: themeColors.card, borderWidth: 1, borderColor: themeColors.border,
    borderRadius: 12, padding: 14, gap: 10,
  },
  timeFieldText: { flex: 1, fontSize: 16, color: themeColors.text, fontFamily: 'CabinetGrotesk-Bold' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: themeColors.card, borderRadius: 12, borderWidth: 1,
    borderColor: themeColors.border, padding: 16,
  },
  toggleLeft: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 15, color: themeColors.text, fontWeight: '500', fontFamily: 'Satoshi-Regular' },
  toggleSub: { fontSize: 12, color: themeColors.subtext, marginTop: 2, fontFamily: 'Satoshi-Regular' },
  warningCard: {
    backgroundColor: 'rgba(196,148,48,0.1)', borderWidth: 1, borderColor: '#C49430',
    borderRadius: 12, padding: 14, marginTop: 10, gap: 8,
  },
  warningText: { fontSize: 13, color: themeColors.text, lineHeight: 19, fontFamily: 'Satoshi-Regular' },
  warningBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  warnConfirmBtn: { flex: 1, backgroundColor: '#C49430', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  warnConfirmText: { color: '#fff', fontWeight: '700', fontFamily: 'Satoshi-Regular' },
  warnCancelBtn: {
    flex: 1, backgroundColor: themeColors.card, borderRadius: 8,
    paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: themeColors.border,
  },
  warnCancelText: { color: themeColors.text, fontFamily: 'Satoshi-Regular' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    width: '30%', backgroundColor: themeColors.card, borderRadius: 12,
    borderWidth: 1.5, borderColor: themeColors.border, paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center', gap: 6, minHeight: 80, justifyContent: 'center',
  },
  typeCardActive: { borderColor: themeColors.accent, backgroundColor: themeColors.elevatedCard },
  typeLabel: {
    fontSize: 11, color: themeColors.subtext, textAlign: 'center',
    fontFamily: 'Satoshi-Regular', lineHeight: 14,
  },
  typeLabelActive: { color: themeColors.accent, fontWeight: '600' },
  primaryBtn: { backgroundColor: themeColors.accent, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: themeColors.textOnAccent, fontSize: 16, fontWeight: '700', fontFamily: 'CabinetGrotesk-Bold' },
});
