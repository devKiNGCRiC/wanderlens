import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type PickedAsset = { uri: string; base64: string };
export type SendMode = 'individual' | 'collage' | 'grid';

const MODE_LABELS: Record<SendMode, string> = {
  individual: 'Send individually',
  collage: 'Send as collage',
  grid: 'Send as grid',
};

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
  paddingBottom: number;
};

export function MessageComposer({
  value, onChangeText, onSend, onPickImage, onPickVideo, pickingVideo, onShareLocation, sharingLocation, pickingImages, pickedAssets = [], onRemoveAsset,
  sendMode = 'individual', onChangeSendMode, paddingBottom,
}: Props) {
  const hasAssets = pickedAssets.length > 0;
  const canSend = value.trim().length > 0 || hasAssets;
  const modes: SendMode[] = pickedAssets.length >= 4 ? ['individual', 'collage', 'grid'] : ['individual', 'collage'];

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
  input: { flex: 1, maxHeight: 110, backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5, borderWidth: 1, borderColor: theme.color.surface2 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 38, height: 38, borderRadius: 19, paddingHorizontal: 10, backgroundColor: theme.color.gold, justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendCount: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.dusk },
});
