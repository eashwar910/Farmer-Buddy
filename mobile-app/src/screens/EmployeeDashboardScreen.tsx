import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Animated,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useShift } from '../hooks/useShift';
import { usePresence } from '../hooks/usePresence';
import EmployeeStreaming from '../components/EmployeeStreaming';
import { useAppContext } from '../context/AppContext';

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function EmployeeDashboardScreen({ navigation }: any) {
  const { profile, signOut } = useAuth();
  const { activeShift, elapsedSeconds } = useShift();
  const { themeColors, t } = useAppContext();
  usePresence(profile?.id, profile?.name, profile?.role);

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftEndedModal, setShiftEndedModal] = useState(false);
  const prevShiftRef = useRef<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Detect shift start/end transitions for modals
  useEffect(() => {
    const currentShiftId = activeShift?.id ?? null;
    const prevShiftId = prevShiftRef.current;

    if (currentShiftId && !prevShiftId) {
      // Shift just started
      setShowShiftModal(true);
      setShiftEndedModal(false);
    } else if (!currentShiftId && prevShiftId) {
      // Shift just ended
      setShowShiftModal(false);
      setShiftEndedModal(true);
    }

    prevShiftRef.current = currentShiftId;
  }, [activeShift?.id]);

  // Pulse animation for the live dot
  useEffect(() => {
    if (activeShift) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [activeShift, pulseAnim]);

  const handleSignOut = () => {
    Alert.alert(t('Sign Out'), t('Are you sure you want to sign out?'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Sign Out'), style: 'destructive', onPress: signOut },
    ]);
  };

  const styles = getStyles(themeColors);

  return (
    <SafeAreaView style={styles.safeArea}>
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.greeting}>{t('welcome')},</Text>
          <Text style={styles.name}>{profile?.name || 'Employee'}</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>{t('Sign Out')}</Text>
        </TouchableOpacity>
      </View>

      {/* Shift Status */}
      {activeShift ? (
        <View style={styles.activeShiftCard}>
          <View style={styles.shiftStatusRow}>
            <View style={styles.liveIndicator}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.liveText}>{t('SHIFT ACTIVE')}</Text>
            </View>
          </View>
          <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
          <Text style={styles.shiftSubtext}>
            {t('Your shift is in progress. Start streaming your camera below.')}
          </Text>

          <EmployeeStreaming
            shiftId={activeShift.id}
            employeeName={profile?.name || 'Employee'}
          />
        </View>
      ) : (
        <View style={styles.idleCard}>
          <View style={styles.idleStatusRow}>
            <View style={styles.idleDot} />
            <Text style={styles.idleText}>{t('No Active Shift')}</Text>
          </View>
          <Text style={styles.idleSubtext}>
            {t("Your manager will start a shift when it's time. You'll be notified instantly.")}
          </Text>
        </View>
      )}

      {/* Shift Started Modal */}
      <Modal
        visible={showShiftModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowShiftModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>▶️</Text>
            <Text style={styles.modalTitle}>{t('Shift Started!')}</Text>
            <Text style={styles.modalText}>
              {t('Your manager has started a new shift. Press "Start Streaming" to begin your camera feed.')}
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowShiftModal(false)}
            >
              <Text style={styles.modalButtonText}>{t('Got it')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Shift Ended Modal */}
      <Modal
        visible={shiftEndedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShiftEndedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalIcon}>⏹️</Text>
            <Text style={styles.modalTitle}>{t('Shift Ended')}</Text>
            <Text style={styles.modalText}>
              {t('Your manager has ended the shift. You can relax now.')}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonSecondary]}
              onPress={() => setShiftEndedModal(false)}
            >
              <Text style={styles.modalButtonText}>{t('OK')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  greeting: {
    fontSize: 14,
    color: themeColors.subtext,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
  },
  signOutBtn: {
    backgroundColor: themeColors.card,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  // Active Shift Card
  activeShiftCard: {
    backgroundColor: themeColors.background, // fallback for dark mode specific tint
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: themeColors.accent,
    marginBottom: 24,
  },
  shiftStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: themeColors.accent,
    marginRight: 8,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '700',
    color: themeColors.accent,
    letterSpacing: 1,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    color: themeColors.text,
    textAlign: 'center',
    marginVertical: 16,
    fontVariant: ['tabular-nums'],
  },
  shiftSubtext: {
    fontSize: 14,
    color: themeColors.subtext,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  // Idle Card
  idleCard: {
    backgroundColor: themeColors.card,
    marginHorizontal: 24,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  idleStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  idleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: themeColors.border,
    marginRight: 8,
  },
  idleText: {
    fontSize: 18,
    fontWeight: '600',
    color: themeColors.subtext,
  },
  idleSubtext: {
    fontSize: 14,
    color: themeColors.subtext,
    lineHeight: 20,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: themeColors.card,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: themeColors.border,
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: themeColors.text,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: themeColors.subtext,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: themeColors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: themeColors.border,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
