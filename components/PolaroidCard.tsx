import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

type Props = {
  title: string;
  meta: string;
  distance: string;
  rotate?: number;
  gradientColors?: [string, string];
};

export function PolaroidCard({ title, meta, distance, rotate = 0 }: Props) {
  return (
    <View style={[styles.frame, { transform: [{ rotate: `${rotate}deg` }] }]}>
      <View style={styles.photo} />
      <Text style={styles.caption}>{title}</Text>
      <Text style={styles.metaLine}>{meta} · {distance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: theme.color.cream,
    padding: 8,
    paddingBottom: 14,
    borderRadius: theme.radius.sm,
    width: 150,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  photo: {
    width: '100%',
    height: 128,
    borderRadius: 2,
    backgroundColor: theme.color.surface2, // swap for a real <Image> once spots have photos
  },
  caption: {
    fontFamily: theme.font.displayItalic,
    fontSize: 13,
    color: theme.color.dusk,
    marginTop: 9,
    textAlign: 'center',
  },
  metaLine: {
    fontFamily: theme.font.mono,
    fontSize: 9,
    color: '#8a7f6e',
    textAlign: 'center',
    marginTop: 2,
  },
});