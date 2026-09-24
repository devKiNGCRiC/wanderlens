/**
 * IconSymbol (iOS version), renders a native SF Symbol.
 *
 * Purpose: a leftover from the `create-expo-app` starter template. Only
 * components/ui/collapsible.tsx (also unused template code) imports
 * `IconSymbol`; nothing in app/ does.
 *
 * How it works: the `.ios.tsx` suffix makes Metro use this file on iOS and
 * icon-symbol.tsx everywhere else. Here `expo-symbols`' `SymbolView` draws
 * Apple's SF Symbol directly, tinted with `color`, in a size x size box.
 */
import { SymbolView, SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { StyleProp, ViewStyle } from 'react-native';

/**
 * Native SF Symbol icon.
 * @param name - any SF Symbol name.
 * @param size - width and height in points (default 24).
 * @param weight - SF Symbol stroke weight (default 'regular').
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
  weight = 'regular',
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
  weight?: SymbolWeight;
}) {
  return (
    <SymbolView
      weight={weight}
      tintColor={color}
      resizeMode="scaleAspectFit"
      name={name}
      style={[
        {
          width: size,
          height: size,
        },
        style,
      ]}
    />
  );
}
