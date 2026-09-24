/**
 * TourProvider: the first-run spotlight tour across the five tabs.
 *
 * Purpose: on a user's first visit to the main app it walks them through the
 * tabs and a few key buttons, dimming the screen and cutting a highlighted
 * "hole" around each target (drawn by components/TourOverlay.tsx). It can be
 * replayed from the Profile menu via `useTour().startTour()`. It wraps the tab
 * navigator in app/(tabs)/_layout.tsx, so it only exists for signed-in,
 * onboarded users.
 *
 * How it works:
 * - Steps come from constants/tourSteps.ts. A step either targets a tab-bar
 *   button (rectangle computed from screen width / TAB_COUNT) or an element a
 *   screen registered with hooks/useTourTarget.ts (rectangle measured on screen).
 * - `goTo(index)` navigates to the step's tab if needed, then polls for the
 *   target to appear and measures it relative to this provider's root View.
 * - A "seen" flag per user id is stored in AsyncStorage so the tour auto-starts
 *   only once per user on this device.
 * - The tour ends quietly if the tab navigator loses focus (another screen was
 *   pushed); the Android back button skips it.
 *
 * Why refs everywhere: steps are async (navigate, sleep, poll), so they read
 * current values from refs instead of closure variables that may be stale by
 * the time the await resumes. `tokenRef` is a cancellation token: each new step
 * or finish bumps it, and an older in-flight step sees the mismatch and stops.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BackHandler, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthProvider';
import { TOUR_STEPS, type TourTab } from '@/constants/tourSteps';
import { TAB_BAR_BASE_HEIGHT, TAB_COUNT } from '@/constants/layout';
import { TourOverlay, type TourRect } from '@/components/TourOverlay';

/** What `useTour()` returns. */
type TourContextType = {
  // Starts (or replays) the tour from step 0.
  startTour: () => void;
  // Registers a highlightable view under an id; returns an unregister function.
  registerTarget: (id: string, ref: RefObject<View | null>) => () => void;
};

// Undefined default so useTour() can detect use outside the provider and throw.
const TourContext = createContext<TourContextType | undefined>(undefined);

// expo-router paths for each tab a step can live on. `satisfies` makes the
// compiler check every TourTab has an entry.
const TAB_HREF = {
  index: '/(tabs)',
  map: '/(tabs)/map',
  connect: '/(tabs)/connect',
  chat: '/(tabs)/chat',
  profile: '/(tabs)/profile',
} as const satisfies Record<TourTab, string>;

// Timing and geometry constants for the tour.
const AUTO_START_DELAY_MS = 1200;
// After switching tabs, give the new screen a beat to lay out before measuring.
const TAB_SETTLE_MS = 250;
const TARGET_POLL_MS = 100;
// The Map FAB only renders after GPS + the nearby-spots query finish, which can
// take a few seconds on a first visit — hence the generous ceiling. If it
// never appears (e.g. location denied) the step falls back to a centered card.
const TARGET_POLL_ATTEMPTS = 40;
// Taps landing this soon after a step resolves are treated as a double-tap.
const ADVANCE_DEBOUNCE_MS = 350;
// Inset >= hole pad (4) + bracket pad (8) so the outermost tabs' corner
// brackets stay on-screen; height keeps the bottom brackets inside the bar.
const TAB_HIGHLIGHT_HEIGHT = 48;
const TAB_HIGHLIGHT_INSET = 12;
const TAB_HIGHLIGHT_RADIUS = 14;

/** A measured rectangle in window coordinates. */
type Box = { x: number; y: number; width: number; height: number };

/**
 * Measures a view's position and size relative to the app window.
 * @returns The box, or null if the view isn't mounted or has zero size yet
 * (not laid out), which the caller treats as "try again".
 */
function measureInWindow(ref: RefObject<View | null>): Promise<Box | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

