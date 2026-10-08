/**
 * LocationDetailsCard, the resolved-location block on Add Spot.
 *
 * Purpose: geocoders often get a specific spot's name wrong (a pass or lake
 * becomes the nearest town), so the user names the place themselves. The
 * card shows that editable name, then the address the geocoder found
 * (locality · state · country · PIN) and the exact coordinates, so the user
 * can check the pin is really where they mean.
 */
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { formatPlaceLine, formatDecimalCoords, type PlaceDetails } from '@/lib/geocoding';

type Props = {
  lat: number;
  lng: number;
  details: PlaceDetails;
  name: string;
  onChangeName: (name: string) => void;
};

/** Longest place name the spots table accepts (spots_place_text_lengths). */
export const PLACE_NAME_MAX = 80;

export function LocationDetailsCard({ lat, lng, details, name, onChangeName }: Props) {
  const placeLine = formatPlaceLine(details);
  // No name yet (nothing was found to prefill it): flag the field now rather
  // than only failing at Save.
  const missing = name.trim().length === 0;
  return (
    <View style={styles.card}>
      <View style={[styles.nameRow, missing && styles.nameRowMissing]}>
        <Ionicons name="location" size={16} color={theme.color.gold} />
        <TextInput
          style={styles.nameInput}
          value={name}
          onChangeText={onChangeName}
          placeholder="Name this place"
          placeholderTextColor={theme.color.muted}
          maxLength={PLACE_NAME_MAX}
          accessibilityLabel="Place name"
          autoCapitalize="words"
          returnKeyType="done"
          blurOnSubmit
        />
      </View>
      <Text style={[styles.hint, missing && styles.hintMissing]}>
        {missing ? 'Add a name to post this spot.' : 'Call it what photographers here call it.'}
      </Text>
      {placeLine ? <Text style={styles.meta}>{placeLine}</Text> : <Text style={styles.metaMuted}>No address found for this point.</Text>}
      <Text
        style={styles.meta}
        selectable
        accessibilityLabel={`${Math.abs(lat).toFixed(5)} degrees ${lat >= 0 ? 'north' : 'south'}, ${Math.abs(lng).toFixed(5)} degrees ${lng >= 0 ? 'east' : 'west'}`}
      >
        {formatDecimalCoords(lat, lng)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 12, borderRadius: theme.radius.sm, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  nameInput: { flex: 1, minHeight: 44, color: theme.color.cream, fontFamily: theme.font.body, fontSize: 15 },
  nameRowMissing: { borderBottomColor: theme.color.ember },
  hint: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 8 },
  hintMissing: { color: theme.color.ember },
  meta: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.cream, marginTop: 8 },
  metaMuted: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 8 },
});
