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

type TourContextType = {
  startTour: () => void;
  registerTarget: (id: string, ref: RefObject<View | null>) => () => void;
};

const TourContext = createContext<TourContextType | undefined>(undefined);

const TAB_HREF = {
  index: '/(tabs)',
  map: '/(tabs)/map',
  connect: '/(tabs)/connect',
  chat: '/(tabs)/chat',
  profile: '/(tabs)/profile',
} as const satisfies Record<TourTab, string>;

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

type Box = { x: number; y: number; width: number; height: number };

function measureInWindow(ref: RefObject<View | null>): Promise<Box | null> {
  return new Promise((resolve) => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function TourProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [resolved, setResolved] = useState<{ index: number; rect: TourRect | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const rootRef = useRef<View>(null);
  const targetsRef = useRef(new Map<string, RefObject<View | null>>());
  const tokenRef = useRef(0);
  const busyRef = useRef(false);
  const lastResolvedAtRef = useRef(0);
  const currentTabRef = useRef<TourTab | null>(null);
  const resolvedIndexRef = useRef<number | null>(null);
  // Async steps read the latest of these instead of closing over stale values.
  const latest = useRef({ router, bottomInset: insets.bottom, size, isFocused });
  useEffect(() => {
    latest.current = { router, bottomInset: insets.bottom, size, isFocused };
  });

  const storageKey = userId ? `wanderlens:tour-seen:${userId}` : null;

  // Stop any in-flight step (poll loop) if the provider unmounts, e.g. sign-out.
  useEffect(() => () => { tokenRef.current++; }, []);

  const registerTarget = useCallback((id: string, ref: RefObject<View | null>) => {
    targetsRef.current.set(id, ref);
    return () => {
      if (targetsRef.current.get(id) === ref) targetsRef.current.delete(id);
    };
  }, []);

  const goTo = useCallback(async (index: number) => {
    const step = TOUR_STEPS[index];
    const token = ++tokenRef.current;
    busyRef.current = true;
    setBusy(true);

    const tabChanged = currentTabRef.current !== step.tab;
    if (tabChanged) {
      latest.current.router.navigate(TAB_HREF[step.tab]);
      currentTabRef.current = step.tab;
    }

    let rect: TourRect | null = null;
    if (step.target.kind === 'tab') {
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
      if (tabChanged) await sleep(TAB_SETTLE_MS);
      for (let attempt = 0; attempt < TARGET_POLL_ATTEMPTS; attempt++) {
        if (token !== tokenRef.current) return;
        const targetRef = targetsRef.current.get(step.target.id);
        if (targetRef) {
          const [target, root] = await Promise.all([measureInWindow(targetRef), measureInWindow(rootRef)]);
          if (target && root) {
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

    if (token !== tokenRef.current) return;
    resolvedIndexRef.current = index;
    lastResolvedAtRef.current = Date.now();
    setResolved({ index, rect });
    busyRef.current = false;
    setBusy(false);
  }, []);

  const finish = useCallback((navigateToFeed = true) => {
    tokenRef.current++;
    busyRef.current = false;
    setBusy(false);
    resolvedIndexRef.current = null;
    currentTabRef.current = null;
    setResolved(null);
    if (navigateToFeed) latest.current.router.navigate(TAB_HREF.index);
  }, []);

  const startTour = useCallback(() => {
    // Written when the tour is shown rather than finished, so force-quitting
    // mid-tour doesn't replay it on the next launch.
    if (storageKey) AsyncStorage.setItem(storageKey, '1').catch(() => {});
    currentTabRef.current = null;
    goTo(0);
  }, [goTo, storageKey]);

  const next = useCallback(() => {
    const current = resolvedIndexRef.current;
    if (current === null || busyRef.current) return;
    // A tab-target step resolves synchronously, so busyRef alone can't stop a
    // second tap landing in the same frame from skipping a step.
    if (Date.now() - lastResolvedAtRef.current < ADVANCE_DEBOUNCE_MS) return;
    if (current + 1 >= TOUR_STEPS.length) finish();
    else goTo(current + 1);
  }, [finish, goTo]);

  const skip = useCallback(() => finish(), [finish]);

  const startRef = useRef(startTour);
  useEffect(() => {
    startRef.current = startTour;
  });

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

  const active = resolved !== null && size !== null;

  // Something else took over (deep link, notification, pushed screen): end the
  // tour quietly without navigating.
  useEffect(() => {
    if (!isFocused && resolved !== null) finish(false);
  }, [isFocused, resolved, finish]);

  useEffect(() => {
    if (!active || !isFocused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [active, isFocused, finish]);

  const onRootLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const value = useMemo(() => ({ startTour, registerTarget }), [startTour, registerTarget]);

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

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}
