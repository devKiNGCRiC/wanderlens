/**
 * MessageComposer, the input bar at the bottom of a chat thread.
 *
 * Purpose: everything the user uses to send a message in app/chat/[id].tsx:
 * a text box, a send button, a "+" button that opens AttachMenu (photo,
 * camera, video, document, audio, location), a strip of picked photos with
 * a send-mode choice, and a hold-free voice recorder (tap mic to start,
 * tap send to stop and send, or trash to cancel).
 *
 * How it works:
 * - Mostly controlled by the chat screen: the text value, picked photos,
 *   send mode and all the pick/send actions arrive as props. The screen does
 *   the uploading and inserting; this component only collects input.
 * - Any pick callback that is not passed simply hides that attach option,
 *   so the attach grid is built from whichever props exist.
 * - The send button turns into a mic button when there is nothing to send.
 * - Voice notes use expo-audio: useAudioRecorder owns a native recorder,
 *   useAudioRecorderState polls it every 200 ms for the elapsed time, and on
 *   stop the recorded file URI plus duration goes to onSendVoice.
 * - Recordings are capped at MAX_RECORDING_SECONDS and auto-sent at the cap.
 *
 * Gotchas:
 * - Local state is limited to the attach menu's visibility and the
 *   recording flow; everything else belongs to the parent.
 * - Refs (not state) guard the recorder against fast double taps and hold
 *   the latest duration, because they update synchronously; see the
 *   comments in startRecording.
 */
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAudioRecorder, useAudioRecorderState, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { theme } from '@/constants/theme';
import { AttachMenu, type AttachMenuOption } from '@/components/chat/AttachMenu';

/**
 * A photo the user has picked but not sent yet: its local file URI (for the
 * preview) and base64 data (which the chat screen uploads to Storage).
 */
export type PickedAsset = { uri: string; base64: string };
/**
 * How multiple picked photos are sent: one message per photo ('individual'),
 * or a single 'gallery' message laid out as a tilted polaroid 'collage' or
 * a tidy 'grid'. MessageBubble renders the two gallery layouts.
 */
export type SendMode = 'individual' | 'collage' | 'grid';

/** Chip labels for each send mode. */
const MODE_LABELS: Record<SendMode, string> = {
  individual: 'Send individually',
  collage: 'Send as collage',
  grid: 'Send as grid',
};

/** Voice notes stop and send automatically after 2 minutes. */
const MAX_RECORDING_SECONDS = 120;

/** Formats seconds as m:ss for the live recording timer, e.g. 75 -> "1:15". */
function formatRecordingTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * value / onChangeText / onSend: the controlled text input and send action.
 * onPick* / onShareLocation: attach actions; omit one to hide that option.
 * picking* / sharingLocation: "busy" flags from the parent while a picker or
 *   location lookup is running; they show a status line and disable "+".
 * pickedAssets / onRemoveAsset: photos staged for sending, and removal by index.
 * sendMode / onChangeSendMode: how 2+ staged photos will be sent.
 * onSendVoice: receives the recorded file URI and its length in seconds;
 *   the mic button is disabled when this is not provided.
 * paddingBottom: bottom inset from the screen (safe area plus spacing).
 */
type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onPickImage?: () => void;
  onPickCamera?: () => void;
  pickingCamera?: boolean;
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
  onPickDocument?: () => void;
  onPickAudio?: () => void;
  pickingDocument?: boolean;
  paddingBottom: number;
};

