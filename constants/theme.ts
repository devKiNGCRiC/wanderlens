export const theme = {
  color: {
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
    display: 'Fraunces_500Medium',
    displayItalic: 'Fraunces_500Medium_Italic',
    body: 'Manrope_500Medium',
    bodyRegular: 'Manrope_400Regular',
    mono: 'IBMPlexMono_400Regular',
  },
  radius: { sm: 4, md: 14, lg: 22 },
};