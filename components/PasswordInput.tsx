/**
 * PasswordInput, a password TextInput with a show/hide eye toggle.
 *
 * Purpose: shared password field for the Login, Signup and Reset Password
 * screens, so all three look and behave the same.
 *
 * How it works:
 * - Accepts normal TextInput props (value, onChangeText, placeholder, ...)
 *   except the ones this component fixes itself: masking, styling,
 *   placeholder color, and auto-capitalize/auto-correct (both off, since
 *   either would silently alter a password).
 * - Local `visible` state flips `secureTextEntry`, and the eye icon's
 *   accessibility label says which action a tap will perform.
 * - The toggle sits absolutely over the right edge; the input has extra
 *   right padding so text never runs underneath it.
 */
import { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/** TextInput props minus the ones PasswordInput controls itself. */
type Props = Omit<TextInputProps, 'secureTextEntry' | 'placeholderTextColor' | 'style' | 'autoCapitalize' | 'autoCorrect'>;

/** Password field; starts masked. All received props are forwarded to the TextInput. */
export function PasswordInput(props: Props) {
  // true = password shown as plain text.
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
      {/* Eye toggle; hitSlop widens its 24pt box toward the 44pt touch target */}
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

// Colors, fonts and radii come from theme tokens in constants/theme.ts.
const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, paddingRight: 44, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  toggle: { position: 'absolute', right: 12, height: 24, width: 24, alignItems: 'center', justifyContent: 'center' },
});
