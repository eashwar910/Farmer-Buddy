import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { analyzeFarmData } from '../services/geminiService';
import { useAppContext } from '../context/AppContext';

// --- CONSTANTS ---
const SENSOR_TYPES = [
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
  { label: 'Custom', unit: '', category: 'other' }
];

const FARM_TYPES = ['Outdoor Field', 'Greenhouse', 'Aquaponics', 'Hydroponics', 'Orchard', 'Poultry', 'Mixed'];
const GROWTH_STAGES = ['Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Harvest', 'N/A'];

// --- TYPES ---
interface Sensor {
  id: string;
  name: string;
  type: string;
  unit: string;
  reading: string;
  notes: string;
  category: string;
}

interface FarmContext {
  cropType: string;
  farmType: string;
  growthStage: string;
  location: string;
  observations: string;
}

interface Report {
  id: string;
  timestamp: number;
  content: string;
}

// --- UTILS ---
const CustomDropdown = ({ label, options, selected, onSelect, themeColors, styles }: any) => {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.dropdownButton} onPress={() => setVisible(true)}>
        <Text style={selected ? styles.inputText : styles.placeholderText}>
          {selected || 'Select an option...'}
        </Text>
      </TouchableOpacity>
      
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {label}</Text>
              <TouchableOpacity onPress={() => setVisible(false)}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {options.map((opt: any, idx: number) => {
                const optLabel = typeof opt === 'string' ? opt : opt.label;
                return (
                  <TouchableOpacity 
                    key={idx} 
                    style={styles.dropdownOption}
                    onPress={() => {
                      onSelect(opt);
                      setVisible(false);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, selected === optLabel && styles.dropdownOptionSelected]}>
                      {optLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default function IoTSensorScreen() {
  const { themeColors, language, t } = useAppContext();
  
  // State
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [farmContext, setFarmContext] = useState<FarmContext>({
    cropType: '', farmType: '', growthStage: '', location: '', observations: ''
  });
  const [reports, setReports] = useState<Report[]>([]);
  
  // UI State
  const [showSensorModal, setShowSensorModal] = useState(false);
  const [showFarmContext, setShowFarmContext] = useState(true);
  const [showPastReports, setShowPastReports] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  
  // Edit Sensor State
  const [editingSensorId, setEditingSensorId] = useState<string | null>(null);
  const [sName, setSName] = useState('');
  const [sType, setSType] = useState(SENSOR_TYPES[0]);
  const [sUnit, setSUnit] = useState(SENSOR_TYPES[0].unit);
  const [sReading, setSReading] = useState('');
  const [sNotes, setSNotes] = useState('');

  // Initialization
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const storedSensors = await AsyncStorage.getItem('iot_sensors');
      if (storedSensors) setSensors(JSON.parse(storedSensors));

      const storedContext = await AsyncStorage.getItem('iot_farm_context');
      if (storedContext) setFarmContext(JSON.parse(storedContext));

      const storedReports = await AsyncStorage.getItem('iot_reports');
      if (storedReports) setReports(JSON.parse(storedReports));
    } catch (e) {
      console.error('Failed to load local data', e);
    }
  };

  const saveSensors = async (newSensors: Sensor[]) => {
    setSensors(newSensors);
    await AsyncStorage.setItem('iot_sensors', JSON.stringify(newSensors));
  };

  const saveContext = async (newContext: FarmContext) => {
    setFarmContext(newContext);
    await AsyncStorage.setItem('iot_farm_context', JSON.stringify(newContext));
  };

  const saveReports = async (newReports: Report[]) => {
    // max 20 entries
    const clipped = newReports.slice(0, 20);
    setReports(clipped);
    await AsyncStorage.setItem('iot_reports', JSON.stringify(clipped));
  };

  // Sensor Handlers
  const handleConnectHardware = () => {
    Alert.alert('Connect to IoT Devices', 'IoT device connection coming soon. Please enter readings manually for now.');
  };

  const openSensorModal = (sensor?: Sensor) => {
    if (sensor) {
      setEditingSensorId(sensor.id);
      setSName(sensor.name);
      const matchedType = SENSOR_TYPES.find(t => t.label === sensor.type) || SENSOR_TYPES[0];
      setSType(matchedType);
      setSUnit(sensor.unit);
      setSReading(sensor.reading);
      setSNotes(sensor.notes);
    } else {
      setEditingSensorId(null);
      setSName('');
      setSType(SENSOR_TYPES[0]);
      setSUnit(SENSOR_TYPES[0].unit);
      setSReading('');
      setSNotes('');
    }
    setShowSensorModal(true);
  };

  const handleSaveSensor = () => {
    if (!sName.trim() || !sReading.trim()) {
      Alert.alert('Validation Error', 'Please provide a Sensor Name and Current Reading.');
      return;
    }

    const newSensor: Sensor = {
      id: editingSensorId || Date.now().toString(),
      name: sName,
      type: sType.label,
      unit: sUnit,
      reading: sReading,
      notes: sNotes,
      category: sType.category
    };

    let updatedList;
    if (editingSensorId) {
      updatedList = sensors.map(s => s.id === editingSensorId ? newSensor : s);
    } else {
      updatedList = [...sensors, newSensor];
    }

    saveSensors(updatedList);
    setShowSensorModal(false);
  };

  const handleDeleteSensor = (id: string) => {
    Alert.alert('Delete Sensor', 'Are you sure you want to remove this sensor from your list?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Delete', 
        style: 'destructive', 
        onPress: () => saveSensors(sensors.filter(s => s.id !== id))
      }
    ]);
  };

  // Context Handlers
  const handleGetLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location access to auto-fill this field.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      const geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });

      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        const city = place.city || place.subregion || place.region || 'Unknown City';
        const country = place.country || 'Unknown Country';
        saveContext({ ...farmContext, location: `${city}, ${country}` });
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to fetch location automatically.');
      console.error(e);
    }
  };

  // AI Analysis
  const handleAnalyze = async () => {
    if (sensors.length === 0) return;

    setAnalyzing(true);
    setAnalysisResult(null);

    const sensorText = sensors.map(s => `- [${s.name}] (${s.type}): ${s.reading} ${s.unit}. Notes: ${s.notes || 'None'}`).join('\n');

    const languageInstruction = language === 'ms'
      ? 'IMPORTANT: You must respond entirely in Bahasa Malaysia. Do not use English at all.'
      : 'IMPORTANT: You must respond entirely in English.';

    let prompt = `${languageInstruction}

You are an expert agricultural advisor specialized in Southeast Asian farming, particularly Malaysia. A farmer has shared their IoT sensor readings with you.

Sensor Readings:
${sensorText}

Farm Context:
- Crop / Livestock: ${farmContext.cropType || 'Not specified'}
- Farm Type: ${farmContext.farmType || 'Not specified'}
- Growth Stage: ${farmContext.growthStage || 'Not specified'}
- Location: ${farmContext.location || 'Not specified'}
- Recent Observations: ${farmContext.observations || 'None'}

Your task:
1. Give a plain-language summary of what the overall readings indicate about the farm's current condition (2–3 sentences, written for a non-expert farmer).
2. Identify any readings that are outside the healthy/optimal range for the specified crop or farm type in Malaysia/SEA climate. List each one with:
   - What the reading is
   - What it should ideally be
   - What risk or problem it indicates
3. Give 3 to 5 prioritized, actionable recommendations the farmer can act on today. Keep them practical, low-cost, and locally relevant (e.g., reference locally available fertilizers, Malaysian weather patterns, etc.).
4. Give a short outlook: if nothing is done, what is likely to happen in the next 7–14 days?

Respond in a warm, encouraging tone. If the location is in Malaysia, use Malaysian context (local crop names, seasons, suppliers if known). Do not use markdown formatting such as ###, **, or --. Use plain text with numbered sections only.`;

    try {
      const responseText = await analyzeFarmData(prompt);
      setAnalysisResult(responseText);
      // Auto-save the report
      const newReport: Report = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        content: responseText
      };
      saveReports([newReport, ...reports]);
    } catch (e: any) {
      Alert.alert('Analysis Failed', e.message || 'Could not fetch analysis from Gemini. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Styles utility for colors
  const getCategoryColor = (category: string) => {
    switch(category) {
      case 'soil': return '#D97706'; // Amber/Brown
      case 'water': return '#3B82F6'; // Blue
      case 'air': return '#0EA5E9'; // Sky
      default: return themeColors.subtext; // Slate
    }
  };

  const styles = getStyles(themeColors);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* SECTION 1: Connect Placeholder */}
        <TouchableOpacity style={styles.hardwareBtn} onPress={handleConnectHardware}>
          <Text style={styles.hardwareBtnText}>📡 Connect to IoT Devices</Text>
        </TouchableOpacity>

        {/* SECTION 2: Sensor Management */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Active Sensors</Text>
            <TouchableOpacity onPress={() => openSensorModal()}>
              <Text style={styles.addBtnText}>+ Add Sensor</Text>
            </TouchableOpacity>
          </View>

          {sensors.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>No sensors added yet.</Text>
              <Text style={styles.emptySubText}>Tap + to add your first manual sensor reading.</Text>
            </View>
          ) : (
            <View style={styles.sensorList}>
              {sensors.map(s => (
                <View key={s.id} style={[styles.sensorCard, { borderLeftColor: getCategoryColor(s.category) }]}>
                  <View style={styles.sensorCardHeader}>
                    <View>
                      <Text style={styles.sCardName}>{s.name}</Text>
                      <Text style={styles.sCardType}>{s.type}</Text>
                    </View>
                    <View style={styles.sCardActions}>
                      <TouchableOpacity onPress={() => openSensorModal(s)} style={styles.iconBtn}>
                        <Text>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteSensor(s.id)} style={styles.iconBtn}>
                        <Text>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={styles.sCardReading}>{s.reading} <Text style={styles.sCardUnit}>{s.unit}</Text></Text>
                  {s.notes ? <Text style={styles.sCardNotes}>"{s.notes}"</Text> : null}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* SECTION 3: Farm Context Inputs */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.collapsibleHeader} 
            onPress={() => setShowFarmContext(!showFarmContext)}
          >
            <Text style={styles.sectionTitle}>Farm Context (Optional)</Text>
            <Text style={styles.collapseIcon}>{showFarmContext ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          
          {showFarmContext && (
            <View style={styles.collapsibleContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Crop / Livestock Type</Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g., Chili, Tilapia" 
                  placeholderTextColor={themeColors.subtext}
                  value={farmContext.cropType}
                  onChangeText={(v) => saveContext({...farmContext, cropType: v})}
                />
              </View>

              <CustomDropdown
                label="Farm Type"
                options={FARM_TYPES}
                selected={farmContext.farmType}
                onSelect={(val: string) => saveContext({...farmContext, farmType: val})}
                themeColors={themeColors}
                styles={styles}
              />

              <CustomDropdown
                label="Growth Stage"
                options={GROWTH_STAGES}
                selected={farmContext.growthStage}
                onSelect={(val: string) => saveContext({...farmContext, growthStage: val})}
                themeColors={themeColors}
                styles={styles}
              />

              <View style={styles.inputGroup}>
                <View style={styles.locationLabelRow}>
                  <Text style={styles.label}>Location</Text>
                  <TouchableOpacity onPress={handleGetLocation}>
                    <Text style={styles.linkText}>Use My Location</Text>
                  </TouchableOpacity>
                </View>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g., Cameron Highlands, Pahang" 
                  placeholderTextColor={themeColors.subtext}
                  value={farmContext.location}
                  onChangeText={(v) => saveContext({...farmContext, location: v})}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Recent Observations</Text>
                <TextInput 
                  style={[styles.input, styles.textArea]} 
                  placeholder="Any signs of pests, wilting, or unusual growth?" 
                  placeholderTextColor={themeColors.subtext}
                  multiline
                  numberOfLines={3}
                  value={farmContext.observations}
                  onChangeText={(v) => saveContext({...farmContext, observations: v})}
                />
              </View>
            </View>
          )}
        </View>

        {/* SECTION 5: Past Reports */}
        {reports.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.collapsibleHeader} 
              onPress={() => setShowPastReports(!showPastReports)}
            >
              <Text style={styles.sectionTitle}>Past Reports ({reports.length})</Text>
              <Text style={styles.collapseIcon}>{showPastReports ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {showPastReports && (
              <View style={styles.collapsibleContent}>
                {reports.map((r, i) => (
                  <TouchableOpacity 
                    key={r.id} 
                    style={styles.reportItem}
                    onPress={() => setAnalysisResult(r.content)} // Just opens the result view
                  >
                    <Text style={styles.reportTime}>{new Date(r.timestamp).toLocaleString()}</Text>
                    <Text numberOfLines={2} style={styles.reportPreview}>{r.content.substring(0, 100)}...</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* SECTION 4: Analyze Button */}
      {!analysisResult && (
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.analyzeBtn, sensors.length === 0 && styles.analyzeBtnDisabled]} 
            disabled={sensors.length === 0 || analyzing}
            onPress={handleAnalyze}
          >
            {analyzing ? (
               <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.analyzeBtnText}>✨ Analyze with Gemini</Text>
            )}
          </TouchableOpacity>
          {sensors.length === 0 && (
            <Text style={styles.footerHint}>Add at least one sensor to analyze.</Text>
          )}
        </View>
      )}

      {/* RESULT MODAL / OVERLAY */}
      <Modal visible={!!analysisResult} transparent animationType="slide">
        <View style={styles.resultModalOverlay}>
          <View style={styles.resultModalContent}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultHeaderTitle}>Analysis Report</Text>
              <TouchableOpacity onPress={() => setAnalysisResult(null)}>
                <Text style={styles.closeBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.resultScroll}>
               <Text style={styles.resultMarkdown}>{analysisResult}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ADD SENSOR MODAL */}
      <Modal visible={showSensorModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingSensorId ? 'Edit Sensor' : 'Add Sensor'}</Text>
              <TouchableOpacity onPress={() => setShowSensorModal(false)}>
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
                styles={styles}
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

            <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveSensor}>
              <Text style={styles.modalSaveBtnText}>Save Sensor Data</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// --- STYLES ---
const getStyles = (themeColors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  hardwareBtn: {
    padding: 16,
    borderWidth: 1,
    borderColor: themeColors.accent,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: themeColors.background,
  },
  hardwareBtnText: {
    color: themeColors.accent,
    fontWeight: '700',
    fontSize: 16,
  },
  section: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  collapseIcon: {
    color: themeColors.subtext,
    fontSize: 14,
  },
  sectionTitle: {
    color: themeColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  addBtnText: {
    color: themeColors.accent,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: themeColors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  emptySubText: {
    color: themeColors.subtext,
    fontSize: 14,
    textAlign: 'center',
  },
  sensorList: {
    gap: 8,
    marginTop: 8,
  },
  sensorCard: {
    backgroundColor: themeColors.background,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  sensorCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  sCardName: {
    color: themeColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  sCardType: {
    color: themeColors.subtext,
    fontSize: 14,
    marginTop: 2,
  },
  sCardActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  sCardReading: {
    color: themeColors.text,
    fontSize: 24,
    fontWeight: '700',
    marginVertical: 4,
  },
  sCardUnit: {
    fontSize: 16,
    fontWeight: '400',
    color: themeColors.subtext,
  },
  sCardNotes: {
    color: themeColors.subtext,
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
  },
  collapsibleContent: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
    paddingTop: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: themeColors.subtext,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    color: themeColors.text,
    padding: 12,
    fontSize: 16,
  },
  inputText: {
    color: themeColors.text,
    fontSize: 16,
  },
  placeholderText: {
    color: themeColors.subtext,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  rowInputs: {
    flexDirection: 'row',
  },
  locationLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkText: {
    color: themeColors.accent,
    fontSize: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: themeColors.background,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  analyzeBtn: {
    backgroundColor: themeColors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  analyzeBtnDisabled: {
    backgroundColor: themeColors.border,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  footerHint: {
    color: themeColors.subtext,
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
  dropdownButton: {
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    padding: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  dropdownModalContainer: {
    backgroundColor: themeColors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: themeColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtnText: {
    color: themeColors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  dropdownOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  dropdownOptionText: {
    color: themeColors.text,
    fontSize: 16,
  },
  dropdownOptionSelected: {
    color: themeColors.accent,
    fontWeight: '700',
  },
  reportItem: {
    padding: 16,
    backgroundColor: themeColors.background,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  reportTime: {
    color: themeColors.subtext,
    fontSize: 12,
    marginBottom: 4,
  },
  reportPreview: {
    color: themeColors.text,
    fontSize: 14,
  },
  resultModalOverlay: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  resultModalContent: {
    flex: 1,
    backgroundColor: themeColors.background,
    marginTop: 40,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
    backgroundColor: themeColors.card,
  },
  resultHeaderTitle: {
    color: themeColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  resultScroll: {
    padding: 20,
  },
  resultMarkdown: {
    color: themeColors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  modalContainer: {
    backgroundColor: themeColors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    height: '85%',
  },
  modalBody: {
    flex: 1,
  },
  modalSaveBtn: {
    backgroundColor: themeColors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  modalSaveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
