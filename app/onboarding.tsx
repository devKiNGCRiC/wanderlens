/**
 * Route: /onboarding, the one-time "Tell us about you" profile setup.
 *
 * Purpose: after signup, a user has a `profiles` row (created by the
 * `handle_new_user` trigger) but `onboarded` is false. app/_layout.tsx shows
 * only this screen in that state (the `session && !isOnboarded`
 * `<Stack.Protected>` guard). The answers collected here (user type, genres,
 * places, travel style, home city, optional next trip) power discovery and
 * matching elsewhere, e.g. the Connect tab.
 *
 * How it works:
 * - All answers live in local useState until "Continue" is pressed.
 * - Save is a single `update` on the `profiles` table (writes go through
 *   tables, reads through RPCs) that also sets `onboarded: true`.
 * - It then calls `refreshProfile()` from AuthProvider. The refreshed profile
 *   has `onboarded` true, which flips the guards in _layout and the router
 *   moves the user into the tabs. This screen never navigates by itself.
 * - `KeyboardAwareScrollView` scrolls focused text inputs above the keyboard.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { CountryPicker } from '@/components/CountryPicker';
import { DateField } from '@/components/DateField';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

// Chip option lists. "CORE" lists show by default; "MORE" lists are revealed
// by the "More +" chip so the first view isn't overwhelming. Users can also
// type their own genre / place type.
const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
const TRAVEL_STYLES = ['Backpacker', 'Luxury', 'Solo', 'Family', 'Weekend Trips'];
const CORE_PLACES = ['Mountains', 'Beaches', 'City', 'Hills'];
const MORE_PLACES = ['Desert', 'Forest', 'Islands', 'Countryside', 'Historical Sites', 'Wildlife Safari'];
// `value` is what gets stored in profiles.user_type; `label` is what the user sees.
const USER_TYPES = [
  { value: 'traveler', label: 'Traveler' },
  { value: 'photographer', label: 'Photographer' },
  { value: 'both', label: 'Both' },
];

/**
 * Onboarding form screen. Collects the profile answers and saves them in one
 * update; completion is signalled by refreshing the auth profile.
 */
