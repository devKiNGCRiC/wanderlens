/**
 * Design tokens: the single source for every color, font, and corner radius in the app.
 *
 * **Purpose**: components and screens read `theme.color.*`, `theme.font.*` and
 * `theme.radius.*` instead of writing hex values or font names inline
 * (a rule in .claude/rules/ui-ux.md), so the whole look can be tuned from here.
 *
 * **Design intent**: the "golden hour / blue hour" identity. A deep indigo dark
 * base (dusk, surface) with warm accents (gold, ember) and a dusk-purple. The app
 * is dark-mode only on purpose, so there is no light palette here.
 *
 * **Gotcha**: the font values are the names registered by `useFonts` in
 * app/_layout.tsx. A new weight must be loaded there too, or text silently falls
 * back to the system font.
 */
export const theme = {
  color: {
    // Core palette. dusk is the screen background; surface/surface2 are raised
    // layers (cards, sheets); gold and ember are the warm accents; cream is primary
    // text and muted is secondary text.
    dusk: '#14171F',
    surface: '#1D2230',
    surface2: '#262C3D',
    gold: '#E8A64C',
    ember: '#D9622E',
    duskPurple: '#4B3F72',
    cream: '#F6F1E7',
    muted: '#9AA0B4',
    // Subtle gold-tinted surface highlight — e.g. an unread row background.
    goldTint: 'rgba(232,166,76,0.06)',
    // Deliberately darker than surface2 — the near-black "hardware" casing
    // behind voice-note and document bubbles, distinct from general UI chrome.
    mediaCasing: '#20242F',
    // A warm muted tone for text on the cream polaroid card — `muted` is a
    // cool blue-gray tuned for dark backgrounds and reads wrong on cream.
    polaroidMuted: '#8a7f6e',
    // A stronger gold tint than goldTint (0.06) — for a badge that needs to
    // read clearly, e.g. an "Admin" pill, not a barely-there highlight.
    goldBadgeTint: 'rgba(232,166,76,0.15)',
    // A warm sepia wash over a photo — the "vintage" photo style's color
    // grade, distinct from goldBadgeTint's flat UI-chrome tint.
    vintageTint: 'rgba(168,110,54,0.32)',
    // Photo-style color washes — same technique as vintageTint, one per
    // additional style added to PhotoStyleFrame.
    goldenHourWash: 'rgba(232,166,76,0.30)',
    blueHourWash: 'rgba(75,63,114,0.42)',
    noirWash: 'rgba(20,23,31,0.58)',
    // A light lavender — `duskPurple` is a background/gradient tone, too
    // dark to read as foreground text on a dark screen. This is the "blue
    // hour" half of the app's dual identity where legible text is needed
    // (e.g. the feed hero's live golden/blue-hour label).
    blueHourLight: '#B7A9E0',
  },
  font: {
    // Fraunces: display serif for titles and hero moments only.
    display: 'Fraunces_500Medium',
    displayItalic: 'Fraunces_500Medium_Italic',
    // Manrope: all UI text, labels, and buttons.
    body: 'Manrope_500Medium',
    bodyRegular: 'Manrope_400Regular',
    // IBM Plex Mono: data-like metadata such as coordinates, timestamps, and tags.
    mono: 'IBMPlexMono_400Regular',
  },
  // Corner radii: sm for small chips, md for cards, lg for large sheets and pills.
  radius: { sm: 4, md: 14, lg: 22 },
};