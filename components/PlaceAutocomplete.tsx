import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { searchPlaces, type PlaceSuggestion } from '@/lib/geocoding';

type Props = {
  value: string[];
  onChange: (destinations: string[]) => void;
  placeholder?: string;
};

const DEBOUNCE_MS = 450;

// Chips of already-added destinations + a search-as-you-type field backed
// by Nominatim (lib/geocoding.ts). Picking a suggestion stores its exact
// canonical name, so two people who both search "paris" and pick the same
// suggestion get an identical string — that's what makes the array-overlap
// trip-matching query in app/(tabs)/connect.tsx actually reliable. Typing
// and pressing Add still works as a fallback (e.g. offline, or Nominatim
// has no match) — same trim+lowercase normalization as before.
export function PlaceAutocomplete({ value, onChange, placeholder = 'Add a destination' }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      const results = await searchPlaces(text);
      // Drop a stale response that resolved after a newer keystroke fired.
      if (requestId === requestIdRef.current) {
        setSuggestions(results);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
  }

  function addDestination(label: string) {
    const d = label.trim().toLowerCase();
    if (d && !value.includes(d)) onChange([...value, d]);
    setQuery('');
    setSuggestions([]);
  }

  function removeDestination(d: string) {
    onChange(value.filter((x) => x !== d));
  }

  return (
    <View>
      {value.length > 0 && (
        <View style={styles.row}>
          {value.map((d) => (
            <Pressable key={d} onPress={() => removeDestination(d)} style={[styles.chip, styles.chipSelected]}>
              <Text style={[styles.chipText, styles.chipTextSelected]} numberOfLines={1}>{d} ✕</Text>
            </Pressable>
          ))}
        </View>
      )}
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, maxWidth: 240 },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
  customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  addBtn: { backgroundColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: theme.color.cream, fontFamily: theme.font.body, fontSize: 13 },
  spinner: { marginTop: 10 },
  suggestions: { marginTop: 8, backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.surface2, overflow: 'hidden' },
  suggestionRow: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  suggestionText: { color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5 },
});
