import { View, Text, Image, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

type Props = {
  uri?: string | null;
  label: string;
  size?: number;
};

export function Avatar({ uri, label, size = 42 }: Props) {
  const initial = label.charAt(0).toUpperCase() || '?';
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} />
      ) : (
        <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initial}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: theme.color.gold,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  text: { fontFamily: theme.font.display, color: theme.color.dusk },
});
