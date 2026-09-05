import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { theme } from '@/constants/theme';

export type PickedAsset = { uri: string; base64: string };
export type SendMode = 'individual' | 'collage' | 'grid';

const MODE_LABELS: Record<SendMode, string> = {
  individual: 'Send individually',
  collage: 'Send as collage',
  grid: 'Send as grid',
};

const MAX_RECORDING_SECONDS = 120;

function formatRecordingTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPickImage?: () => void;
  onPickVideo?: () => void;
  pickingVideo?: boolean;
  onShareLocation?: () => void;
  sharingLocation?: boolean;
  pickingImages?: boolean;
  pickedAssets?: PickedAsset[];
  onRemoveAsset?: (index: number) => void;
  sendMode?: SendMode;
  onChangeSendMode?: (mode: SendMode) => void;
  onSendVoice?: (uri: string, durationSeconds: number) => void;
  paddingBottom: number;
};

export function MessageComposer({
  value, onChangeText, onSend, onPickImage, onPickVideo, pickingVideo, onShareLocation, sharingLocation, pickingImages, pickedAssets = [], onRemoveAsset,
  sendMode = 'individual', onChangeSendMode, onSendVoice,
  paddingBottom,
}: Props) {
  const hasAssets = pickedAssets.length > 0;
  const canSend = value.trim().length > 0 || hasAssets;
  const modes: SendMode[] = pickedAssets.length >= 4 ? ['individual', 'collage', 'grid'] : ['individual', 'collage'];

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const [isRecording, setIsRecording] = useState(false);
  const recordedSecondsRef = useRef(0);

  useEffect(() => {
    if (!isRecording) return;
    recordedSecondsRef.current = Math.round(recorderState.durationMillis / 1000);
    if (recordedSecondsRef.current >= MAX_RECORDING_SECONDS) stopAndSendRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, isRecording]);

  useEffect(() => {
    return () => {
      if (audioRecorder.isRecording) audioRecorder.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startRecording() {
    if (isRecording) return;
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission needed', 'Allow microphone access to send a voice message.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    recordedSecondsRef.current = 0;
    setIsRecording(true);
  }

  async function cancelRecording() {
    if (!isRecording) return;
    setIsRecording(false);
    await audioRecorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
  }

  async function stopAndSendRecording() {
    if (!isRecording) return;
    const durationSeconds = recordedSecondsRef.current;
    setIsRecording(false);
    await audioRecorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = audioRecorder.uri;
    if (uri && durationSeconds >= 1) onSendVoice?.(uri, durationSeconds);
  }

  return (
    <View style={{ paddingBottom }}>
      {pickingImages && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.color.gold} />
          <Text style={styles.loadingText}>Loading photos…</Text>
        </View>
      )}
      {hasAssets && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewStrip}>
            {pickedAssets.map((asset, index) => (
              <View key={asset.uri + index} style={styles.previewItem}>
                <Image source={{ uri: asset.uri }} style={styles.previewImage} contentFit="cover" />
                <Pressable onPress={() => onRemoveAsset?.(index)} style={styles.previewRemove}>
                  <Ionicons name="close" size={12} color={theme.color.cream} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          {pickedAssets.length >= 2 && onChangeSendMode && (
            <View style={styles.modeRow}>
              {modes.map((mode) => (
                <Pressable key={mode} onPress={() => onChangeSendMode(mode)} style={[styles.modeChip, sendMode === mode && styles.modeChipActive]}>
                  <Text style={[styles.modeChipText, sendMode === mode && styles.modeChipTextActive]}>{MODE_LABELS[mode]}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      )}
      {isRecording ? (
        <View style={styles.row}>
          <Pressable onPress={cancelRecording} style={styles.attachBtn}>
            <Ionicons name="trash-outline" size={20} color={theme.color.ember} />
          </Pressable>
          <View style={styles.recordIndicator}>
            <View style={styles.recordDot} />
            <Text style={styles.recordTimer}>{formatRecordingTime(Math.round(recorderState.durationMillis / 1000))}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={stopAndSendRecording} style={styles.sendBtn}>
            <Ionicons name="send" size={17} color={theme.color.dusk} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          {onPickImage && (
            <Pressable onPress={onPickImage} disabled={pickingImages} style={styles.attachBtn}>
              <Ionicons name="image-outline" size={21} color={pickingImages ? theme.color.muted : theme.color.gold} />
            </Pressable>
          )}
          {onPickVideo && (
            <Pressable onPress={onPickVideo} disabled={pickingVideo} style={styles.attachBtn}>
              {pickingVideo ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="videocam-outline" size={21} color={theme.color.gold} />}
            </Pressable>
          )}
          {onShareLocation && (
            <Pressable onPress={onShareLocation} disabled={sharingLocation} style={styles.attachBtn}>
              {sharingLocation ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="location-outline" size={21} color={theme.color.gold} />}
            </Pressable>
          )}
          {onSendVoice && !hasAssets && (
            <Pressable onPress={startRecording} style={styles.attachBtn}>
              <Ionicons name="mic-outline" size={21} color={theme.color.gold} />
            </Pressable>
          )}
          <TextInput
            style={styles.input}
            placeholder={hasAssets ? 'Add a caption...' : 'Message...'}
            placeholderTextColor={theme.color.muted}
            value={value}
            onChangeText={onChangeText}
            multiline
          />
          <Pressable onPress={onSend} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}>
            {hasAssets ? <Text style={styles.sendCount}>{pickedAssets.length}</Text> : null}
            <Ionicons name="send" size={17} color={theme.color.dusk} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  loadingText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted },
  previewStrip: { gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  previewItem: { width: 56, height: 56, borderRadius: theme.radius.sm, overflow: 'hidden', backgroundColor: theme.color.surface },
  previewImage: { width: '100%', height: '100%' },
  previewRemove: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(20,23,31,0.7)', alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 8, flexWrap: 'wrap' },
  modeChip: { borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 },
  modeChipActive: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  modeChipText: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted },
  modeChipTextActive: { fontFamily: theme.font.body, color: theme.color.dusk },
  row: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk, alignItems: 'flex-end' },
  attachBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  recordIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 4 },
  recordDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: theme.color.ember },
  recordTimer: { fontFamily: theme.font.mono, fontSize: 13, color: theme.color.cream },
  input: { flex: 1, maxHeight: 110, backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5, borderWidth: 1, borderColor: theme.color.surface2 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 38, height: 38, borderRadius: 19, paddingHorizontal: 10, backgroundColor: theme.color.gold, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendCount: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.dusk },
});
