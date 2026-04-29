import React from 'react';
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet, Image, Platform,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { ChatMessage, LocationWeatherContext, MediaAttachment } from '../../services/geminiChatService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function parseInline(text: string, baseStyle?: any): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last)
      parts.push(<Text key={k++} style={baseStyle}>{text.slice(last, match.index)}</Text>);
    const token = match[0];
    if (token.startsWith('**'))
      parts.push(<Text key={k++} style={[baseStyle, mdStyles.bold]}>{token.slice(2, -2)}</Text>);
    else if (token.startsWith('*'))
      parts.push(<Text key={k++} style={[baseStyle, mdStyles.italic]}>{token.slice(1, -1)}</Text>);
    else if (token.startsWith('`'))
      parts.push(<Text key={k++} style={mdStyles.inlineCode}>{token.slice(1, -1)}</Text>);
    last = match.index + token.length;
  }
  if (last < text.length)
    parts.push(<Text key={k++} style={baseStyle}>{text.slice(last)}</Text>);
  return parts;
}

function MarkdownText({ text, style }: { text: string; style?: any }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0; let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(
        <View key={key++} style={mdStyles.codeBlock}>
          <Text style={mdStyles.codeText}>{codeLines.join('\n')}</Text>
        </View>
      );
      i++; continue;
    }
    const h1 = line.match(/^#\s+(.*)/); const h2 = line.match(/^##\s+(.*)/); const h3 = line.match(/^###\s+(.*)/);
    if (h1 || h2 || h3) {
      const content = (h3 || h2 || h1)![1];
      const hs = h1 ? mdStyles.h1 : h2 ? mdStyles.h2 : mdStyles.h3;
      elements.push(<Text key={key++} style={[style, hs]}>{parseInline(content, style)}</Text>);
      i++; continue;
    }
    const bullet = line.match(/^(\s*[-*•])\s+(.*)/);
    if (bullet) {
      const indent = bullet[1].trimStart().length > 1 ? 24 : 8;
      elements.push(
        <View key={key++} style={[mdStyles.bulletRow, { marginLeft: indent }]}>
          <Text style={[style, mdStyles.bullet]}>•</Text>
          <Text style={[style, mdStyles.bulletText]}>{parseInline(bullet[2], style)}</Text>
        </View>
      );
      i++; continue;
    }
    const numbered = line.match(/^(\d+)\.\s+(.*)/);
    if (numbered) {
      elements.push(
        <View key={key++} style={mdStyles.bulletRow}>
          <Text style={[style, mdStyles.bullet]}>{numbered[1]}.</Text>
          <Text style={[style, mdStyles.bulletText]}>{parseInline(numbered[2], style)}</Text>
        </View>
      );
      i++; continue;
    }
    if (line.trim() === '') { elements.push(<View key={key++} style={{ height: 6 }} />); i++; continue; }
    elements.push(<Text key={key++} style={style}>{parseInline(line, style)}</Text>);
    i++;
  }
  return <View>{elements}</View>;
}

// ─── Message bubble attachment rendering ─────────────────────────────────────