export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  // Form state, one piece per question. Multi-select answers (genres, places,
  // trip destinations) are arrays; single-select ones are string | null.
  // `showMore*` toggles reveal the extra chip lists; `custom*` hold the
  // free-text "add your own" inputs before they're added as chips.
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
  const [tripDestinations, setTripDestinations] = useState<string[]>([]);
  const [tripStartDate, setTripStartDate] = useState<Date | null>(null);
  const [tripEndDate, setTripEndDate] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  // Multi-select helpers: tapping a chip adds it if absent, removes it if present.
  // The functional `prev =>` form of setState avoids using a stale array.
  function toggleGenre(g: string) { setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])); }
  function togglePlace(p: string) { setPlaceInterests((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])); }
  // Add the typed custom value as a selected chip (trimmed, ignoring blanks
  // and duplicates), then clear the input. Called by the "Add" button and by
  // the keyboard's submit key.
  function addCustomGenre() {
    if (customGenre.trim() && !genres.includes(customGenre.trim())) { setGenres((prev) => [...prev, customGenre.trim()]); setCustomGenre(''); }
  }
  function addCustomPlace() {
    if (customPlace.trim() && !placeInterests.includes(customPlace.trim())) { setPlaceInterests((prev) => [...prev, customPlace.trim()]); setCustomPlace(''); }
  }

  /**
   * Validates the form, writes the answers to the user's `profiles` row with
   * `onboarded: true`, then refreshes the profile in AuthProvider so the
   * route guards move the user into the app.
   * Side effects: Supabase table update, native alerts on validation/error.
   */
  async function handleSave() {
    // Required: user type, at least one genre, travel style, home city.
    // Country, places and the next-trip fields are optional.
    if (!userType || genres.length === 0 || !travelStyle || !homeCity) {
      Alert.alert('Almost done', 'Please fill in every field before continuing.');
      return;
    }
    if (tripStartDate && tripEndDate && tripEndDate < tripStartDate) {
      Alert.alert('Check your trip dates', 'The return date is before the start date.');
      return;
    }
    // Single profiles update. Empty optional answers are stored as null rather
    // than '' or []. Trip dates are sent as 'YYYY-MM-DD' strings, cut from
    // toISOString() (which is in UTC). `session!` asserts non-null: this
    // screen is only reachable while signed in.
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        user_type: userType, photography_genres: genres, place_interests: placeInterests,
        travel_style: travelStyle, home_city: homeCity, country: country || null, onboarded: true,
        trip_destinations: tripDestinations.length > 0 ? tripDestinations : null,
        trip_start_date: tripStartDate ? tripStartDate.toISOString().slice(0, 10) : null,
        trip_end_date: tripEndDate ? tripEndDate.toISOString().slice(0, 10) : null,
      })
      .eq('id', session!.user.id);
    setSaving(false);
    if (error) { Alert.alert('Something went wrong', error.message); return; }
    // Re-read the profile; `onboarded` is now true, so the guard redirects.
    await refreshProfile();
  }

  // One long scrolling form. keyboardShouldPersistTaps="handled" lets a tap on
  // a chip or button register even while the keyboard is open.
  return (
    <ScreenBackground>
      <KeyboardAwareScrollView contentContainerStyle={styles.container} enableOnAndroid extraScrollHeight={28} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>ONE LAST THING</Text>
        <Text style={styles.title}>Tell us about you</Text>
        <Text style={styles.subtitle}>This helps other travelers and photographers find you.</Text>

        {/* User type: single choice. */}
        <Text style={styles.label}>I am a...</Text>
        <View style={styles.row}>
          {USER_TYPES.map((t) => <Chip key={t.value} label={t.label} selected={userType === t.value} onPress={() => setUserType(t.value)} />)}
        </View>

        {/* Genres: multi-select chips, a "More +" expander, and a custom input. */}
        <Text style={styles.label}>Photography interests</Text>
        <View style={styles.row}>
          {[...CORE_GENRES, ...(showMoreGenres ? MORE_GENRES : [])].map((g) => <Chip key={g} label={g} selected={genres.includes(g)} onPress={() => toggleGenre(g)} />)}
          {!showMoreGenres && <Chip label="More +" selected={false} onPress={() => setShowMoreGenres(true)} />}
        </View>
        <View style={styles.customRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add your own genre" placeholderTextColor={theme.color.muted} value={customGenre} onChangeText={setCustomGenre} onSubmitEditing={addCustomGenre} />
          <Pressable onPress={addCustomGenre} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></Pressable>
        </View>

        {/* Place interests: same pattern as genres. */}
        <Text style={styles.label}>Places you love</Text>
        <View style={styles.row}>
          {[...CORE_PLACES, ...(showMorePlaces ? MORE_PLACES : [])].map((p) => <Chip key={p} label={p} selected={placeInterests.includes(p)} onPress={() => togglePlace(p)} />)}
          {!showMorePlaces && <Chip label="More +" selected={false} onPress={() => setShowMorePlaces(true)} />}
        </View>
        <View style={styles.customRow}>
          <TextInput style={[styles.input, { flex: 1 }]} placeholder="Add your own place type" placeholderTextColor={theme.color.muted} value={customPlace} onChangeText={setCustomPlace} onSubmitEditing={addCustomPlace} />
          <Pressable onPress={addCustomPlace} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></Pressable>
        </View>

        {/* Travel style: single choice. */}
        <Text style={styles.label}>Travel style</Text>
        <View style={styles.row}>
          {TRAVEL_STYLES.map((s) => <Chip key={s} label={s} selected={travelStyle === s} onPress={() => setTravelStyle(s)} />)}
        </View>

        {/* Country: a pressable field that opens the CountryPicker modal below. */}
        <Text style={styles.label}>Country</Text>
        <Pressable style={styles.input} onPress={() => setCountryPickerVisible(true)}>
          <Text style={{ color: country ? theme.color.cream : theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 15 }}>{country || 'Select your country'}</Text>
        </Pressable>

        <Text style={styles.label}>Home city</Text>
        <TextInput style={styles.input} placeholder="e.g. Guwahati" placeholderTextColor={theme.color.muted} value={homeCity} onChangeText={setHomeCity} />

        {/* Optional next trip: destinations via place search, plus start and
            return dates. The return date can't be set before the start date. */}
        <Text style={styles.label}>Your next trip (optional)</Text>
        <PlaceAutocomplete value={tripDestinations} onChange={setTripDestinations} />
        <View style={[styles.row, { marginTop: 10 }]}>
          <View style={{ flex: 1 }}><DateField label="Start date" value={tripStartDate} onChange={setTripStartDate} minimumDate={new Date()} /></View>
          <View style={{ flex: 1 }}><DateField label="Return date" value={tripEndDate} onChange={setTripEndDate} minimumDate={tripStartDate ?? new Date()} /></View>
        </View>

        {/* Submit; disabled and showing a spinner while the save is in flight. */}
        <Pressable style={styles.button} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>

        <CountryPicker visible={countryPickerVisible} onClose={() => setCountryPickerVisible(false)} onSelect={setCountry} />
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

/**
 * A pill-shaped toggle button used for every choice list on this screen.
 * Gold fill when `selected`; `onPress` decides single vs multi-select.
 * Local to this file because it is only used here.
 */
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

// Styles use colour, font and radius tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Page and headings
  container: { padding: 24, paddingTop: 70, paddingBottom: 50 },
  eyebrow: { fontFamily: theme.font.mono, fontSize: 11, letterSpacing: 1.5, color: theme.color.gold },
  title: { fontFamily: theme.font.display, fontSize: 25, color: theme.color.cream, marginTop: 8 },
  subtitle: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, marginTop: 6, marginBottom: 8 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 22, marginBottom: 10 },
  // Chips
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.surface },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
  // Inputs and buttons
  customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  addBtn: { backgroundColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: theme.color.cream, fontFamily: theme.font.body, fontSize: 13 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 32 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});