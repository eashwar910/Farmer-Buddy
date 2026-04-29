import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';

import { CustomDropdown } from './CustomDropdown';

export const SENSOR_TYPES = [
  { label: 'Soil Moisture (% VWC)', unit: '% VWC', category: 'soil' },
  { label: 'Soil pH', unit: 'pH', category: 'soil' },
  { label: 'Soil NPK (N / P / K in mg/kg)', unit: 'mg/kg', category: 'soil' },
  { label: 'Soil Temperature (°C)', unit: '°C', category: 'soil' },
  { label: 'Soil EC (dS/m)', unit: 'dS/m', category: 'soil' },
  { label: 'Air Temperature (°C)', unit: '°C', category: 'air' },
  { label: 'Air Humidity (% RH)', unit: '% RH', category: 'air' },
  { label: 'Leaf Wetness (0–100)', unit: '', category: 'water' },
  { label: 'PAR / Light Intensity (µmol/m²/s)', unit: 'µmol/m²/s', category: 'air' },
  { label: 'Rainfall (mm)', unit: 'mm', category: 'water' },
  { label: 'Water Level (cm)', unit: 'cm', category: 'water' },
  { label: 'Water pH', unit: 'pH', category: 'water' },
  { label: 'Water EC (dS/m)', unit: 'dS/m', category: 'water' },
  { label: 'Dissolved Oxygen (mg/L)', unit: 'mg/L', category: 'water' },
  { label: 'CO₂ Level (ppm)', unit: 'ppm', category: 'air' },
  { label: 'Ammonia NH₃ (ppm)', unit: 'ppm', category: 'air' },
  { label: 'UV Index', unit: 'Index', category: 'air' },
  { label: 'Custom', unit: '', category: 'other' },
];

export type SensorType = typeof SENSOR_TYPES[0];

interface SensorInputFormProps {
  visible: boolean;
  editingSensorId: string | null;
  sName: string;
  setSName: (v: string) => void;
  sType: SensorType;
  setSType: (v: SensorType) => void;
  sUnit: string;
  setSUnit: (v: string) => void;
  sReading: string;
  setSReading: (v: string) => void;
  sNotes: string;
  setSNotes: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
  themeColors: any;
}

export function SensorInputForm({
  visible,
  editingSensorId,
  sName, setSName,
  sType, setSType,
  sUnit, setSUnit,
  sReading, setSReading,
  sNotes, setSNotes,
  onClose,
  onSave,
  themeColors,
}: SensorInputFormProps) {
  const styles = getStyles(themeColors);
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingSensorId ? 'Edit Sensor' : 'Add Sensor'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Sensor Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Soil Probe A"
                placeholderTextColor={themeColors.subtext}
                value={sName}
                onChangeText={setSName}
              />
            </View>

            <CustomDropdown
              label="Sensor Type"
              options={SENSOR_TYPES}
              selected={sType?.label}
              onSelect={(val: any) => {
                setSType(val);
                setSUnit(val.unit);
              }}
              themeColors={themeColors}
            />

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 2, marginRight: 10 }]}>
                <Text style={styles.label}>Current Reading</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Value"
                  placeholderTextColor={themeColors.subtext}
                  keyboardType="numeric"
                  value={sReading}
                  onChangeText={setSReading}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Unit</Text>
                <TextInput
                  style={styles.input}
                  value={sUnit}
                  onChangeText={setSUnit}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g., Seems inaccurate after rain"
                placeholderTextColor={themeColors.subtext}
                multiline
                numberOfLines={2}
                value={sNotes}
                onChangeText={setSNotes}
              />
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.modalSaveBtn} onPress={onSave}>
            <Text style={styles.modalSaveBtnText}>Save Sensor Data</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  inputGroup: { marginBottom: 16 },
  label: { color: themeColors.subtext, fontSize: 14, marginBottom: 8, fontWeight: '500' },
  input: {
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    color: themeColors.text,
    padding: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  rowInputs: { flexDirection: 'row' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: themeColors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    height: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { color: themeColors.text, fontSize: 18, fontWeight: '700' },
  closeBtnText: { color: themeColors.accent, fontSize: 16, fontWeight: '600' },
  modalBody: { flex: 1 },
  modalSaveBtn: {
    backgroundColor: themeColors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  modalSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
