# UI / UX rules

## Design language

Wanderlens is a **golden hour / blue hour** identity: warm gradient (ember →
gold → dusk-purple) paired with a deep indigo "blue hour" base. It should feel
like a photographer's field journal at golden hour — not a generic social app.
**This is dark-mode only, deliberately, not light/dark adaptive** — the
aesthetic *is* the brand, the way VSCO or Halide commit to one identity instead
of a generic toggle. `use-color-scheme.ts` and `.web.ts` are hardcoded to
`'dark'` to enforce this. Don't add a light-mode path without asking first.

## Signature visual elements — preserve these, don't quietly redesign them

- **Viewfinder corner brackets** on framed content — a camera focus-bracket
  motif.
- **Polaroid-style tilted photo cards** for galleries (Captures grid, Saved).
  `PolaroidCard` / `PolaroidGridItem` are the components — extend them rather
  than building a parallel card style.
- **`ScreenBackground`** — a constellation (stars + connecting lines) fading
  into topographic contour lines: night-sky/astro photography meets
  trail-map wayfinding. It's a shared wrapper so the whole app's atmosphere
  tunes from one file — don't reimplement the background per-screen.

## Tokens are mandatory

Every color, font, and radius comes from `constants/theme.ts`. Never write a hex
literal in a component.

```ts
color: dusk #14171F · surface #1D2230 · surface2 #262C3D
       gold #E8A64C · ember #D9622E · duskPurple #4B3F72
       cream #F6F1E7 · muted #9AA0B4
font:  display (Fraunces) · displayItalic · body (Manrope 500)
       bodyRegular (Manrope 400) · mono (IBM Plex Mono)
radius: sm 4 · md 14 · lg 22
```

If a design genuinely needs a value that isn't there, add it to `theme.ts` and
use the token — don't inline it.

## Typography roles

- **Fraunces (display)** — screen titles and hero moments only. It's the voice
  of the brand; overusing it flattens the hierarchy.
- **Manrope (body / bodyRegular)** — all UI text, labels, buttons.
- **IBM Plex Mono** — metadata that reads as data: coordinates, timestamps,
  EXIF-flavored detail, tags.

Fonts load in `app/_layout.tsx` via `useFonts` and gate on `<SplashLoading />`.
Any new weight must be registered there or it silently falls back to system.

## Layout

- `<ScreenBackground>` wraps screens for the consistent gradient ground.
- Respect safe-area insets; don't hardcode status bar padding.
- Spacing in multiples of 4. Screen gutters stay consistent across tabs.
- Photos are the content — chrome recedes. Prefer more image, less card border.

## Motion

Motion should feel like a shutter and a slow pan: quick, decisive presses;
unhurried transitions. Haptics on primary actions (save, like, post), never on
scroll or passive events.

## States — non-optional

Every data-driven surface needs four states designed, not just the happy one:

1. **Loading** — `ActivityIndicator` in `gold`, or a skeleton for grids
2. **Empty** — a sentence in the app's voice plus the action that fills it.
   "No spots nearby yet — be the first to add one." Never a bare "No results."
3. **Error** — say what failed and offer retry. Never a raw Supabase message.
4. **Loaded**

## Accessibility

Touch targets ≥ 44pt. `accessibilityLabel` on every icon-only button —
there are many in the tab bar and card overlays. Check `cream` on `surface`
contrast when you dim text; `muted` is already near the floor for small sizes.