/** The chat input bar. See the file header for the overall flow. */
export function MessageComposer({
  value, onChangeText, onSend, onPickImage, onPickCamera, pickingCamera, onPickVideo, pickingVideo, onShareLocation, sharingLocation, pickingImages, pickedAssets = [], onRemoveAsset,
  sendMode = 'individual', onChangeSendMode, onSendVoice, onPickDocument, onPickAudio, pickingDocument,
  paddingBottom,
}: Props) {
  // Derived flags: can we send (text or photos present)? Which send modes
  // apply? 'grid' is only offered from 4 photos up (the grid shows up to 4
  // cells). busy = any picker or location lookup is in progress.
  const hasAssets = pickedAssets.length > 0;
  const canSend = value.trim().length > 0 || hasAssets;
  const modes: SendMode[] = pickedAssets.length >= 4 ? ['individual', 'collage', 'grid'] : ['individual', 'collage'];
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const busy = !!(pickingImages || pickingCamera || pickingVideo || pickingDocument || sharingLocation);

  // Attach grid options. Each entry is `callback && {...}`, which yields
  // `undefined` when that callback wasn't passed; the type-guard filter at the
  // end removes those, so only supported options reach AttachMenu.
  const attachOptions: AttachMenuOption[] = [
    onPickImage && { key: 'photo', label: 'Photo', icon: 'image', color: theme.color.gold, iconColor: theme.color.dusk, onPress: onPickImage },
    onPickCamera && { key: 'camera', label: 'Camera', icon: 'camera', color: theme.color.ember, iconColor: theme.color.dusk, onPress: onPickCamera },
    onPickVideo && { key: 'video', label: 'Video', icon: 'videocam', color: theme.color.duskPurple, iconColor: theme.color.cream, onPress: onPickVideo },
    onPickDocument && { key: 'document', label: 'Document', icon: 'document-attach', color: theme.color.duskPurple, iconColor: theme.color.cream, onPress: onPickDocument },
    onPickAudio && { key: 'audio', label: 'Audio', icon: 'musical-notes', color: theme.color.gold, iconColor: theme.color.dusk, onPress: onPickAudio },
    onShareLocation && { key: 'location', label: 'Location', icon: 'location', color: theme.color.ember, iconColor: theme.color.dusk, onPress: onShareLocation },
  ].filter((opt): opt is AttachMenuOption => !!opt);

  // Voice recording state.
  // audioRecorder: the native recorder (expo-audio's high-quality preset).
  // recorderState: live status, re-polled every 200 ms (drives the timer).
  // isRecording: switches the bar between normal and recording layouts.
  // recordedSecondsRef: latest whole-second duration, read when sending.
  // startingRecordingRef: synchronous "start in progress" lock.
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const [isRecording, setIsRecording] = useState(false);
  const recordedSecondsRef = useRef(0);
  const startingRecordingRef = useRef(false);

  // While recording, copy the elapsed time into the ref on every status tick
  // and auto-send once the 2-minute cap is reached.
  useEffect(() => {
    if (!isRecording) return;
    recordedSecondsRef.current = Math.round(recorderState.durationMillis / 1000);
    if (recordedSecondsRef.current >= MAX_RECORDING_SECONDS) stopAndSendRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.durationMillis, isRecording]);

  // Unmount cleanup (empty dependency list = runs once on mount, cleanup on
  // unmount): stop a recording that is still running when the user leaves.
  useEffect(() => {
    return () => {
      // useAudioRecorder already releases the underlying native object on
      // unmount as part of its own lifecycle management — if that runs before
      // this cleanup, touching the recorder here throws "shared object
      // already released" rather than returning a stale isRecording value.
      try {
        if (audioRecorder.isRecording) audioRecorder.stop();
      } catch {
        // already released — nothing to stop
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Mic button handler: asks for microphone permission, switches the audio
   * session into recording mode, and starts the recorder.
   * Side effects: permission prompt, Alert on denial, native audio mode change.
   */
  async function startRecording() {
    // isRecording (React state) can't be trusted to block a fast double-tap —
    // it only flips after two awaits below, so a second tap can land before
    // the first render commits. This ref is set synchronously instead.
    if (isRecording || startingRecordingRef.current) return;
    startingRecordingRef.current = true;
    try {
      // Permission denied: explain why and stay in the normal layout.
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Allow microphone access to send a voice message.');
        return;
      }
      // Enable recording on the audio session (and keep working with the
      // iOS silent switch on), then prepare and start the recorder.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      recordedSecondsRef.current = 0;
      setIsRecording(true);
    } finally {
      // Release the lock whether we started, were denied, or threw.
      startingRecordingRef.current = false;
    }
  }

  /**
   * Trash button handler: stops the recorder and discards the clip (nothing
   * is sent), then turns recording mode off on the audio session.
   */
  async function cancelRecording() {
    if (!isRecording) return;
    setIsRecording(false);
    await audioRecorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
  }

  /**
   * Send button (while recording) and auto-stop at the cap: stops the
   * recorder and hands the file URI and duration to onSendVoice.
   * Clips shorter than 1 second are dropped silently.
   */
  async function stopAndSendRecording() {
    if (!isRecording) return;
    // Read the duration before stopping, while the ref still holds the last tick.
    const durationSeconds = recordedSecondsRef.current;
    setIsRecording(false);
    await audioRecorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    const uri = audioRecorder.uri;
    if (uri && durationSeconds >= 1) onSendVoice?.(uri, durationSeconds);
  }

  return (
    <View style={{ paddingBottom }}>
      {/* Busy status line: which picker / lookup is currently running */}
      {busy && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.color.gold} />
          <Text style={styles.loadingText}>
            {pickingCamera ? 'Opening camera…' : pickingImages ? 'Loading photos…' : pickingVideo ? 'Preparing video…' : pickingDocument ? 'Attaching file…' : 'Sharing location…'}
          </Text>
        </View>
      )}
      {/* Staged photos: a horizontal strip of thumbnails, each with a remove
          button, plus send-mode chips once 2 or more photos are picked */}
      {hasAssets && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewStrip}>
            {pickedAssets.map((asset, index) => (
              <View key={asset.uri + index} style={styles.previewItem}>
                <Image source={{ uri: asset.uri }} style={styles.previewImage} contentFit="cover" />
                <Pressable onPress={() => onRemoveAsset?.(index)} accessibilityLabel="Remove photo" hitSlop={9} style={styles.previewRemove}>
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
      {/* Input row. Recording layout: cancel, red dot + timer, send.
          Normal layout: "+" attach, text box, then send (or mic when empty). */}
      {isRecording ? (
        <View style={styles.row}>
          <Pressable onPress={cancelRecording} accessibilityLabel="Cancel recording" style={styles.attachBtn}>
            <Ionicons name="trash-outline" size={20} color={theme.color.ember} />
          </Pressable>
          <View style={styles.recordIndicator}>
            <View style={styles.recordDot} />
            <Text style={styles.recordTimer}>{formatRecordingTime(Math.round(recorderState.durationMillis / 1000))}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable onPress={stopAndSendRecording} accessibilityLabel="Stop and send recording" style={styles.sendBtn}>
            <Ionicons name="send" size={17} color={theme.color.dusk} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          {attachOptions.length > 0 && (
            <Pressable
              onPress={() => setAttachMenuVisible(true)}
              disabled={busy}
              accessibilityLabel="Add attachment"
              style={styles.attachBtn}>
              <Ionicons name="add-circle-outline" size={26} color={busy ? theme.color.muted : theme.color.gold} />
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
          {canSend ? (
            <Pressable onPress={onSend} accessibilityLabel="Send message" style={styles.sendBtn}>
              {hasAssets ? <Text style={styles.sendCount}>{pickedAssets.length}</Text> : null}
              <Ionicons name="send" size={17} color={theme.color.dusk} />
            </Pressable>
          ) : (
            <Pressable
              onPress={startRecording}
              disabled={!onSendVoice}
              accessibilityLabel="Record voice message"
              style={[styles.sendBtn, !onSendVoice && styles.sendBtnDisabled]}>
              <Ionicons name="mic" size={18} color={theme.color.dusk} />
            </Pressable>
          )}
        </View>
      )}

      {/* Attachment picker sheet */}
      <AttachMenu visible={attachMenuVisible} onClose={() => setAttachMenuVisible(false)} options={attachOptions} />
    </View>
  );
}

// Styles use design tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Busy status line
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  loadingText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted },
  // Staged-photo strip and send-mode chips
  previewStrip: { gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  previewItem: { width: 56, height: 56, borderRadius: theme.radius.sm, overflow: 'hidden', backgroundColor: theme.color.surface },
  previewImage: { width: '100%', height: '100%' },
  previewRemove: { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(20,23,31,0.7)', alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 8, flexWrap: 'wrap' },
  modeChip: { borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 },
  modeChipActive: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  modeChipText: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted },
  modeChipTextActive: { fontFamily: theme.font.body, color: theme.color.dusk },
  // Input row, recording indicator, text box and round send/mic button
  row: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk, alignItems: 'flex-end' },
  attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  recordIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 4 },
  recordDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: theme.color.ember },
  recordTimer: { fontFamily: theme.font.mono, fontSize: 13, color: theme.color.cream },
  input: { flex: 1, minWidth: 70, maxHeight: 110, backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5, borderWidth: 1, borderColor: theme.color.surface2 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 10, backgroundColor: theme.color.gold, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendCount: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.dusk },
});
