/**
 * HapticTab, a bottom-tab button that gives a light haptic tap on iOS.
 *
 * Purpose: a file from the `create-expo-app` starter template (kebab-case
 * name), but unlike most template leftovers it IS still used:
 * app/(tabs)/_layout.tsx passes it as `tabBarButton`, so every tab in the
 * bottom bar is rendered through this component.
 *
 * How it works:
 * - Renders React Navigation's `PlatformPressable` with all the props the tab
 *   bar hands it, so press handling, accessibility and ripple stay intact.
 * - Intercepts `onPressIn` to fire a light haptic on iOS only, then calls the
 *   original `onPressIn` so navigation still happens.
 * - .claude/rules/react-native.md points to this file as the reference
 *   haptic weight for primary actions.
 */
import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

/**
 * Tab bar button with haptic feedback on press-down (iOS only).
 * @param props - the standard button props React Navigation's tab bar supplies.
 */
export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
