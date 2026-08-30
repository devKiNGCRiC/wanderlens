import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';

const STARS = Array.from({ length: 18 }, (_, i) => ({
  top: (i * 53) % 100,
  left: (i * 87) % 100,
  size: i % 3 === 0 ? 2 : 1,
  opacity: 0.12 + (i % 4) * 0.07,
}));

export function ScreenBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.dusk }}>
      <LinearGradient
        colors={['#1B1530', theme.color.dusk, '#0F1119']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      {STARS.map((s, i) => (
        <View
          key={i}
          style={{
            position: 'absolute', top: `${s.top}%`, left: `${s.left}%`,
            width: s.size, height: s.size, borderRadius: s.size / 2,
            backgroundColor: theme.color.cream, opacity: s.opacity,
          }}
        />
      ))}
      {children}
    </View>
  );
}