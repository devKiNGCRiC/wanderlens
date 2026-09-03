import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

type Props = {
  name: string;
  onAccept: () => void;
};

export function RequestBanner({ name, onAccept }: Props) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{name} wants to message you. Replying accepts the request.</Text>
      <Pressable onPress={onAccept} style={styles.acceptBtn}>
        <Text style={styles.acceptText}>Accept</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { margin: 14, padding: 14, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, gap: 10 },
  text: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted, lineHeight: 18 },
  acceptBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.sm, paddingVertical: 9, alignItems: 'center' },
  acceptText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.dusk },
});
