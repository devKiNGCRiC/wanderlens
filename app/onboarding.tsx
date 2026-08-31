//onboarding.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';

const GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const TRAVEL_STYLES = ['Backpacker', 'Luxury', 'Solo', 'Family', 'Weekend Trips'];
const USER_TYPES = [
  { value: 'traveler', label: 'Traveler' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'both', label: 'Both' },
];

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const [userType, setUserType] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleGenre(g: string) {
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function handleSave() {
    if (!userType || genres.length === 0 || !travelStyle || !homeCity) {
      Alert.alert('Almost done', 'Please fill in every field before continuing.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ user_type: userType, photography_genres: genres, travel_style: travelStyle, home_city: homeCity, onboarded: true })
      .eq('id', session!.user.id);
    setSaving(false);
    if (error) { Alert.alert('Something went wrong', error.message); return; }
    await refreshProfile();
  }

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Tell us about you</Text>

        <Text style={styles.label}>I am a...</Text>
        <View style={styles.row}>
          {USER_TYPES.map((t) => (
            <Chip key={t.value} label={t.label} selected={userType === t.value} onPress={() => setUserType(t.value)} />
          ))}
        </View>

        <Text style={styles.label}>Photography interests</Text>
        <View style={styles.row}>
          {GENRES.map((g) => (
            <Chip key={g} label={g} selected={genres.includes(g)} onPress={() => toggleGenre(g)} />
          ))}
        </View>

        <Text style={styles.label}>Travel style</Text>
        <View style={styles.row}>
          {TRAVEL_STYLES.map((s) => (
            <Chip key={s} label={s} selected={travelStyle === s} onPress={() => setTravelStyle(s)} />
          ))}
        </View>

        <Text style={styles.label}>Home city</Text>
        <TextInput style={styles.input} placeholder="e.g. Guwahati" value={homeCity} onChangeText={setHomeCity} />

        <Pressable style={styles.button} onPress={handleSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Continue'}</Text>
        </Pressable>
      </ScrollView>
    </ScreenBackground>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 60, gap: 8 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 15, fontWeight: '600', marginTop: 20, marginBottom: 8, color: '#44546A' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#ccc' },
  chipSelected: { backgroundColor: '#1F3864', borderColor: '#1F3864' },
  chipText: { color: '#333', fontSize: 14 },
  chipTextSelected: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16, marginTop: 4 },
  button: { backgroundColor: '#1F3864', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 32, marginBottom: 40 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});