function MessageAttachments({ attachments }: { attachments: MediaAttachment[] }) {
  return (
    <>
      {attachments.map((att, idx) => {
        if (att.mimeType.startsWith('image/')) {
          return (
            <Image
              key={idx}
              source={{ uri: `data:${att.mimeType};base64,${att.base64}` }}
              style={msgChipStyles.msgImage}
              resizeMode="cover"
            />
          );
        }
        const isAudio = att.mimeType.startsWith('audio/');
        return (
          <View key={idx} style={msgChipStyles.msgChip}>
            <MaterialCommunityIcons
              name={isAudio ? 'waveform' : 'file-document-outline'}
              size={13}
              color="#4ade80"
            />
            <Text style={msgChipStyles.msgChipLabel}>
              {isAudio
                ? `🎙 Voice${att.durationSeconds !== undefined ? ` (${formatDuration(att.durationSeconds)})` : ''}`
                : (att.name ?? 'Document')}
            </Text>
          </View>
        );
      })}
    </>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  thinkingPhrase: string;
  locationCtx: LocationWeatherContext | undefined;
  flatListRef: React.RefObject<FlatList | null>;
  themeColors: any;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MessageList({
  messages,
  isLoading,
  thinkingPhrase,
  locationCtx,
  flatListRef,
  themeColors,
}: MessageListProps) {
  const scr = getStyles(themeColors);

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[scr.messageRow, isUser ? scr.userRow : scr.botRow]}>
        {!isUser && (
          <View style={scr.botIconContainer}>
            <MaterialCommunityIcons name="robot-outline" size={20} color="#fff" />
          </View>
        )}
        <View style={[scr.messageBubble, isUser ? scr.userBubble : scr.botBubble]}>
          {item.attachments && item.attachments.length > 0 && (
            <MessageAttachments attachments={item.attachments} />
          )}
          {(item.text && item.text !== '📎 Attachment') && (
            isUser ? (
              <Text style={[scr.messageText, scr.userText]}>{item.text}</Text>
            ) : (
              <MarkdownText text={item.text} style={[scr.messageText, scr.botText]} />
            )
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={scr.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={scr.emptyState}>
            <MaterialCommunityIcons name="sprout" size={48} color="rgba(74,222,128,0.3)" />
            <Text style={scr.emptyText}>Ask your agronomist anything about crops, soil, or farm management.</Text>
            <Text style={scr.emptyHint}>📎 Attach images or documents · 🎤 Send a voice note</Text>
            {locationCtx?.locationName && (
              <Text style={scr.emptySubtext}>
                📍 Advice tailored to {locationCtx.locationName}
                {locationCtx.temp !== undefined ? ` · ${locationCtx.temp}°C` : ''}
                {locationCtx.condition ? ` · ${locationCtx.condition}` : ''}
              </Text>
            )}
          </View>
        }
      />
      {isLoading && (
        <View style={scr.loadingContainer}>
          <ActivityIndicator size="small" color="#4ade80" />
          <Text style={scr.loadingText}>{thinkingPhrase}</Text>
        </View>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const msgChipStyles = StyleSheet.create({
  msgImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 8 },
  msgChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6,
  },
  msgChipLabel: { color: '#D1FAE5', fontSize: 12 },
});

const mdStyles = StyleSheet.create({
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 4, marginTop: 6, color: '#E5E7EB' },
  h2: { fontSize: 16, fontWeight: '700', marginBottom: 3, marginTop: 5, color: '#E5E7EB' },
  h3: { fontSize: 15, fontWeight: '600', marginBottom: 2, marginTop: 4, color: '#D1FAE5' },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: 'rgba(0,0,0,0.35)', color: '#86EFAC',
    paddingHorizontal: 4, borderRadius: 4, fontSize: 13,
  },
  codeBlock: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: 10, marginVertical: 6 },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#86EFAC', fontSize: 12, lineHeight: 18,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  bullet: { marginRight: 6, lineHeight: 22, color: '#4ade80', fontWeight: '700' },
  bulletText: { flex: 1, lineHeight: 22 },
});

function getStyles(themeColors: any) { return StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 10 },
  emptyText: { textAlign: 'center', color: themeColors.subtext, fontSize: 15, lineHeight: 22 },
  emptyHint: { textAlign: 'center', color: themeColors.subtext, fontSize: 13, opacity: 0.7 },
  emptySubtext: { textAlign: 'center', color: '#4ade80', fontSize: 13, opacity: 0.8, marginTop: 4 },
  messageRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  botRow: { justifyContent: 'flex-start' },
  botIconContainer: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#065f46',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20 },
  userBubble: { backgroundColor: '#4A7838', borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: '#1F2937', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#fff' },
  botText: { color: '#E5E7EB' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 10, gap: 10 },
  loadingText: { fontSize: 13, color: '#4ade80', fontStyle: 'italic' },
}); }
