import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppContext } from '../context/AppContext';

export default function LeafDetectionScreen() {
  const { themeColors, t } = useAppContext();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [diseaseName, setDiseaseName] = useState(t('No result yet'));
  const [confidenceScore, setConfidenceScore] = useState('-');
  const [statusMessage, setStatusMessage] = useState('');
  const [diseaseStatus, setDiseaseStatus] = useState('-');
  const [probabilities, setProbabilities] = useState<{ label: string; score: number }[]>([]);

  const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
  const DECISION_CONFIDENCE_THRESHOLD = 0.6;
  const baseURL = "https://moazx-plant-leaf-diseases-detection-using-cnn.hf.space";

  const pickImage = async () => {
    // No permissions request is necessary for launching the image library
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1, // High quality
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_BYTES) {
        setStatusMessage(`${t('File is too large')}. Maximum allowed size is ${Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB.`);
        return;
      }
      setImageUri(asset.uri);
      
      // Reset state
      setDiseaseName(t('No result yet'));
      setConfidenceScore('-');
      setDiseaseStatus('-');
      setProbabilities([]);
      setStatusMessage('');
    }
  };

  const fileUriToBase64 = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const callHFSpaceAPI = async (uri: string) => {
    console.log("Attempting API call...");
    try {
      const fileData = await fileUriToBase64(uri);
      const submitResponse = await fetch(`${baseURL}/api/queue/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [fileData], fn_index: 0 }),
      });

      if (!submitResponse.ok) {
        console.log("Queue submit failed, trying alternative /predict endpoint...");
        const altResponse = await fetch(`${baseURL}/api/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: [fileData] }),
        });

        if (!altResponse.ok) {
          throw new Error("Both endpoints failed.");
        }

        const data = await altResponse.json();
        return data;
      }

      const queueResponse = await submitResponse.json();
      
      if (queueResponse?.hash) {
        let pollCount = 0;
        const maxPolls = 60; // 60 second timeout

        while (pollCount < maxPolls) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const statusResponse = await fetch(`${baseURL}/api/queue/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hash: queueResponse.hash }),
          });

          if (statusResponse.ok) {
            const status = await statusResponse.json();
            if (status?.data) {
              return { data: status.data };
            }
          }
          pollCount++;
        }
        throw new Error("Polling timeout.");
      }
      return { data: queueResponse?.data || queueResponse };
    } catch (error) {
      console.error("Direct API call failed:", error);
      throw error;
    }
  };

  const detectDisease = async () => {
    if (!imageUri) {
      setStatusMessage(t('Please select an image first.'));
      return;
    }

    setIsProcessing(true);
    setStatusMessage(t('Connecting to AI Analysis...'));
    setDiseaseName(t('Processing...'));
    setConfidenceScore("-");
    setProbabilities([]);

    try {
      const result = await callHFSpaceAPI(imageUri);
      let rawOutput = null;

      if (result?.data !== undefined) {
        rawOutput = Array.isArray(result.data) ? result.data[0] : result.data;
      } else if (Array.isArray(result)) {
        rawOutput = result[0];
      } else {
        rawOutput = result;
      }

      let parsedPredictions: any[] = [];
      if (Array.isArray(rawOutput)) {
        parsedPredictions = rawOutput;
      } else if (typeof rawOutput === 'string') {
        try {
          const parsed = JSON.parse(rawOutput);
          parsedPredictions = Array.isArray(parsed) ? parsed : (parsed?.data && Array.isArray(parsed.data)) ? parsed.data : [parsed];
        } catch {
          setDiseaseName(rawOutput);
          setConfidenceScore("N/A");
          setStatusMessage(t('Prediction completed.'));
          setIsProcessing(false);
          return;
        }
      } else if (typeof rawOutput === "object" && rawOutput !== null) {
        if (Array.isArray(rawOutput.confidences)) {
          parsedPredictions = rawOutput.confidences.map((c: any) => ({
            label: c.label,
            score: c.confidence !== undefined ? c.confidence : (c.score || 0)
          }));
        } else if (rawOutput.label !== undefined || rawOutput.score !== undefined) {
          parsedPredictions = [rawOutput];
        } else if (rawOutput.predictions !== undefined) {
          parsedPredictions = rawOutput.predictions;
        } else {
          setDiseaseName("Unexpected output");
          setIsProcessing(false);
          return;
        }
      }

      if (!parsedPredictions || parsedPredictions.length === 0) {
        setDiseaseName("No prediction returned");
        setIsProcessing(false);
        return;
      }

      const topPrediction = parsedPredictions[0];
      const topLabel = formatLabel(topPrediction.label || "Unknown");
      const topConfidence = ((topPrediction.score || 0) * 100).toFixed(2) + "%";

      setDiseaseName(topLabel);
      setConfidenceScore(topConfidence);
      setStatusMessage(t('Prediction completed successfully.'));
      setDiseaseStatus(decideDiseaseStatus(topPrediction.label, topPrediction.score));
      setProbabilities(parsedPredictions);

    } catch (error: any) {
      setStatusMessage(`${t('Failed to call AI API')}: ${error.message || String(error)}`);
      setDiseaseName("Error");
    } finally {
      setIsProcessing(false);
    }
  };

  const formatLabel = (label: string) => {
    return String(label)
      .replace(/_/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  };

  const decideDiseaseStatus = (label: string, score: number) => {
    if (label == null) return t('Uncertain');
    const l = String(label).toLowerCase();
    const isHealthyLabel = l.includes('healthy') || l.includes('normal');

    if (isHealthyLabel) {
      if (score >= DECISION_CONFIDENCE_THRESHOLD) return t('Healthy');
      return t('Uncertain');
    }
    if (score >= DECISION_CONFIDENCE_THRESHOLD) return t('Diseased');
    return t('Uncertain');
  };

  const styles = getStyles(themeColors);

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.uploadSection}>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickImage} disabled={isProcessing}>
            <Text style={styles.uploadBtnText}>{t('Select Leaf Image')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.previewWrapper}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.leafPreview} resizeMode="cover" />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Text style={styles.placeholderIcon}>📷</Text>
              <Text style={styles.placeholderText}>{t('Image preview will appear here')}</Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.detectBtn, isProcessing && styles.detectBtnDisabled]} 
            onPress={detectDisease} 
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.detectBtnText}>{t('Detect Disease')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {statusMessage ? (
          <Text style={styles.statusMessage}>{statusMessage}</Text>
        ) : null}

        <View style={styles.resultCard}>
          <Text style={styles.resultHeader}>{t('Detection Results')}</Text>
          
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>{t('Disease/Condition')}:</Text>
            <Text style={styles.resultValue}>{diseaseName}</Text>
          </View>
          
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>{t('Confidence Score')}:</Text>
            <Text style={styles.resultValue}>{confidenceScore}</Text>
          </View>
          
          <View style={styles.resultRow}>
            <Text style={styles.resultLabel}>{t('Status')}:</Text>
            <Text style={[styles.resultValue, diseaseStatus === t('Healthy') ? styles.textGreen : (diseaseStatus === t('Diseased') ? styles.textRed : undefined)]}>
              {diseaseStatus}
            </Text>
          </View>

          {probabilities.length > 0 && (
            <View style={styles.probabilitiesBox}>
              <Text style={styles.probabilitiesHeader}>{t('All Predictions')}:</Text>
              {probabilities.map((prob, index) => {
                const label = formatLabel(prob.label || "Unknown");
                const score = (prob.score || 0) * 100;
                return (
                  <View key={index} style={styles.probabilityItem}>
                    <View style={styles.probabilityHeaderRow}>
                      <Text style={styles.probabilityLabel}>{label}</Text>
                      <Text style={styles.probabilityScore}>{score.toFixed(2)}%</Text>
                    </View>
                    <View style={styles.probabilityBarBg}>
                      <View style={[styles.probabilityBarFill, { width: `${score}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
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
    padding: 24,
  },
  uploadSection: {
    marginBottom: 20,
    alignItems: 'center',
  },
  uploadBtn: {
    backgroundColor: themeColors.border,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  uploadBtnText: {
    color: themeColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  previewWrapper: {
    width: '100%',
    height: 300,
    backgroundColor: themeColors.card,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: themeColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leafPreview: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  placeholderText: {
    color: themeColors.subtext,
    fontSize: 16,
  },
  actions: {
    marginBottom: 20,
  },
  detectBtn: {
    backgroundColor: themeColors.accent,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  detectBtnDisabled: {
    opacity: 0.7,
  },
  detectBtnText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  statusMessage: {
    color: themeColors.subtext,
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: themeColors.card,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  resultHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 16,
  },
  resultRow: {
    marginBottom: 12,
  },
  resultLabel: {
    color: themeColors.subtext,
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '500',
  },
  resultValue: {
    color: themeColors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  textGreen: {
    color: themeColors.accent,
  },
  textRed: {
    color: '#EF4444', // Kept hardcoded but matching the theme requirement for actual alert colors, or can use theme if defined. 
  },
  probabilitiesBox: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: themeColors.border,
  },
  probabilitiesHeader: {
    color: themeColors.text,
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 12,
  },
  probabilityItem: {
    marginBottom: 12,
  },
  probabilityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  probabilityLabel: {
    color: themeColors.subtext,
    fontSize: 14,
  },
  probabilityScore: {
    color: themeColors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  probabilityBarBg: {
    height: 8,
    backgroundColor: themeColors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  probabilityBarFill: {
    height: '100%',
    backgroundColor: themeColors.accent,
    borderRadius: 4,
  },
});
