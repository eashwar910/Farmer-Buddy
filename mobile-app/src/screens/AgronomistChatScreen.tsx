/**
 * AgronomistChatScreen.tsx
 *
 * Multimodal agronomist chat with:
 *  - Text input
 *  - Image attach (camera / library)
 *  - Document attach (PDF, txt, etc.)
 *  - Voice recording (tap-to-start / tap-to-stop)
 *  - Markdown rendering for bot replies
 *  - Rotating agriculture-themed thinking phrases
 *  - Location + weather context injection
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  ActionSheetIOS,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import {
  ChatMessage,
  LocationWeatherContext,
  MediaAttachment,
  sendAgronomistMessage,
} from '../services/geminiChatService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6 MB

const THINKING_PHRASES = [
  '🌱 Analysing soil conditions...',
  '☀️ Checking crop growth factors...',
  '🌾 Consulting the harvest data...',
  '💧 Evaluating irrigation needs...',
  '🐛 Scanning for pest patterns...',
  '🌿 Cross-referencing plant health...',
  '🌦️ Factoring in weather data...',
  '🧪 Running nutrient analysis...',
  '🌍 Reviewing regional crop insights...',
  '🚜 Preparing agronomist advice...',
  '📊 Crunching farm analytics...',
  '🌻 Consulting botanical knowledge...',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function getMimeFromUri(uri: string, fallback = 'application/octet-stream'): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
    pdf: 'application/pdf',
    txt: 'text/plain', csv: 'text/csv',
    m4a: 'audio/m4a', mp3: 'audio/mpeg', mp4: 'audio/mp4',
    wav: 'audio/wav', aac: 'audio/aac',
  };
  return ext ? (map[ext] ?? fallback) : fallback;
}

async function uriToBase64(uri: string): Promise<string> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as any,
  });
  return b64;
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

// ─── Attachment preview chip ──────────────────────────────────────────────────

function AttachmentChip({
  att,
  onRemove,
}: {
  att: MediaAttachment;
  onRemove: () => void;
}) {
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
              style={chipStyles.msgImage}
              resizeMode="cover"
            />
          );
        }
        const isAudio = att.mimeType.startsWith('audio/');
        return (
          <View key={idx} style={chipStyles.msgChip}>
            <MaterialCommunityIcons
              name={isAudio ? 'waveform' : 'file-document-outline'}
              size={13}
              color="#4ade80"
            />
            <Text style={chipStyles.msgChipLabel}>
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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AgronomistChatScreen({ navigation }: any) {
  const { themeColors, t } = useAppContext();
  const { profile } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingPhrase, setThinkingPhrase] = useState(THINKING_PHRASES[0]);
  const [locationCtx, setLocationCtx] = useState<LocationWeatherContext | undefined>(undefined);

  // Pending attachments
  const [pendingAttachments, setPendingAttachments] = useState<MediaAttachment[]>([]);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const flatListRef = useRef<FlatList>(null);
  const phraseIndexRef = useRef(0);

  // ── Location / weather ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const locationName = await AsyncStorage.getItem('user_location');
        const cachedStr = await AsyncStorage.getItem('weather_widget_cache');
        let ctx: LocationWeatherContext = {};
        if (locationName) ctx.locationName = locationName;
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (cached?.data) {
            const d = cached.data;
            ctx = { ...ctx, temp: d.temp, condition: d.condition, humidity: d.humidity, windSpeed: d.windSpeed, uvIndex: d.uvIndex, locationName: d.locationName ?? ctx.locationName };
          }
        }
        if (Object.keys(ctx).length > 0) setLocationCtx(ctx);
      } catch { /* ignore */ }
    })();
  }, []);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // ── Rotating thinking phrases ───────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      phraseIndexRef.current = (phraseIndexRef.current + 1) % THINKING_PHRASES.length;
      setThinkingPhrase(THINKING_PHRASES[phraseIndexRef.current]);
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading]);

  // ── Pulse animation while recording ────────────────────────────────────────
  useEffect(() => {
    if (!isRecording) { pulseAnim.setValue(1); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isRecording]);

  // ── Attach button ───────────────────────────────────────────────────────────
  const handleAttach = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', '📷 Camera', '🖼️ Photo Library', '📄 Document'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) pickImage('camera');
          else if (idx === 2) pickImage('library');
          else if (idx === 3) pickDocument();
        }
      );
    } else {
      // Android: show a simple Alert with buttons
      Alert.alert('Attach', 'Choose source', [
        { text: 'Camera', onPress: () => pickImage('camera') },
        { text: 'Photo Library', onPress: () => pickImage('library') },
        { text: 'Document', onPress: () => pickDocument() },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [pendingAttachments]);

  const pickImage = async (source: 'camera' | 'library') => {
    try {
      let result: ImagePicker.ImagePickerResult;
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: 'images' as ImagePicker.MediaType,
        allowsEditing: false,
        quality: 0.85,
        base64: false,
      };
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera access is required.'); return; }
        result = await ImagePicker.launchCameraAsync(opts);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (result.canceled) return;
      const asset = result.assets[0];

      // Size check — if fileSize available
      if (asset.fileSize && asset.fileSize > MAX_FILE_BYTES) {
        Alert.alert('File too large', 'Maximum file size is 6 MB.'); return;
      }

      const b64 = await uriToBase64(asset.uri);

      // Fallback size check via base64 length
      if (b64.length * 0.75 > MAX_FILE_BYTES) {
        Alert.alert('File too large', 'Maximum file size is 6 MB.'); return;
      }

      const mimeType = getMimeFromUri(asset.uri, 'image/jpeg');
      const name = asset.uri.split('/').pop() ?? 'image.jpg';
      setPendingAttachments((prev) => [...prev, { base64: b64, mimeType, name }]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not load image.');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'text/plain', 'text/csv', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];

      if (asset.size && asset.size > MAX_FILE_BYTES) {
        Alert.alert('File too large', 'Maximum file size is 6 MB.'); return;
      }

      const b64 = await uriToBase64(asset.uri);

      if (b64.length * 0.75 > MAX_FILE_BYTES) {
        Alert.alert('File too large', 'Maximum file size is 6 MB.'); return;
      }

      const mimeType = asset.mimeType ?? getMimeFromUri(asset.uri, 'application/octet-stream');
      setPendingAttachments((prev) => [...prev, { base64: b64, mimeType, name: asset.name }]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not pick document.');
    }
  };

  // ── Voice recording ─────────────────────────────────────────────────────────
  const handleVoice = async () => {
    if (isRecording) {
      // Stop
      try {
        if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
        const duration = recordingDuration;
        await recordingRef.current?.stopAndUnloadAsync();
        const uri = recordingRef.current?.getURI();
        recordingRef.current = null;
        setIsRecording(false);
        setRecordingDuration(0);

        if (uri) {
          const b64 = await uriToBase64(uri);
          if (b64.length * 0.75 > MAX_FILE_BYTES) {
            Alert.alert('Recording too large', 'Maximum file size is 6 MB. Try a shorter clip.'); return;
          }
          setPendingAttachments((prev) => [
            ...prev,
            { base64: b64, mimeType: 'audio/m4a', name: 'voice.m4a', durationSeconds: duration },
          ]);
        }
      } catch (err: any) {
        Alert.alert('Error', 'Could not stop recording: ' + err.message);
        setIsRecording(false);
      }
    } else {
      // Start
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Denied', 'Microphone access is required.'); return; }

        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        recordingRef.current = recording;
        setIsRecording(true);
        setRecordingDuration(0);

        durationIntervalRef.current = setInterval(() => {
          setRecordingDuration((d) => d + 1);
        }, 1000);
      } catch (err: any) {
        Alert.alert('Error', 'Could not start recording: ' + err.message);
      }
    }
  };

  // ── Send ────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text && pendingAttachments.length === 0) return;

    const atts = [...pendingAttachments];
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      text: text || (atts.some((a) => a.mimeType.startsWith('audio/')) ? '🎙 Voice message' : '📎 Attachment'),
      sender: 'user',
      attachments: atts.length > 0 ? atts : undefined,
    };

    setMessages((prev) => [...prev, newMessage]);
    setInput('');
    setPendingAttachments([]);
    setIsLoading(true);
    phraseIndexRef.current = 0;
    setThinkingPhrase(THINKING_PHRASES[0]);
    Keyboard.dismiss();

    try {
      const responseText = await sendAgronomistMessage(
        newMessage.text,
        messages,
        undefined,
        locationCtx,
        atts.length > 0 ? atts : undefined,
        profile?.role === 'manager'
      );
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), text: responseText, sender: 'bot' }]);
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), text: 'Sorry, I encountered an error. Please try again later.', sender: 'bot' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
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
          {/* Attachment previews in bubbles */}
          {item.attachments && item.attachments.length > 0 && (
            <MessageAttachments attachments={item.attachments} />
          )}
          {/* Only show text label if it's non-empty or non-placeholder */}
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

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !isLoading;

  return (
    <SafeAreaView style={scr.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={scr.header}>
        <TouchableOpacity style={scr.backButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.text} />
        </TouchableOpacity>
        <View style={scr.headerTitleWrap}>
          <Text style={scr.headerTitle}>{t('agronomistChat') || 'Agronomist Chat'}</Text>
          {locationCtx?.locationName ? (
            <View style={scr.locationRow}>
              <MaterialCommunityIcons name="map-marker" size={11} color="#4ade80" />
              <Text style={scr.locationText}>{locationCtx.locationName}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={scr.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Message list */}
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

        {/* Thinking indicator */}
        {isLoading && (
          <View style={scr.loadingContainer}>
            <ActivityIndicator size="small" color="#4ade80" />
            <Text style={scr.loadingText}>{thinkingPhrase}</Text>
          </View>
        )}

        {/* Pending attachments strip */}
        {pendingAttachments.length > 0 && (
          <View style={scr.attachStrip}>
            {pendingAttachments.map((att, idx) => (
              <AttachmentChip
                key={idx}
                att={att}
                onRemove={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
              />
            ))}
          </View>
        )}

        {/* Input bar */}
        <View style={scr.inputContainer}>
          {/* Attach button */}
          <TouchableOpacity style={scr.iconButton} onPress={handleAttach} disabled={isLoading}>
            <MaterialCommunityIcons name="paperclip" size={22} color={themeColors.subtext} />
          </TouchableOpacity>

          {/* Text input */}
          <TextInput
            style={scr.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? `Recording… ${formatDuration(recordingDuration)}` : 'Ask about crop management...'}
            placeholderTextColor={isRecording ? '#f87171' : themeColors.subtext}
            multiline
            maxLength={500}
            editable={!isRecording}
          />

          {/* Voice button */}
          <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}>
            <TouchableOpacity
              style={[scr.iconButton, isRecording && scr.iconButtonActive]}
              onPress={handleVoice}
              disabled={isLoading}
            >
              <MaterialCommunityIcons
                name={isRecording ? 'stop-circle' : 'microphone'}
                size={22}
                color={isRecording ? '#f87171' : themeColors.subtext}
              />
            </TouchableOpacity>
          </Animated.View>

          {/* Send button */}
          <TouchableOpacity
            style={[scr.sendButton, !canSend && scr.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!canSend}
          >
            <MaterialCommunityIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Chip / attachment styles (module-level) ──────────────────────────────────
const chipStyles = StyleSheet.create({
  imageWrap: {
    position: 'relative',
    marginRight: 8,
    borderRadius: 10,
    overflow: 'visible',
  },
  imageThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#374151',
    borderRadius: 9,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    gap: 6,
    maxWidth: 180,
  },
  chipLabel: {
    color: '#E5E7EB',
    fontSize: 12,
    flexShrink: 1,
  },
  msgImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 8,
  },
  msgChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  msgChipLabel: {
    color: '#D1FAE5',
    fontSize: 12,
  },
});

// ─── Markdown styles ──────────────────────────────────────────────────────────
const mdStyles = StyleSheet.create({
  h1: { fontSize: 18, fontWeight: '700', marginBottom: 4, marginTop: 6, color: '#E5E7EB' },
  h2: { fontSize: 16, fontWeight: '700', marginBottom: 3, marginTop: 5, color: '#E5E7EB' },
  h3: { fontSize: 15, fontWeight: '600', marginBottom: 2, marginTop: 4, color: '#D1FAE5' },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: 'rgba(0,0,0,0.35)',
    color: '#86EFAC',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 13,
  },
  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#86EFAC',
    fontSize: 12,
    lineHeight: 18,
  },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  bullet: { marginRight: 6, lineHeight: 22, color: '#4ade80', fontWeight: '700' },
  bulletText: { flex: 1, lineHeight: 22 },
});

// ─── Screen styles ────────────────────────────────────────────────────────────
const getStyles = (themeColors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: themeColors.background },
    keyboardView: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: themeColors.border,
    },
    backButton: { padding: 8, marginLeft: -8 },
    headerTitleWrap: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: themeColors.text },
    locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    locationText: { fontSize: 11, color: '#4ade80', fontWeight: '500' },
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

    // Attachment strip above input
    attachStrip: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
    },

    // Input bar
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: themeColors.border,
      backgroundColor: themeColors.background,
      gap: 8,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    iconButtonActive: {
      backgroundColor: 'rgba(248,113,113,0.15)',
    },
    textInput: {
      flex: 1,
      minHeight: 36,
      maxHeight: 120,
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderWidth: 1,
      borderColor: themeColors.border,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 8,
      fontSize: 15,
      color: themeColors.text,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#4ade80',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: { backgroundColor: '#374151' },
  });
