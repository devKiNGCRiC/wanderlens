import { useMemo, type RefObject } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme } from '@/constants/theme';

export type PhotoStyleKey = 'none' | 'polaroid' | 'vintage' | 'filmRetro';

type Props = {
  photoUri: string | null;
  caption?: string | null;
  style: PhotoStyleKey;
  innerRef?: RefObject<View | null>;
  // Square photo size in px. Defaults to the export resolution used by
  // components/chat/MessageBubble.tsx's polaroid export (640) — pass a
  // smaller value for an on-screen preview that needs to fit the display;
  // the composited result still captures at whatever size is rendered.
  size?: number;
};

function formatDateStamp(date: Date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm} ${dd} '${yy}`;
}

export function PhotoStyleFrame({ photoUri, caption, style, innerRef, size = 640 }: Props) {
  const s = useMemo(() => buildStyles(size), [size]);

  // A fixed, deterministic scatter of small dots standing in for film grain —
  // the same technique ScreenBackground.tsx uses for its star field
  // (scattered low-opacity <Circle> elements), not a texture asset or a new
  // dependency.
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

  if (style === 'polaroid') {
    return (
      <View ref={innerRef} collapsable={false} style={s.polaroidFrame}>
        <View style={s.polaroidPhotoWrap}>
          {photoUri && <Image source={{ uri: photoUri }} style={s.photo} />}
        </View>
        {!!caption && <Text style={s.polaroidCaption}>{caption}</Text>}
      </View>
    );
  }

  if (style === 'vintage') {
    return (
      <View ref={innerRef} collapsable={false} style={s.vintageFrame}>
        <View style={s.vintagePhotoWrap}>
          {photoUri && <Image source={{ uri: photoUri }} style={s.photo} />}
          <View style={s.vintageTintOverlay} />
        </View>
        {!!caption && <Text style={s.vintageCaption}>{caption}</Text>}
      </View>
    );
  }

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
        {!!caption && <Text style={s.filmCaption}>{caption}</Text>}
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

function buildStyles(size: number) {
  return StyleSheet.create({
    photo: { width: '100%', height: '100%' },
    noneWrap: { width: size, height: size, backgroundColor: theme.color.surface2, overflow: 'hidden' },

    polaroidFrame: { backgroundColor: theme.color.cream, padding: size * 0.044, paddingBottom: size * 0.072, borderRadius: theme.radius.md, width: size * 1.0875 },
    polaroidPhotoWrap: { width: size, height: size, borderRadius: 6, overflow: 'hidden', backgroundColor: theme.color.surface2 },
    polaroidCaption: { fontFamily: theme.font.displayItalic, fontSize: size * 0.047, color: theme.color.dusk, marginTop: size * 0.03, textAlign: 'center' },

    vintageFrame: { backgroundColor: theme.color.cream, padding: size * 0.022, borderRadius: theme.radius.md, width: size * 1.044 },
    vintagePhotoWrap: { width: size, height: size, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.color.surface2 },
    vintageTintOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.color.vintageTint },
    vintageCaption: { fontFamily: theme.font.displayItalic, fontSize: size * 0.0375, color: theme.color.dusk, marginTop: size * 0.022, textAlign: 'center' },

    filmFrame: { backgroundColor: theme.color.cream, padding: size * 0.0156, borderRadius: theme.radius.sm, width: size * 1.031 },
    filmPhotoWrap: { width: size, height: size, borderRadius: 4, overflow: 'hidden', backgroundColor: theme.color.surface2 },
    filmDateStamp: { position: 'absolute', right: size * 0.025, bottom: size * 0.022, fontFamily: theme.font.mono, fontSize: size * 0.031, color: theme.color.ember },
    filmCaption: { fontFamily: theme.font.bodyRegular, fontSize: size * 0.028, color: theme.color.dusk, marginTop: size * 0.019, textAlign: 'center' },
  });
}
