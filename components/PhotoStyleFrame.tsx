/**
 * PhotoStyleFrame, draws a photo inside one of seven decorative frames.
 *
 * Purpose: the rendering half of the "photo styles" feature. It shows the
 * live preview on the Add Spot screen and in the Photo Styles studio
 * (app/photo-studio.tsx), and it is also the View that gets captured to an
 * image when a styled photo is saved or sent (e.g. the chat polaroid export).
 * PhotoStylePicker and CaptionFontPicker are the matching controls.
 *
 * How it works:
 * - `style` picks the frame: 'polaroid' (cream border, deep bottom margin),
 *   'filmRetro' (thin border + film-grain dots + orange date stamp), four
 *   "tinted" styles that share one layout (a translucent color wash over the
 *   photo, see TINTED_SPECS), or 'none' (bare photo).
 * - Every dimension is a fraction of `size`, so the same frame renders
 *   identically as a small preview or a 640px export; `buildStyles(size)`
 *   rebuilds the StyleSheet only when `size` changes (useMemo).
 * - `innerRef` is attached to the outermost View so a caller can snapshot it
 *   (react-native-view-shot's captureRef, see lib/media.ts).
 *   `collapsable={false}` stops Android from optimising that View away,
 *   which would leave the ref with nothing to capture.
 */
import { useMemo, type RefObject } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '@/constants/theme';

/** Every available frame style. Also the value type for PhotoStylePicker. */
export type PhotoStyleKey = 'none' | 'polaroid' | 'vintage' | 'filmRetro' | 'goldenHour' | 'blueHour' | 'noir';
/** Any key of `theme.font`, so a caption font is always one the app has loaded. */
export type CaptionFontKey = keyof typeof theme.font;

/**
 * `photoUri` is the image to frame (local file or remote URL; null draws an
 * empty placeholder square); `caption` is drawn under the photo when non-empty.
 */
type Props = {
  photoUri: string | null;
  caption?: string | null;
  style: PhotoStyleKey;
  // Overrides the style's default caption font when set — lets the caller
  // offer a font choice independent of which frame style is picked.
  captionFont?: CaptionFontKey;
  innerRef?: RefObject<View | null>;
  // Square photo size in px. Defaults to the export resolution used by
  // components/chat/MessageBubble.tsx's polaroid export (640) — pass a
  // smaller value for an on-screen preview that needs to fit the display;
  // the composited result still captures at whatever size is rendered.
  size?: number;
};

// A tinted style is a photo wash + rounded corners + a caption in its own
// default font/color — vintage, golden hour, blue hour, and noir are all
// this same shape, just with a different tint/radius/caption treatment.
const TINTED_SPECS: Record<'vintage' | 'goldenHour' | 'blueHour' | 'noir', {
  tint: string; radius: number; captionFont: CaptionFontKey; captionColor: string; uppercase?: boolean;
}> = {
  vintage: { tint: theme.color.vintageTint, radius: 16, captionFont: 'displayItalic', captionColor: theme.color.dusk },
  goldenHour: { tint: theme.color.goldenHourWash, radius: 10, captionFont: 'body', captionColor: theme.color.ember },
  blueHour: { tint: theme.color.blueHourWash, radius: 10, captionFont: 'displayItalic', captionColor: theme.color.duskPurple },
  noir: { tint: theme.color.noirWash, radius: 2, captionFont: 'mono', captionColor: theme.color.dusk, uppercase: true },
};

/**
 * Formats a date like a film camera's burned-in stamp, e.g. "09 24 '26".
 * Called with `new Date()`, so the stamp shows the render date, not the
 * date the photo was taken.
 */
function formatDateStamp(date: Date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm} ${dd} '${yy}`;
}

/**
 * Renders the framed photo for the chosen style. Pure presentation: no state,
 * no network. Returns one of four layouts below depending on `style`.
 */
