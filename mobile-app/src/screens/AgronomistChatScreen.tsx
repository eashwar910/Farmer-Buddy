import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
  ActionSheetIOS,
  Animated,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../hooks/useAuth';
import { useAppContext } from '../context/AppContext';
import {
  ChatMessage,
  LocationWeatherContext,
  MediaAttachment,
  sendAgronomistMessage,
} from '../services/geminiChatService';
import { RootStackParamList } from '../navigation/types';
import { MessageList } from '../components/chat/MessageList';
import { MessageInputBar } from '../components/chat/MessageInputBar';

type Props = NativeStackScreenProps<RootStackParamList, 'AgronomistChat'>;

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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AgronomistChatScreen({ navigation }: Props) {
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
        <MessageList
          messages={messages}
          isLoading={isLoading}
          thinkingPhrase={thinkingPhrase}
          locationCtx={locationCtx}
          flatListRef={flatListRef}
          themeColors={themeColors}
        />
        <MessageInputBar
          input={input}
          onChangeInput={setInput}
          isLoading={isLoading}
          isRecording={isRecording}
          recordingDuration={recordingDuration}
          pendingAttachments={pendingAttachments}
          pulseAnim={pulseAnim}
          canSend={canSend}
          onAttach={handleAttach}
          onVoice={handleVoice}
          onSend={handleSend}
          onRemoveAttachment={(idx) => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
          themeColors={themeColors}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Screen styles ────────────────────────────────────────────────────────────
function getStyles(themeColors: any) {
  return StyleSheet.create({
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
  });
}
