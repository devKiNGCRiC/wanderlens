import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { CountryPicker } from '@/components/CountryPicker';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
const TRAVEL_STYLES = ['Backpacker', 'Luxury', 'Solo', 'Family', 'Weekend Trips'];
const CORE_PLACES = ['Mountains', 'Beaches', 'City', 'Hills'];
const MORE_PLACES = ['Desert', 'Forest', 'Islands', 'Countryside', 'Historical Sites', 'Wildlife Safari'];
const USER_TYPES = [
  { value: 'traveler', label: 'Traveler' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'both', label: 'Both' },
];

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const [userType, setUserType] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [showMoreGenres, setShowMoreGenres] = useState(false);
  const [customGenre, setCustomGenre] = useState('');
  const [placeInterests, setPlaceInterests] = useState<string[]>([]);
  const [showMorePlaces, setShowMorePlaces] = useState(false);
  const [customPlace, setCustomPlace] = useState('');
  const [travelStyle, setTravelStyle] = useState<string | null>(null);
  const [homeCity, setHomeCity] = useState('');
  const [country, setCountry] = useState('');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleGenre(g: string) { setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])); }
  function togglePlace(p: string) { setPlaceInterests((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])); }
  function addCustomGenre() {
    if (customGenre.trim() && !genres.includes(customGenre.trim())) { setGenres((prev) => [...prev, customGenre.trim()]); setCustomGenre(''); }
  }
  function addCustomPlace() {
    if (customPlace.trim() && !placeInterests.includes(customPlace.trim())) { setPlaceInterests((prev) => [...prev, customPlace.trim()]); setCustomPlace(''); }
  }

  async function handleSave() {
    if (!userType || genres.length === 0 || !travelStyle || !homeCity) {
      Alert.alert('Almost done', 'Please fill in every field before continuing.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        user_type: userType, photography_genres: genres, place_interests: placeInterests,
        travel_style: travelStyle, home_city: homeCity, country: country || null, onboarded: true,
      })
      .eq('id', session!.user.id);
    setSaving(false);
    if (error) { Alert.alert('Something went wrong', error.message); return; }
    await refreshProfile();
  }

  return (
    <ScreenBackground>
      <KeyboardAwareScrollView contentContainerStyle={styles.container} enableOnAndroid extraScrollHeight={28} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>ONE LAST THING</Text>
        <Text style={styles.title}>Tell us about you</Text>
        <Text style={styles.subtitle}>This helps other travelers and photographers find you.</Text>

        <Text style={styles.label}>I am a...</Text>
        <View style={styles.row}>
          {USER_TYPES.map((t) => <Chip key={t.value} label={t.label} selected={userType === t.value} onPress={() => setUserType(t.value)} />)}
        </View>

        <Text style={styles.label}>Photography interests</Text>
        <View style={styles.row}>
          {[...CORE_GENRES, ...(showMoreGenres ? MORE_GENRES : [])].map((g) => <Chip key={g} label={g} selected={genres.includes(g)} onPress={() => toggleGenre(g)} />)}
          {!showMoreGenres && <Chip label="More +" selected={false} onPress={() => setShowMoreGenres(true)} />}
        </View>
        <View style={styles.customRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add your own genre" placeholderTextColor={theme.color.muted} value={customGenre} onChangeText={setCustomGenre} onSubmitEditing={addCustomGenre} />
          <Pressable onPress={addCustomGenre} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></Pressable>
        </View>

        <Text style={styles.label}>Places you love</Text>
        <View style={styles.row}>
          {[...CORE_PLACES, ...(showMorePlaces ? MORE_PLACES : [])].map((p) => <Chip key={p} label={p} selected={placeInterests.includes(p)} onPress={() => togglePlace(p)} />)}
          {!showMorePlaces && <Chip label="More +" selected={false} onPress={() => setShowMorePlaces(true)} />}
        </View>
        <View style={styles.customRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add your own place type" placeholderTextColor={theme.color.muted} value={customPlace} onChangeText={setCustomPlace} onSubmitEditing={addCustomPlace} />
          <Pressable onPress={addCustomPlace} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></Pressable>
        </View>

        <Text style={styles.label}>Travel style</Text>
        <View style={styles.row}>
          {TRAVEL_STYLES.map((s) => <Chip key={s} label={s} selected={travelStyle === s} onPress={() => setTravelStyle(s)} />)}
        </View>

        <Text style={styles.label}>Country</Text>
        <Pressable style={styles.input} onPress={() => setCountryPickerVisible(true)}>
          <Text style={{ color: country ? theme.color.cream : theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 15 }}>{country || 'Select your country'}</Text>
        </Pressable>

        <Text style={styles.label}>Home city</Text>
        <TextInput style={styles.input} placeholder="e.g. Guwahati" placeholderTextColor={theme.color.muted} value={homeCity} onChangeText={setHomeCity} />

        <Pressable style={styles.button} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>

        <CountryPicker visible={countryPickerVisible} onClose={() => setCountryPickerVisible(false)} onSelect={setCountry} />
      </KeyboardAwareScrollView>
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
  container: { padding: 24, paddingTop: 70, paddingBottom: 50 },
  eyebrow: { fontFamily: theme.font.mono, fontSize: 11, letterSpacing: 1.5, color: theme.color.gold },
  title: { fontFamily: theme.font.display, fontSize: 25, color: theme.color.cream, marginTop: 8 },
  subtitle: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, marginTop: 6, marginBottom: 8 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 22, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.surface },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  addBtn: { backgroundColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: theme.color.cream, fontFamily: theme.font.body, fontSize: 13 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 32 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});