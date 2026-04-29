import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Animated,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { MediaAttachment } from '../../services/geminiChatService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Attachment preview chip ──────────────────────────────────────────────────

function AttachmentChip({ att, onRemove }: { att: MediaAttachment; onRemove: () => void }) {
  if (att.mimeType.startsWith('image/') && att.base64) {
    return (
      <View style={chipStyles.imageWrap}>
        <Image
          source={{ uri: `data:${att.mimeType};base64,${att.base64}` }}
          style={chipStyles.imageThumbnail}
        />
        <TouchableOpacity style={chipStyles.removeBtn} onPress={onRemove}>
          <MaterialCommunityIcons name="close-circle" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }
  const isAudio = att.mimeType.startsWith('audio/');
  const icon = isAudio ? 'microphone' : 'file-document-outline';
  const label = isAudio
    ? `🎙 ${att.durationSeconds !== undefined ? formatDuration(att.durationSeconds) : 'Voice'}`
    : (att.name ?? 'Document');
  return (
    <View style={chipStyles.chip}>
      <MaterialCommunityIcons name={icon as any} size={14} color="#4ade80" />
      <Text style={chipStyles.chipLabel} numberOfLines={1}>{label}</Text>
      <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialCommunityIcons name="close" size={14} color="rgba(255,255,255,0.5)" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MessageInputBarProps {
  input: string;
  onChangeInput: (v: string) => void;
  isLoading: boolean;
  isRecording: boolean;
  recordingDuration: number;
  pendingAttachments: MediaAttachment[];
  pulseAnim: Animated.Value;
  canSend: boolean;
  onAttach: () => void;
  onVoice: () => void;
  onSend: () => void;
  onRemoveAttachment: (idx: number) => void;
  themeColors: any;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageInputBar({
  input, onChangeInput,
  isLoading,
  isRecording, recordingDuration,
  pendingAttachments,
  pulseAnim,
  canSend,
  onAttach, onVoice, onSend,
  onRemoveAttachment,
  themeColors,
}: MessageInputBarProps) {
  const styles = getStyles(themeColors);
  return (
    <>
      {/* Pending attachments strip */}
      {pendingAttachments.length > 0 && (
        <View style={styles.attachStrip}>
          {pendingAttachments.map((att, idx) => (
            <AttachmentChip
              key={idx}
              att={att}
              onRemove={() => onRemoveAttachment(idx)}
            />
          ))}
        </View>
      )}

      {/* Input bar */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.iconButton} onPress={onAttach} disabled={isLoading}>
          <MaterialCommunityIcons name="paperclip" size={22} color={themeColors.subtext} />
        </TouchableOpacity>

        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={onChangeInput}
          placeholder={isRecording ? `Recording… ${formatDuration(recordingDuration)}` : 'Ask about crop management...'}
          placeholderTextColor={isRecording ? '#f87171' : themeColors.subtext}
          multiline
          maxLength={500}
          editable={!isRecording}
        />

        <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}>
          <TouchableOpacity
            style={[styles.iconButton, isRecording && styles.iconButtonActive]}
            onPress={onVoice}
            disabled={isLoading}
          >
            <MaterialCommunityIcons
              name={isRecording ? 'stop-circle' : 'microphone'}
              size={22}
              color={isRecording ? '#f87171' : themeColors.subtext}
            />
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={onSend}
          disabled={!canSend}
        >
          <MaterialCommunityIcons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const chipStyles = StyleSheet.create({
  imageWrap: { position: 'relative', marginRight: 8, borderRadius: 10, overflow: 'visible' },
  imageThumbnail: { width: 64, height: 64, borderRadius: 10 },
  removeBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: '#374151', borderRadius: 9 },
  chip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, gap: 6, maxWidth: 180,
  },
  chipLabel: { color: '#E5E7EB', fontSize: 12, flexShrink: 1 },
});

function getStyles(themeColors: any) { return StyleSheet.create({
  attachStrip: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16,
    paddingTop: 8, paddingBottom: 4, gap: 8,
    borderTopWidth: 1, borderTopColor: themeColors.border,
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: themeColors.border,
    backgroundColor: themeColors.background, gap: 8,
  },
  iconButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  iconButtonActive: { backgroundColor: 'rgba(248,113,113,0.15)' },
  textInput: {
    flex: 1, minHeight: 36, maxHeight: 120,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: themeColors.border,
    borderRadius: 18, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8,
    fontSize: 15, color: themeColors.text,
  },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#4ade80', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#374151' },
}); }
