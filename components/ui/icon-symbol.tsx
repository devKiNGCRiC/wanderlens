// Fallback for using MaterialIcons on Android and web.

/**
 * IconSymbol (Android and web version).
 *
 * Purpose: a leftover from the `create-expo-app` starter template. Its only
 * importer is components/ui/collapsible.tsx, another unused template file;
 * nothing in app/ uses it. The app's own screens use `@expo/vector-icons`
 * directly.
 *
 * How it works:
 * - Metro picks a file by platform suffix: on iOS it loads
 *   icon-symbol.ios.tsx (native SF Symbols); everywhere else it loads this
 *   file, which draws a Material Icon instead.
 * - Callers always pass an SF Symbol name; `MAPPING` translates it to the
 *   matching Material Icons name. A name missing from MAPPING is a type error,
 *   because `IconSymbolName` is derived from MAPPING's keys.
 * - `weight` is accepted for API parity with iOS but ignored here.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

/** SF Symbol name -> Material Icons name. */
type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
/** Only the SF Symbol names that have a mapping below are allowed. */
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
