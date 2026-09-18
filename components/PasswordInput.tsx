import { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Props = Omit<TextInputProps, 'secureTextEntry' | 'placeholderTextColor' | 'style' | 'autoCapitalize' | 'autoCorrect'>;

export function PasswordInput(props: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor={theme.color.muted}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        style={styles.toggle}
        hitSlop={10}
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={19} color={theme.color.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, paddingRight: 44, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  toggle: { position: 'absolute', right: 12, height: 24, width: 24, alignItems: 'center', justifyContent: 'center' },
});
