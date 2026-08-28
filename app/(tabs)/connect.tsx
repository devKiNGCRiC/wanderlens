import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export default function Placeholder() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.dusk, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: theme.font.display, color: theme.color.cream, fontSize: 18 },
});