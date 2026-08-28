import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { PolaroidCard } from '@/components/PolaroidCard';

const SAMPLE_SPOTS = [
  { title: 'Marina Overlook', meta: '6:10 AM · f/8', distance: '2.1 km', rotate: -4 },
  { title: 'Blue Hour Pier', meta: '7:40 PM · f/11', distance: '4.6 km', rotate: 2.5 },
  { title: 'Old Quarter Steps', meta: '5:50 PM · f/4', distance: '1.3 km', rotate: -2 },
];

const SAMPLE_PEOPLE = [
  { name: 'Raj Roy', tag: 'Street · 1.8 km', initial: 'R', color: theme.color.gold },
  { name: 'Maya S.', tag: 'Landscape · 3.2 km', initial: 'M', color: '#7FB8AE' },
  { name: 'Arjun K.', tag: 'Portrait · 5.0 km', initial: 'A', color: '#E29AB0' },
];

export default function FeedScreen() {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>
        <View style={styles.hero}>
          <LinearGradient
            colors={['#C9683E', '#7A4A5E', '#2E2745', theme.color.dusk]}
            locations={[0, 0.45, 0.8, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.sun} />
          <View style={styles.hill} />
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>GOLDEN HOUR · SOON</Text>
            <Text style={styles.headline}>
              Chase the <Text style={styles.headlineBold}>light</Text>,{'\n'}{firstName}.
            </Text>
            <Text style={styles.tagline}>{SAMPLE_SPOTS.length} spots nearby are catching it right now.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spots near you</Text>
          <Text style={styles.sectionSub}>Pinned by photographers who were here first</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmstrip}>
            {SAMPLE_SPOTS.map((spot) => (
              <PolaroidCard key={spot.title} title={spot.title} meta={spot.meta} distance={spot.distance} rotate={spot.rotate} />
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photographers nearby</Text>
          <Text style={styles.sectionSub}>Say hi, or ask for a photo walk</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>
            {SAMPLE_PEOPLE.map((person) => (
              <View key={person.name} style={styles.personChip}>
                <View style={[styles.avatar, { backgroundColor: person.color }]}>
                  <Text style={styles.avatarText}>{person.initial}</Text>
                </View>
                <View>
                  <Text style={styles.personName}>{person.name}</Text>
                  <Text style={styles.personTag}>{person.tag}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.dusk },
  hero: { height: 360, overflow: 'hidden' },
  sun: {
    position: 'absolute', top: 64, right: 52, width: 64, height: 64, borderRadius: 32,
    backgroundColor: theme.color.gold, opacity: 0.9,
  },
  hill: {
    position: 'absolute', bottom: -40, left: -20, right: -20, height: 140,
    backgroundColor: theme.color.dusk, opacity: 0.85, borderTopLeftRadius: 260, borderTopRightRadius: 500,
  },
  heroText: { position: 'absolute', left: 26, right: 26, bottom: 26 },
  eyebrow: { fontFamily: theme.font.mono, fontSize: 11, letterSpacing: 1, color: theme.color.gold, marginBottom: 8 },
  headline: { fontFamily: theme.font.displayItalic, fontSize: 32, lineHeight: 36, color: theme.color.cream },
  headlineBold: { fontFamily: theme.font.display },
  tagline: { marginTop: 10, fontSize: 13, color: 'rgba(246,241,231,0.8)', fontFamily: theme.font.bodyRegular },
  section: { paddingHorizontal: 24, paddingTop: 26 },
  sectionTitle: { fontFamily: theme.font.display, fontSize: 18, color: theme.color.cream },
  sectionSub: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 2, marginBottom: 16 },
  filmstrip: { gap: 14, paddingBottom: 10, paddingTop: 6 },
  peopleRow: { gap: 12, paddingBottom: 6 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 30, paddingVertical: 7, paddingHorizontal: 14, paddingLeft: 7 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: theme.font.display, fontSize: 13, color: theme.color.dusk },
  personName: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.cream },
  personTag: { fontFamily: theme.font.bodyRegular, fontSize: 10.5, color: theme.color.muted, marginTop: 1 },
});
