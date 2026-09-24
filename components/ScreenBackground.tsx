/**
 * ScreenBackground, the shared full-screen backdrop behind every screen.
 *
 * Purpose: gives the whole app its "blue hour" atmosphere from one file:
 * a night-sky constellation at the top fading into topographic contour lines
 * at the bottom (astro photography meets trail maps; see .claude/rules/ui-ux.md).
 * Nearly every screen in app/ wraps its content in this, so changing the
 * backdrop here changes it everywhere. Don't re-create it per screen.
 *
 * How it works:
 * - Layer 1: a solid `dusk` View that also hosts the children.
 * - Layer 2: an absolutely positioned vertical LinearGradient from a deep
 *   purple, through dusk, to near-black.
 * - Layer 3: an absolutely positioned SVG drawn in a 400x900 coordinate space
 *   (`viewBox`) that stretches to fill the screen: faint gold constellation
 *   line, cream star dots, and four gold contour curves.
 * - Children render last, on top of all decoration.
 * - All shapes are hardcoded constants, so there is no state and no animation.
 */
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { theme } from '@/constants/theme';

/** Star positions and radii, in the SVG's 400x900 viewBox units. */
const STARS = [
  { x: 280, y: 80, r: 1.6 }, { x: 320, y: 130, r: 1.8 }, { x: 300, y: 190, r: 1.4 },
  { x: 250, y: 160, r: 1.6 }, { x: 200, y: 100, r: 1.3 },
  { x: 60, y: 140, r: 1.2 }, { x: 340, y: 240, r: 1 }, { x: 100, y: 260, r: 1.4 },
  { x: 180, y: 60, r: 1 }, { x: 370, y: 300, r: 1.2 }, { x: 40, y: 220, r: 1 },
];
/**
 * SVG path joining the first five stars into a constellation
 * ("M" = move to a point, "L" = draw a line to the next point).
 */
const CONSTELLATION_LINE = 'M280,80 L320,130 L300,190 L250,160 L200,100';

/**
 * Four wavy contour lines near the bottom of the viewBox (y 680 to 860).
 * "C" draws a cubic Bezier curve, giving the hand-drawn map-line feel.
 */
const CONTOURS = [
  'M0,700 C60,680 120,720 200,695 C280,670 340,710 400,690',
  'M0,745 C70,725 140,760 220,737 C300,715 350,750 400,730',
  'M0,795 C65,775 150,810 230,787 C305,765 355,800 400,780',
  'M0,845 C75,825 155,860 235,837 C310,815 360,850 400,830',
];

/**
 * Wraps a screen's content in the decorated background.
 * @param children - the screen content, drawn above the decoration.
 */
export function ScreenBackground({ children }: { children: React.ReactNode }) {
  // Styles are inline here rather than in a StyleSheet (the file has none).
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.dusk }}>
      {/* Vertical sky gradient. The purple top and near-black bottom are hex
          literals, not theme tokens. */}
      <LinearGradient
        colors={['#1B1530', theme.color.dusk, '#0F1119']}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Decoration layer: constellation, stars, then contours. Contour
          opacity rises slightly with each line (0.06 up to 0.105). */}
      <Svg width="100%" height="100%" viewBox="0 0 400 900" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Path d={CONSTELLATION_LINE} stroke={theme.color.gold} strokeWidth={0.6} opacity={0.22} fill="none" />
        {STARS.map((s, i) => (
          <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={theme.color.cream} opacity={0.35} />
        ))}
        {CONTOURS.map((d, i) => (
          <Path key={i} d={d} stroke={theme.color.gold} strokeWidth={0.7} opacity={0.06 + i * 0.015} fill="none" />
        ))}
      </Svg>
      {/* Screen content on top */}
      {children}
    </View>
  );
}