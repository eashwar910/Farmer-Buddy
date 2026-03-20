/**
 * src/screens/LeafDetectionScreen.tsx
 * ────────────────────────────────────
 * Leaf disease detection powered by Gemini Vision API.
 * Replaces the unreliable HuggingFace Gradio space which goes to sleep.
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Image, ScrollView, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';
import { GEMINI_API_KEY } from '@env';

const LEAF_PROMPT = `You are an expert plant pathologist. Analyze this plant leaf image carefully.

Respond ONLY with a valid JSON object in this exact format (no markdown, no extra text):
{
  "disease_name": "Name of disease or condition (use 'Healthy' if no disease found)",
  "confidence": 0.95,
  "status": "Healthy" or "Diseased" or "Uncertain",
  "description": "Brief 1-2 sentence description of the condition and recommended action",
  "all_observations": [
    { "label": "Observation name", "likelihood": 0.95 },
    { "label": "Another observation", "likelihood": 0.03 }
  ]
}

Focus on: disease symptoms, leaf color, spots, lesions, wilting, or any abnormalities visible.`;

async function uriToBase64(uri: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const [header, data] = dataUrl.split(',');
      const mimeType = header.replace('data:', '').replace(';base64', '');
      resolve({ data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const MODELS_TO_TRY = [
  'gemini-3.1-flash-lite',
  'gemini-3',
  'gemini-3.1-pro'
];

async function analyzeWithGemini(uri: string) {
  const { data, mimeType } = await uriToBase64(uri);

  const body = {
    contents: [{
      parts: [
        { text: LEAF_PROMPT },
        { inline_data: { mime_type: mimeType, data } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
  };

  let lastError: any;

  for (const model of MODELS_TO_TRY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Gemini API error ${res.status} (${model}): ${errText}`);
      }

      const json = await res.json();
      const text: string = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      // Strip markdown code fences if Gemini wraps the JSON
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned);
    } catch (err: any) {
      console.warn(`[Gemini Fallback] Leaf Detection: ${model} failed`, err.message);
      lastError = err;
    }
  }

  throw lastError;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Prediction {
  label: string;
  likelihood: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function LeafDetectionScreen() {
  const { themeColors, t } = useAppContext();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [diseaseName, setDiseaseName] = useState('No result yet');
  const [confidence, setConfidence] = useState('-');
  const [status, setStatus] = useState('-');
  const [description, setDescription] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [statusMessage, setStatusMessage] = useState('');

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      setStatusMessage('File too large. Maximum size is 5 MB.');
      return;
    }
    setImageUri(asset.uri);
    setDiseaseName('No result yet');
    setConfidence('-');
    setStatus('-');
    setDescription('');
    setPredictions([]);
    setStatusMessage('');
  };

  const detectDisease = async () => {
    if (!imageUri) {
      setStatusMessage('Please select an image first.');
      return;
    }
    setIsProcessing(true);
    setStatusMessage('Analysing with Gemini Vision AI…');
    setDiseaseName('Processing…');

    try {
      const result = await analyzeWithGemini(imageUri);
      setDiseaseName(result.disease_name ?? 'Unknown');
      setConfidence(
        result.confidence != null
          ? `${(result.confidence * 100).toFixed(1)}%`
          : 'N/A',
      );
      setStatus(result.status ?? 'Uncertain');
      setDescription(result.description ?? '');
      setPredictions(result.all_observations ?? []);
      setStatusMessage('Analysis complete.');
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Analysis failed. Please try again.'}`);
      setDiseaseName('Error');
      setStatus('-');
    } finally {
      setIsProcessing(false);
    }
  };

  const styles = getStyles(themeColors);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Image picker */}
        <View style={styles.uploadSection}>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickImage} disabled={isProcessing}>
            <Text style={styles.uploadBtnText}>Select Leaf Image</Text>
          </TouchableOpacity>
        </View>

        {/* Preview */}
        <View style={styles.previewWrapper}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.leafPreview} resizeMode="cover" />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.placeholderIcon}>📷</Text>
              <Text style={styles.placeholderText}>Image preview will appear here</Text>
            </View>
          )}
        </View>

        {/* Detect button */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.detectBtn, isProcessing && styles.detectBtnDisabled]}
            onPress={detectDisease}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.detectBtnText}>Detect Disease</Text>
            )}
          </TouchableOpacity>
        </View>

        {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}

        {/* Results card */}
        <View style={styles.resultCard}>
          <Text style={styles.resultHeader}>Detection Results</Text>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Disease / Condition:</Text>
            <Text style={styles.resultValue}>{diseaseName}</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Confidence:</Text>
            <Text style={styles.resultValue}>{confidence}</Text>
          </View>

          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>Status:</Text>
            <Text style={[
              styles.resultValue,
              status === 'Healthy' ? styles.textGreen : status === 'Diseased' ? styles.textRed : undefined,
            ]}>
              {status}
            </Text>
          </View>

          {description ? (
            <View style={styles.descRow}>
              <Text style={styles.resultLabel}>Recommendation:</Text>
              <Text style={styles.descText}>{description}</Text>
            </View>
          ) : null}

          {predictions.length > 0 && (
            <View style={styles.probabilitiesBox}>
              <Text style={styles.probabilitiesHeader}>All Observations:</Text>
              {predictions.map((p, i) => {
                const pct = (p.likelihood * 100);
                return (
                  <View key={i} style={styles.probabilityItem}>
                    <View style={styles.probabilityHeaderRow}>
                      <Text style={styles.probabilityLabel}>{p.label}</Text>
                      <Text style={styles.probabilityScore}>{pct.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.probabilityBarBg}>
                      <View style={[styles.probabilityBarFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.poweredBy}>⚡ Powered by Gemini Vision AI</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const getStyles = (themeColors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: themeColors.background },
  scrollContent: { padding: 24 },
  uploadSection: { marginBottom: 20, alignItems: 'center' },
  uploadBtn: {
    backgroundColor: themeColors.border,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  uploadBtnText: { color: themeColors.text, fontSize: 16, fontWeight: '600' },
  previewWrapper: {
    width: '100%', height: 300,
    backgroundColor: themeColors.card,
    borderRadius: 12, overflow: 'hidden',
    marginBottom: 24, borderWidth: 1,
    borderColor: themeColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  leafPreview: { width: '100%', height: '100%' },
  previewPlaceholder: { alignItems: 'center' },
  placeholderIcon: { fontSize: 48, marginBottom: 12 },
  placeholderText: { color: themeColors.subtext, fontSize: 16 },
  actions: { marginBottom: 20 },
  detectBtn: {
    backgroundColor: themeColors.accent,
    paddingVertical: 16, borderRadius: 8, alignItems: 'center',
  },
  detectBtnDisabled: { opacity: 0.7 },
  detectBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  statusMessage: {
    color: themeColors.subtext, textAlign: 'center',
    marginBottom: 20, fontSize: 14,
  },
  resultCard: {
    backgroundColor: themeColors.card,
    borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: themeColors.border,
  },
  resultHeader: {
    fontSize: 20, fontWeight: '700',
    color: themeColors.text, marginBottom: 16,
  },
  resultRow: { marginBottom: 12 },
  resultLabel: {
    color: themeColors.subtext, fontSize: 14,
    marginBottom: 4, fontWeight: '500',
  },
  resultValue: { color: themeColors.text, fontSize: 18, fontWeight: '600' },
  textGreen: { color: themeColors.accent },
  textRed: { color: '#EF4444' },
  descRow: { marginBottom: 12 },
  descText: { color: themeColors.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  probabilitiesBox: {
    marginTop: 20, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: themeColors.border,
  },
  probabilitiesHeader: {
    color: themeColors.text, fontWeight: '600',
    fontSize: 16, marginBottom: 12,
  },
  probabilityItem: { marginBottom: 12 },
  probabilityHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4,
  },
  probabilityLabel: { color: themeColors.subtext, fontSize: 14 },
  probabilityScore: { color: themeColors.subtext, fontSize: 14, fontWeight: '600' },
  probabilityBarBg: {
    height: 8, backgroundColor: themeColors.border,
    borderRadius: 4, overflow: 'hidden',
  },
  probabilityBarFill: {
    height: '100%', backgroundColor: themeColors.accent, borderRadius: 4,
  },
  poweredBy: {
    marginTop: 16, textAlign: 'center',
    color: themeColors.subtext, fontSize: 12, fontStyle: 'italic',
  },
});
