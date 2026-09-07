import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';

export default function About() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>About</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.container}>
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.tagline}>Golden hour, blue hour — a field journal for travelers and photographers.</Text>
        <Text style={styles.body}>
          Wanderlens is a crowdsourced, geo-tagged photo-spot map paired with a connection
          layer for meeting travelers and photographers by shared destination, dates, or
          genre. Community and connection are the product — AI is a supporting feature, not
          the centerpiece.
        </Text>
        <Text style={styles.version}>Version {version}</Text>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  container: { padding: 24, alignItems: 'center', marginTop: 40 },
  wordmark: { fontFamily: theme.font.display, fontSize: 30, color: theme.color.gold },
  tagline: { fontFamily: theme.font.displayItalic, fontSize: 15, color: theme.color.cream, textAlign: 'center', marginTop: 12 },
  body: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.muted, textAlign: 'center', lineHeight: 21, marginTop: 20 },
  version: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.muted, marginTop: 32 },
});
