/**
 * PlaceAutocomplete, a multi-destination input with place search suggestions.
 *
 * Purpose: where a user lists the destinations they plan to visit, on the
 * onboarding and Edit Profile screens. Those destinations feed the Connect
 * tab's trip matching (see the comment above the component).
 *
 * How it works:
 * - Controlled: the parent owns the `value` array of destinations; this
 *   component only reports changes through `onChange`.
 * - Typing is debounced (DEBOUNCE_MS) before calling `searchPlaces` in
 *   lib/geocoding.ts, which queries OpenStreetMap's Nominatim. Nominatim asks
 *   for roughly one request per second, and lib/geocoding.ts leaves
 *   debouncing to its callers.
 * - A request counter ref discards out-of-order responses (see handler below).
 * - Added destinations show as gold chips; tapping a chip removes it.
 * - Every destination is stored trimmed and lowercased, whether it came from
 *   a suggestion or from free text.
 */
import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { searchPlaces, type PlaceSuggestion } from '@/lib/geocoding';

/** `value` is the current destination list; `placeholder` is the search box hint. */
type Props = {
  value: string[];
  onChange: (destinations: string[]) => void;
  placeholder?: string;
};

/** Wait this long after the last keystroke before searching. */
const DEBOUNCE_MS = 450;

// Chips of already-added destinations + a search-as-you-type field backed
// by Nominatim (lib/geocoding.ts). Picking a suggestion stores its exact
// canonical name, so two people who both search "paris" and pick the same
// suggestion get an identical string — that's what makes the array-overlap
// trip-matching query in app/(tabs)/connect.tsx actually reliable. Typing
// and pressing Add still works as a fallback (e.g. offline, or Nominatim
// has no match) — same trim+lowercase normalization as before.
export function PlaceAutocomplete({ value, onChange, placeholder = 'Add a destination' }: Props) {
  // Search box text, current suggestion list, and whether a search is pending.
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  // Refs, not state: the pending timer and the latest request number are
  // bookkeeping that must not trigger a re-render when they change.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  /**
   * Called on every keystroke. Restarts the debounce timer, and after the
   * user pauses, runs one Nominatim search. The spinner shows from the first
   * keystroke until the latest search answers.
   */
  function handleQueryChange(text: string) {
    setQuery(text);
    // Cancel the previous keystroke's pending search.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Under two characters: too vague to search, so clear suggestions instead.
    if (text.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      // Tag this request with a new number; only the highest number may
      // write results. searchPlaces returns [] on failure instead of throwing.
      const requestId = ++requestIdRef.current;
      const results = await searchPlaces(text);
      // Drop a stale response that resolved after a newer keystroke fired.
      if (requestId === requestIdRef.current) {
        setSuggestions(results);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
  }

  /**
   * Normalises `label` (trim + lowercase) and appends it unless it's empty or
   * already in the list, then clears the search box and suggestions.
   * Used by suggestion taps, the Add button and the keyboard submit key.
   */
  function addDestination(label: string) {
    const d = label.trim().toLowerCase();
    if (d && !value.includes(d)) onChange([...value, d]);
    setQuery('');
    setSuggestions([]);
  }

  /** Removes one destination from the parent's list. */
  function removeDestination(d: string) {
    onChange(value.filter((x) => x !== d));
  }

  return (
    <View>
      {/* Added destinations as removable chips */}
      {value.length > 0 && (
        <View style={styles.row}>
          {value.map((d) => (
            <Pressable key={d} onPress={() => removeDestination(d)} style={[styles.chip, styles.chipSelected]}>
              <Text style={[styles.chipText, styles.chipTextSelected]} numberOfLines={1}>{d} ✕</Text>
            </Pressable>
          ))}
        </View>
      )}
      {/* Search box + manual Add button (no top gap when there are no chips) */}
      <View style={[styles.customRow, value.length === 0 && { marginTop: 0 }]}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder={placeholder}
          placeholderTextColor={theme.color.muted}
          value={query}
          onChangeText={handleQueryChange}
          onSubmitEditing={() => addDestination(query)}
        />
        <Pressable onPress={() => addDestination(query)} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></Pressable>
      </View>
      {/* Either a spinner while searching or up to five suggestion rows.
          Plain .map() is fine here since Nominatim is asked for at most 5. */}
      {searching && <ActivityIndicator color={theme.color.gold} size="small" style={styles.spinner} />}
      {!searching && suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable key={s.id} onPress={() => addDestination(s.label)} style={styles.suggestionRow}>
              <Text style={styles.suggestionText} numberOfLines={1}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// Colors, fonts and radii come from theme tokens in constants/theme.ts.
const styles = StyleSheet.create({
  // Destination chips
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, maxWidth: 240 },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
  // Search input row
  customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  addBtn: { backgroundColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: theme.color.cream, fontFamily: theme.font.body, fontSize: 13 },
  // Spinner and suggestion list
  spinner: { marginTop: 10 },
  suggestions: { marginTop: 8, backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.surface2, overflow: 'hidden' },
  suggestionRow: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  suggestionText: { color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5 },
});
