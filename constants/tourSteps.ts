/**
 * Script for the first-run spotlight tour.
 *
 * **Purpose**: defines, in order, each step of the tour that introduces a new user
 * to the app's tabs and key buttons. context/TourProvider.tsx walks through
 * TOUR_STEPS and components/TourOverlay.tsx draws the highlight and text card.
 * The tour can be replayed from the Profile menu.
 *
 * **Gotcha**: tab indexes and `tab` names must match the tab order in
 * app/(tabs)/_layout.tsx, and every 'element' id must be registered on a real
 * view with useTourTarget(id), or that step has nothing to highlight.
 */

/** The tab route names (files in the app/(tabs) folder) a tour step can switch to. */
export type TourTab = 'index' | 'map' | 'connect' | 'chat' | 'profile';

/** One tour step: the text shown, which tab to switch to, and what to spotlight. */
export type TourStep = {
  id: string;
  title: string;
  body: string;
  tab: TourTab;
  // 'tab' targets the tab-bar button at that index (computed geometry);
  // 'element' targets a view registered via useTourTarget(id) (measured).
  target: { kind: 'tab'; index: number } | { kind: 'element'; id: string };
};

// The tour in display order: feed, camera button, map, trail button, connect, chat, profile.
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'feed',
    title: 'Your feed',
    body: 'Spots pinned by real photographers. Filter by genre or time of day to find your kind of light.',
    tab: 'index',
    target: { kind: 'tab', index: 0 },
  },
  {
    id: 'camera',
    title: 'Capture a spot',
    body: 'Snap a geo-tagged photo in one tap. Location, altitude and weather are captured with it.',
    tab: 'index',
    target: { kind: 'element', id: 'feed-camera-fab' },
  },
  {
    id: 'map',
    title: 'The map',
    body: 'Every spot on a real map. Tap a pin for tips, best time to shoot, and the photo.',
    tab: 'map',
    target: { kind: 'tab', index: 1 },
  },
  {
    id: 'trail',
    title: 'AI photo trail',
    body: 'Turns real community spots into a photo route for your day.',
    tab: 'map',
    target: { kind: 'element', id: 'map-trail-fab' },
  },
  {
    id: 'connect',
    title: 'Connect',
    body: 'Find travelers and photographers by destination, dates or genre. Connections are mutual, never a follower count.',
    tab: 'connect',
    target: { kind: 'tab', index: 2 },
  },
  {
    id: 'chat',
    title: 'Chat',
    body: 'Message other travelers, start groups, and share spots straight into a conversation.',
    tab: 'chat',
    target: { kind: 'tab', index: 3 },
  },
  {
    id: 'profile',
    title: 'Your profile',
    body: 'Your captures and saved spots live here. The menu at the top holds Photo styles, Notes and About.',
    tab: 'profile',
    target: { kind: 'tab', index: 4 },
  },
];
