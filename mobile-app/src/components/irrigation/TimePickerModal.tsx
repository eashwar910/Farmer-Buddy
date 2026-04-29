import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList } from 'react-native';

import { format12h } from './IrrigationForm';

interface TimePickerModalProps {
  visible: boolean;
  selectedTime: string;
  timeSlots: string[];
  overnightAllowed: boolean;
  onSelect: (time: string) => void;
  onClose: () => void;
  themeColors: any;
}

export function TimePickerModal({
  visible,
  selectedTime,
  timeSlots,
  overnightAllowed,
  onSelect,
  onClose,
  themeColors,
}: TimePickerModalProps) {
  const styles = getStyles(themeColors);
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Time</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.pickerDone}>Done</Text>
            </TouchableOpacity>
          </View>
          {!overnightAllowed && (
            <Text style={styles.pickerHint}>
              Irrigation works best in daylight hours — this helps prevent fungal growth and waterlogging overnight.
            </Text>
          )}
          <FlatList
            data={timeSlots}
            keyExtractor={item => item}
            showsVerticalScrollIndicator={false}
            style={styles.pickerList}
            getItemLayout={(_, index) => ({ length: 48, offset: 48 * index, index })}
            initialScrollIndex={Math.max(0, timeSlots.indexOf(selectedTime))}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.pickerItem, selectedTime === item && styles.pickerItemActive]}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <Text style={[styles.pickerItemText, selectedTime === item && styles.pickerItemTextActive]}>
                  {format12h(item)}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (themeColors: any) => StyleSheet.create({
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: themeColors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: themeColors.text, fontFamily: 'CabinetGrotesk-Bold' },
  pickerDone: { fontSize: 16, color: themeColors.accent, fontWeight: '600', fontFamily: 'Satoshi-Regular' },
  pickerHint: { fontSize: 12, color: themeColors.subtext, marginBottom: 12, lineHeight: 17, fontFamily: 'Satoshi-Regular' },
  pickerList: { maxHeight: 300 },
  pickerItem: { height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  pickerItemActive: { backgroundColor: themeColors.elevatedCard },
  pickerItemText: { fontSize: 15, color: themeColors.subtext, fontFamily: 'Satoshi-Regular' },
  pickerItemTextActive: { color: themeColors.accent, fontWeight: '700', fontSize: 17, fontFamily: 'CabinetGrotesk-Bold' },
});