export function PhotoStyleFrame({ photoUri, caption, style, captionFont, innerRef, size = 640 }: Props) {
  // Size-scaled styles, rebuilt only when the size changes.
  const s = useMemo(() => buildStyles(size), [size]);

  // A fixed, deterministic scatter of small dots standing in for film grain —
  // the same technique ScreenBackground.tsx uses for its star field
  // (scattered low-opacity <Circle> elements), not a texture asset or a new
  // dependency.
  // The positions come from multiplying the index by primes and wrapping with
  // `% size`, so they look random but are identical on every render.
  const grainDots = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        x: (i * 53) % size,
        y: (i * 97 + i * i * 7) % size,
        r: (i % 3) + 0.5,
        opacity: 0.05 + (i % 5) * 0.03,
      })),
    [size]
  );

  // Polaroid: square photo on a cream card with a wide bottom margin for the
  // caption (default font: display italic).
  if (style === 'polaroid') {
    return (
      <View ref={innerRef} collapsable={false} style={s.polaroidFrame}>
        <View style={s.polaroidPhotoWrap}>
          {photoUri && <Image source={{ uri: photoUri }} style={s.photo} />}
        </View>
        {!!caption && <Text style={[s.polaroidCaption, { fontFamily: theme.font[captionFont ?? 'displayItalic'] }]}>{caption}</Text>}
      </View>
    );
  }

  // Film retro: thin cream border, an SVG layer of grain dots over the photo,
  // and a date stamp in the bottom-right corner.
  if (style === 'filmRetro') {
    return (
      <View ref={innerRef} collapsable={false} style={s.filmFrame}>
        <View style={s.filmPhotoWrap}>
          {photoUri && <Image source={{ uri: photoUri }} style={s.photo} />}
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            {grainDots.map((d, i) => (
              <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={theme.color.cream} opacity={d.opacity} />
            ))}
          </Svg>
          <Text style={s.filmDateStamp}>{formatDateStamp(new Date())}</Text>
        </View>
        {!!caption && <Text style={[s.filmCaption, { fontFamily: theme.font[captionFont ?? 'bodyRegular'] }]}>{caption}</Text>}
      </View>
    );
  }

  // Tinted styles share one layout; the per-style differences come from
  // TINTED_SPECS. The tint is a full-size translucent View laid over the photo.
  if (style === 'vintage' || style === 'goldenHour' || style === 'blueHour' || style === 'noir') {
    const spec = TINTED_SPECS[style];
    return (
      <View ref={innerRef} collapsable={false} style={s.tintedFrame}>
        <View style={[s.tintedPhotoWrap, { borderRadius: spec.radius }]}>
          {photoUri && <Image source={{ uri: photoUri }} style={s.photo} />}
          <View style={[s.tintOverlay, { backgroundColor: spec.tint }]} />
        </View>
        {!!caption && (
          <Text
            style={[
              s.tintedCaption,
              { fontFamily: theme.font[captionFont ?? spec.captionFont], color: spec.captionColor },
              spec.uppercase && { textTransform: 'uppercase', letterSpacing: 1 },
            ]}
          >
            {caption}
          </Text>
        )}
      </View>
    );
  }

  // 'none' — plain photo, no frame at all (used as the default/unstyled option).
  return (
    <View ref={innerRef} collapsable={false} style={s.noneWrap}>
      {photoUri && <Image source={{ uri: photoUri }} style={s.photo} />}
    </View>
  );
}

/**
 * Builds the frame styles for a given photo size. Unlike most files, the
 * StyleSheet is created in a function because paddings, widths and font
 * sizes are fractions of `size`. Colors and radii still come from the theme
 * tokens in constants/theme.ts. Each frame's width is `size` plus its two
 * side paddings (e.g. polaroid: 1 + 2 * 0.044 = 1.088, rounded to 1.0875).
 */
function buildStyles(size: number) {
  return StyleSheet.create({
    // Shared photo fill + the unstyled 'none' wrapper
    photo: { width: '100%', height: '100%' },
    noneWrap: { width: size, height: size, backgroundColor: theme.color.surface2, overflow: 'hidden' },

    // Polaroid
    polaroidFrame: { backgroundColor: theme.color.cream, padding: size * 0.044, paddingBottom: size * 0.072, borderRadius: theme.radius.md, width: size * 1.0875 },
    polaroidPhotoWrap: { width: size, height: size, borderRadius: 6, overflow: 'hidden', backgroundColor: theme.color.surface2 },
    polaroidCaption: { fontSize: size * 0.047, marginTop: size * 0.03, textAlign: 'center', color: theme.color.dusk },

    // Tinted styles (vintage, golden hour, blue hour, noir)
    tintedFrame: { backgroundColor: theme.color.cream, padding: size * 0.022, borderRadius: theme.radius.md, width: size * 1.044 },
    tintedPhotoWrap: { width: size, height: size, overflow: 'hidden', backgroundColor: theme.color.surface2 },
    tintOverlay: { ...StyleSheet.absoluteFillObject },
    tintedCaption: { fontSize: size * 0.0375, marginTop: size * 0.022, textAlign: 'center' },

    // Film retro
    filmFrame: { backgroundColor: theme.color.cream, padding: size * 0.0156, borderRadius: theme.radius.sm, width: size * 1.031 },
    filmPhotoWrap: { width: size, height: size, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.color.surface2 },
    filmDateStamp: { position: 'absolute', right: size * 0.025, bottom: size * 0.022, fontFamily: theme.font.mono, fontSize: size * 0.031, color: theme.color.ember },
    filmCaption: { fontSize: size * 0.028, marginTop: size * 0.019, textAlign: 'center', color: theme.color.dusk },
  });
}
