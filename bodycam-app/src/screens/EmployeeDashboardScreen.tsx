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
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useShift } from '../hooks/useShift';
import { usePresence } from '../hooks/usePresence';
import EmployeeStreaming from '../components/EmployeeStreaming';

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function EmployeeDashboardScreen() {
  const { profile, signOut } = useAuth();
  const { activeShift, elapsedSeconds } = useShift();
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
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.name}>{profile?.name || 'Employee'}</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Shift Status */}
      {activeShift ? (
        <View style={styles.activeShiftCard}>
          <View style={styles.shiftStatusRow}>
            <View style={styles.liveIndicator}>
              <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
              <Text style={styles.liveText}>SHIFT ACTIVE</Text>
            </View>
          </View>
          <Text style={styles.timerText}>{formatTime(elapsedSeconds)}</Text>
          <Text style={styles.shiftSubtext}>
            Your shift is in progress. Start streaming your camera below.
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
            <Text style={styles.idleText}>No Active Shift</Text>
          </View>
          <Text style={styles.idleSubtext}>
            Your manager will start a shift when it's time. You'll be notified instantly.
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
            <Text style={styles.modalIcon}>�</Text>
            <Text style={styles.modalTitle}>Shift Started!</Text>
            <Text style={styles.modalText}>
              Your manager has started a new shift. Press "Start Streaming" to begin your camera feed.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowShiftModal(false)}
            >
              <Text style={styles.modalButtonText}>Got it</Text>
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
            <Text style={styles.modalIcon}>�</Text>
            <Text style={styles.modalTitle}>Shift Ended</Text>
            <Text style={styles.modalText}>
              Your manager has ended the shift. You can relax now.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonSecondary]}
              onPress={() => setShiftEndedModal(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingTop: 60,
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
    color: '#94A3B8',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  signOutBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  // Active Shift Card
  activeShiftCard: {
    backgroundColor: '#0D2818',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#22C55E',
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
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  liveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#22C55E',
    letterSpacing: 1,
  },
  timerText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginVertical: 16,
    fontVariant: ['tabular-nums'],
  },
  shiftSubtext: {
    fontSize: 14,
    color: '#86EFAC',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  // Idle Card
  idleCard: {
    backgroundColor: '#1E293B',
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#334155',
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
    backgroundColor: '#475569',
    marginRight: 8,
  },
  idleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94A3B8',
  },
  idleSubtext: {
    fontSize: 14,
    color: '#64748B',
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
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  modalButtonSecondary: {
    backgroundColor: '#3B82F6',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
