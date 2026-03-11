import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

interface RecordingSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  employeeName: string;
  summary: string | null;
  loading: boolean;
}

export default function RecordingSummaryModal({
  visible,
  onClose,
  employeeName,
  summary,
  loading,
}: RecordingSummaryModalProps) {
  // Try to parse summary as JSON (handle double-stringified or markdown-wrapped JSON)
  let parsedSummary: any = null;
  try {
    if (summary) {
      let rawStr = summary.trim();
      // Strip markdown code fences if AI wrapped JSON in ```json ... ```
      if (rawStr.startsWith('```')) {
        rawStr = rawStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      }
      let firstParse = JSON.parse(rawStr);
      // Handle double-stringified: if the result is still a string, parse again
      if (typeof firstParse === 'string') {
        parsedSummary = JSON.parse(firstParse);
      } else {
        parsedSummary = firstParse;
      }
    }
  } catch {
    // If not valid JSON, display as raw text
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.modalTitle}>AI Summary</Text>
              <Text style={styles.employeeText}>{employeeName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={true}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.loadingText}>Analyzing video...</Text>
              </View>
            ) : !summary ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>🤖</Text>
                <Text style={styles.emptyText}>No summary available yet</Text>
                <Text style={styles.emptySubtext}>
                  The AI is still processing this recording. Check back in a moment.
                </Text>
              </View>
            ) : parsedSummary ? (
              <View style={styles.summaryContent}>
                {/* Executive Summary */}
                {parsedSummary.executive_summary && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📋 Executive Summary</Text>
                    <Text style={styles.sectionText}>{parsedSummary.executive_summary}</Text>
                  </View>
                )}

                {/* Timeline */}
                {parsedSummary.timeline && parsedSummary.timeline.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>⏱️ Timeline</Text>
                    {parsedSummary.timeline.map((item: any, index: number) => (
                      <View key={index} style={styles.timelineItem}>
                        <Text style={styles.timelineTime}>{item.time_estimate || item.frame_range}</Text>
                        <Text style={styles.timelineActivity}>{item.activity}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Notable Events */}
                {parsedSummary.notable_events && parsedSummary.notable_events.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>⭐ Notable Events</Text>
                    {parsedSummary.notable_events.map((event: any, index: number) => (
                      <View key={index} style={styles.eventItem}>
                        <Text style={styles.eventTime}>{event.time_estimate}</Text>
                        <Text style={styles.eventDescription}>{event.description}</Text>
                        {event.significance && (
                          <Text style={styles.eventSignificance}>→ {event.significance}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Safety & Compliance */}
                {parsedSummary.safety_compliance && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🛡️ Safety & Compliance</Text>

                    {parsedSummary.safety_compliance.concerns &&
                      parsedSummary.safety_compliance.concerns.length > 0 && (
                        <View style={styles.subsection}>
                          <Text style={styles.subsectionTitle}>⚠️ Concerns:</Text>
                          {parsedSummary.safety_compliance.concerns.map((concern: string, index: number) => (
                            <Text key={index} style={styles.concernText}>• {concern}</Text>
                          ))}
                        </View>
                      )}

                    {parsedSummary.safety_compliance.positive_observations &&
                      parsedSummary.safety_compliance.positive_observations.length > 0 && (
                        <View style={styles.subsection}>
                          <Text style={styles.subsectionTitle}>✅ Positive Observations:</Text>
                          {parsedSummary.safety_compliance.positive_observations.map((obs: string, index: number) => (
                            <Text key={index} style={styles.positiveText}>• {obs}</Text>
                          ))}
                        </View>
                      )}
                  </View>
                )}

                {/* Overall Assessment */}
                {parsedSummary.overall_assessment && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📊 Overall Assessment</Text>
                    <Text style={styles.sectionText}>{parsedSummary.overall_assessment}</Text>
                  </View>
                )}
              </View>
            ) : (
              // Raw text fallback
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>AI Summary</Text>
                <Text style={styles.rawText}>{summary}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  employeeText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#94A3B8',
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#94A3B8',
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 15,
    color: '#CBD5E1',
    lineHeight: 22,
  },
  timelineItem: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 4,
  },
  timelineActivity: {
    fontSize: 14,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  eventItem: {
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  eventTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
    marginBottom: 4,
  },
  eventDescription: {
    fontSize: 14,
    color: '#E2E8F0',
    marginBottom: 4,
    lineHeight: 20,
  },
  eventSignificance: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  subsection: {
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  concernText: {
    fontSize: 14,
    color: '#FCA5A5',
    marginBottom: 4,
    lineHeight: 20,
  },
  positiveText: {
    fontSize: 14,
    color: '#86EFAC',
    marginBottom: 4,
    lineHeight: 20,
  },
  rawText: {
    fontSize: 14,
    color: '#CBD5E1',
    lineHeight: 22,
    fontFamily: 'monospace',
  },
});
