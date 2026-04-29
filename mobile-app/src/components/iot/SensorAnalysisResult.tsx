import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';

interface SensorAnalysisResultProps {
  analysisResult: string | null;
  onClose: () => void;
  themeColors: any;
}

export function SensorAnalysisResult({ analysisResult, onClose, themeColors }: SensorAnalysisResultProps) {
  const styles = getStyles(themeColors);
  return (
    <Modal visible={!!analysisResult} transparent animationType="slide">
      <View style={styles.resultModalOverlay}>
        <View style={styles.resultModalContent}>
          <View style={styles.resultHeader}>
            <Text style={styles.resultHeaderTitle}>Analysis Report</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.resultScroll}>
            <Text style={styles.resultMarkdown}>{analysisResult}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  resultModalOverlay: { flex: 1, backgroundColor: themeColors.background },
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
  resultHeaderTitle: { color: themeColors.text, fontSize: 18, fontWeight: '700' },
  closeBtnText: { color: themeColors.accent, fontSize: 16, fontWeight: '600' },
  resultScroll: { padding: 20 },
  resultMarkdown: { color: themeColors.text, fontSize: 16, lineHeight: 24 },
});