/** Promise-based delay used between polling attempts. */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Provider that owns tour state and renders the TourOverlay above its children.
 * Rendered by app/(tabs)/_layout.tsx around the Tabs navigator.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // True while the tab navigator is the visible screen (not covered by a pushed screen).
  const isFocused = useIsFocused();
  const { session } = useAuth();
  const userId = session?.user.id;

  // Render state: root size (for tab-rect math and the overlay), the step
  // currently shown with its highlight rectangle, and whether a step is loading.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [resolved, setResolved] = useState<{ index: number; rect: TourRect | null } | null>(null);
  const [busy, setBusy] = useState(false);

  // Non-rendering bookkeeping for the async step logic.
  const rootRef = useRef<View>(null);
  // id -> ref of every view registered through useTourTarget.
  const targetsRef = useRef(new Map<string, RefObject<View | null>>());
  // Cancellation token; see the file header.
  const tokenRef = useRef(0);
  // Synchronous mirrors of state, readable inside callbacks without waiting for a render.
  const busyRef = useRef(false);
  const lastResolvedAtRef = useRef(0);
  const currentTabRef = useRef<TourTab | null>(null);
  const resolvedIndexRef = useRef<number | null>(null);
  // Async steps read the latest of these instead of closing over stale values.
  const latest = useRef({ router, bottomInset: insets.bottom, size, isFocused });
  // No dependency array: refresh the ref after every render.
  useEffect(() => {
    latest.current = { router, bottomInset: insets.bottom, size, isFocused };
  });

  // Per-user AsyncStorage key, so each account on a device sees the tour once.
  const storageKey = userId ? `wanderlens:tour-seen:${userId}` : null;

  // Stop any in-flight step (poll loop) if the provider unmounts, e.g. sign-out.
  useEffect(() => () => { tokenRef.current++; }, []);

  /**
   * Called by useTourTarget on mount. The returned cleanup only deletes the
   * entry if it still points at this ref, so a remounted screen that
   * re-registered the same id isn't removed by the old instance's cleanup.
   */
  const registerTarget = useCallback((id: string, ref: RefObject<View | null>) => {
    targetsRef.current.set(id, ref);
    return () => {
      if (targetsRef.current.get(id) === ref) targetsRef.current.delete(id);
    };
  }, []);

  /**
   * Shows step `index`: switches tab if needed, works out the highlight
   * rectangle, then publishes it to `resolved`. Side effects: navigation and
   * state writes. Bails out silently if a newer step or finish() started
   * meanwhile (token mismatch).
   */
  const goTo = useCallback(async (index: number) => {
    const step = TOUR_STEPS[index];
    // Claim a new token; any older in-flight goTo will now stop.
    const token = ++tokenRef.current;
    busyRef.current = true;
    setBusy(true);

    // Navigate to the step's tab only if we're not already there.
    const tabChanged = currentTabRef.current !== step.tab;
    if (tabChanged) {
      latest.current.router.navigate(TAB_HREF[step.tab]);
      currentTabRef.current = step.tab;
    }

    // Null rect means "no highlight" and the overlay shows a centered card.
    let rect: TourRect | null = null;
    if (step.target.kind === 'tab') {
      // Tab-bar target: computed from geometry. The bar is split into
      // TAB_COUNT equal slots and sits at the bottom, above the safe-area inset.
      const box = latest.current.size;
      if (box) {
        const tabWidth = box.width / TAB_COUNT;
        const barHeight = TAB_BAR_BASE_HEIGHT + latest.current.bottomInset;
        rect = {
          x: step.target.index * tabWidth + TAB_HIGHLIGHT_INSET,
          y: box.height - barHeight + 2,
          width: tabWidth - TAB_HIGHLIGHT_INSET * 2,
          height: TAB_HIGHLIGHT_HEIGHT,
          radius: TAB_HIGHLIGHT_RADIUS,
        };
      }
    } else {
      // Element target: poll until the screen has registered and laid out the
      // view (up to TARGET_POLL_ATTEMPTS x TARGET_POLL_MS), then measure it.
      if (tabChanged) await sleep(TAB_SETTLE_MS);
      for (let attempt = 0; attempt < TARGET_POLL_ATTEMPTS; attempt++) {
        if (token !== tokenRef.current) return;
        const targetRef = targetsRef.current.get(step.target.id);
        if (targetRef) {
          const [target, root] = await Promise.all([measureInWindow(targetRef), measureInWindow(rootRef)]);
          if (target && root) {
            // Convert window coordinates into coordinates relative to the
            // provider's root View, which is where the overlay draws.
            rect = {
              x: target.x - root.x,
              y: target.y - root.y,
              width: target.width,
              height: target.height,
              // Roughly square things (the FABs) get a round cutout.
              radius: Math.abs(target.width - target.height) < 4 ? Math.min(target.width, target.height) / 2 : 14,
            };
            break;
          }
        }
        await sleep(TARGET_POLL_MS);
      }
    }

    // Superseded while measuring: don't overwrite the newer step's state.
    if (token !== tokenRef.current) return;
    resolvedIndexRef.current = index;
    lastResolvedAtRef.current = Date.now();
    setResolved({ index, rect });
    busyRef.current = false;
    setBusy(false);
  }, []);

  /**
   * Ends the tour and resets all step state. Bumping the token cancels any
   * in-flight goTo. `navigateToFeed` is false when the tour is being abandoned
   * because another screen took over, so we don't navigate under the user.
   */
  const finish = useCallback((navigateToFeed = true) => {
    tokenRef.current++;
    busyRef.current = false;
    setBusy(false);
    resolvedIndexRef.current = null;
    currentTabRef.current = null;
    setResolved(null);
    if (navigateToFeed) latest.current.router.navigate(TAB_HREF.index);
  }, []);

  /** Starts the tour from step 0 and marks it as seen for this user. */
  const startTour = useCallback(() => {
    // Written when the tour is shown rather than finished, so force-quitting
    // mid-tour doesn't replay it on the next launch.
    if (storageKey) AsyncStorage.setItem(storageKey, '1').catch(() => {});
    currentTabRef.current = null;
    goTo(0);
  }, [goTo, storageKey]);

  /** "Next" tap handler: advances one step, or finishes after the last. */
  const next = useCallback(() => {
    const current = resolvedIndexRef.current;
    // Ignore taps while no step is shown or one is still loading.
    if (current === null || busyRef.current) return;
    // A tab-target step resolves synchronously, so busyRef alone can't stop a
    // second tap landing in the same frame from skipping a step.
    if (Date.now() - lastResolvedAtRef.current < ADVANCE_DEBOUNCE_MS) return;
    if (current + 1 >= TOUR_STEPS.length) finish();
    else goTo(current + 1);
  }, [finish, goTo]);

  /** "Skip" tap handler: ends the tour and returns to the Feed tab. */
  const skip = useCallback(() => finish(), [finish]);

  // Always-current pointer to startTour, so the auto-start timer below can call
  // the latest version without listing it as an effect dependency.
  const startRef = useRef(startTour);
  useEffect(() => {
    startRef.current = startTour;
  });

  // Auto-start: once per user, after a short delay, if the "seen" flag isn't set.
  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let seen = false;
      try {
        seen = (await AsyncStorage.getItem(storageKey)) === '1';
      } catch {
        // Storage unreadable — treat as seen rather than nagging every launch.
        seen = true;
      }
      if (cancelled || seen) return;
      timer = setTimeout(() => {
        // If the user already pushed another screen, leave the tour for the
        // next launch instead of navigating out from under them.
        if (!cancelled && latest.current.isFocused) startRef.current();
      }, AUTO_START_DELAY_MS);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [storageKey]);

  // The overlay is showing only once a step has resolved and the root has been measured.
  const active = resolved !== null && size !== null;

  // Something else took over (deep link, notification, pushed screen): end the
  // tour quietly without navigating.
  useEffect(() => {
    if (!isFocused && resolved !== null) finish(false);
  }, [isFocused, resolved, finish]);

  // Android hardware back button ends the tour instead of leaving the screen.
  // Returning true tells React Native the press was handled.
  useEffect(() => {
    if (!active || !isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [active, isFocused, finish]);

  // Records the root View's size; returns the previous object when unchanged
  // so an identical layout event doesn't trigger a re-render.
  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  // Memoized so consumers of useTour() don't re-render on every tour state change.
  const value = useMemo(() => ({ startTour, registerTarget }), [startTour, registerTarget]);

  // Renders the app (children) and, as a sibling on top, the TourOverlay,
  // which owns rootRef/onRootLayout and draws the dim + highlight + step card.
  return (
    <TourContext.Provider value={value}>
      {/* Hides the app from screen readers while the tour is up, so focus
          can't wander to tabs sitting under the dim. */}
      <View style={{ flex: 1 }} importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      <TourOverlay
        rootRef={rootRef}
        onRootLayout={onRootLayout}
        size={size}
        step={resolved ? TOUR_STEPS[resolved.index] : null}
        index={resolved?.index ?? 0}
        total={TOUR_STEPS.length}
        rect={resolved?.rect ?? null}
        busy={busy}
        onNext={next}
        onSkip={skip}
      />
    </TourContext.Provider>
  );
}

/**
 * Hook for starting the tour or registering targets.
 * Throws if used outside <TourProvider>, i.e. on a screen outside the tabs.
 */
export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}
