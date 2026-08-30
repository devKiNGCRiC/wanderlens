import { useState } from 'react';
import { Modal, View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { COUNTRIES, flagEmoji } from '@/constants/countries';

export function CountryPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (name: string) => void }) {
  const [query, setQuery] = useState('');
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