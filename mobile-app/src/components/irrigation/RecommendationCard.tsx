import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

export interface BuddyResult {
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

interface RecommendationCardProps {
  buddyResult: BuddyResult | null;
  onApply: () => void;
  themeColors: any;
}

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

export function RecommendationCard({ buddyResult, onApply, themeColors }: RecommendationCardProps) {
  if (!buddyResult) return null;
  const styles = getStyles(themeColors);
  return (
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
            <TouchableOpacity style={styles.applyBtn} onPress={onApply}>
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
  );
}

function getStyles(themeColors: any) { return StyleSheet.create({
  resultCard: {
    backgroundColor: themeColors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themeColors.border,
    marginTop: 20,
    overflow: 'hidden',
  },
  resultSection: { padding: 16 },
  resultSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  resultSectionTitle: { fontSize: 10, color: themeColors.faint, letterSpacing: 1.2, fontFamily: 'Satoshi-Regular' },
  resultBody: { fontSize: 14, color: themeColors.text, lineHeight: 21, fontFamily: 'Satoshi-Regular' },
  resultDivider: { height: 1, backgroundColor: themeColors.border, marginHorizontal: 16 },
  applyBtn: { margin: 16, backgroundColor: themeColors.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  applyBtnText: { color: themeColors.textOnAccent, fontWeight: '700', fontSize: 15, fontFamily: 'CabinetGrotesk-Bold' },
}); }
