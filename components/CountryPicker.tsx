/**
 * CountryPicker, a full-screen searchable list of countries.
 *
 * Purpose: lets the user pick their home country during onboarding and on
 * the Edit Profile screen.
 *
 * How it works:
 * - Opens as a full-screen `<Modal>` (not a bottom sheet) because the list
 *   is long and needs a search box.
 * - The country list is static data from constants/countries.ts; typing
 *   filters it by case-insensitive substring match on the name.
 * - A `FlatList` renders rows (it only draws what's on screen, which matters
 *   for a ~200-row list), each showing a flag emoji built from the country code.
 * - Tapping a row reports the country NAME (not the code) via `onSelect`,
 *   then closes.
 */
import { useState } from 'react';
import { Modal, View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { COUNTRIES, flagEmoji } from '@/constants/countries';

/**
 * Country picker modal.
 * @param visible - whether the modal is shown (parent-controlled).
 * @param onClose - called on Cancel, Android back, or after a selection.
 * @param onSelect - receives the chosen country's display name.
 */
export function CountryPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (name: string) => void }) {
  // Search text. It is not reset on close, so reopening shows the last filter.
  const [query, setQuery] = useState('');
  // Recomputed every render; cheap enough for a static list of this size.
  const filtered = COUNTRIES.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.heading}>Choose your country</Text>
        <TextInput style={styles.search} placeholder="Search countries..." placeholderTextColor={theme.color.muted} value={query} onChangeText={setQuery} />
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => { onSelect(item.name); onClose(); }}>
              <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
              <Text style={styles.countryName}>{item.name}</Text>
            </Pressable>
          )}
        />
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// Colors, fonts and radii come from theme tokens in constants/theme.ts.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.dusk, paddingTop: 60, paddingHorizontal: 20 },
  heading: { fontFamily: theme.font.display, fontSize: 20, color: theme.color.cream, marginBottom: 16 },
  search: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, borderWidth: 1, borderColor: theme.color.surface2, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  flag: { fontSize: 22 },
  countryName: { fontFamily: theme.font.bodyRegular, fontSize: 15, color: theme.color.cream },
  closeBtn: { paddingVertical: 16, alignItems: 'center' },
  closeText: { fontFamily: theme.font.body, color: theme.color.muted },
});