import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';

interface CustomDropdownProps {
  label: string;
  options: any[];
  selected: string;
  onSelect: (val: any) => void;
  themeColors: any;
}

export function CustomDropdown({ label, options, selected, onSelect, themeColors }: CustomDropdownProps) {
  const [visible, setVisible] = useState(false);
  const styles = getStyles(themeColors);
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
                    onPress={() => { onSelect(opt); setVisible(false); }}
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
}

const getStyles = (themeColors: any) => StyleSheet.create({
  inputGroup: { marginBottom: 16 },
  label: { color: themeColors.subtext, fontSize: 14, marginBottom: 8, fontWeight: '500' },
  inputText: { color: themeColors.text, fontSize: 16 },
  placeholderText: { color: themeColors.subtext, fontSize: 16 },
  dropdownButton: {
    backgroundColor: themeColors.background,
    borderWidth: 1,
    borderColor: themeColors.border,
    borderRadius: 12,
    padding: 14,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
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
  modalTitle: { color: themeColors.text, fontSize: 18, fontWeight: '700' },
  closeBtnText: { color: themeColors.accent, fontSize: 16, fontWeight: '600' },
  dropdownOption: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: themeColors.border },
  dropdownOptionText: { color: themeColors.text, fontSize: 16 },
  dropdownOptionSelected: { color: themeColors.accent, fontWeight: '700' },
});
