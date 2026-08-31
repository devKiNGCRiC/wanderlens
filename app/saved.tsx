import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PolaroidGridItem, rotationFor } from '@/components/PolaroidGridItem';

type SavedSpot = { id: string; title: string; photo_url: string | null; genre: string | null };

export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [saved, setSaved] = useState<SavedSpot[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!session) return;
      const { data } = await supabase.rpc('get_saved_spots', { uid: session.user.id });
      setSaved((data as SavedSpot[]) ?? []);
    })();
  }, [session]));

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>Saved</Text>
        <View style={{ width: 36 }} />
      </View>
      <FlatList
        data={saved}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={{ padding: 3, paddingBottom: 40 }}
        renderItem={({ item, index }) => (
          <PolaroidGridItem photoUrl={item.photo_url} caption={item.genre} rotate={rotationFor(index)} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })} />
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Nothing saved yet — tap the bookmark icon on any spot to save it here.</Text>}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});