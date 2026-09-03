---
name: new-screen
description: Add a new expo-router screen to Wanderlens with the correct auth guard, background, theming, and data-fetching pattern. Use when adding any new route or modal.
---

# Adding a screen

The step people forget is #2. Without it the file exists and the route is dead.

## 1. Create the route file

`app/<name>.tsx` for a root route, `app/(tabs)/<name>.tsx` for a tab,
`app/<thing>/[id].tsx` for a detail screen.

## 2. Register it in `app/_layout.tsx`

Add a `<Stack.Screen name="<name>" />` inside the correct guard:

| User state | Guard block |
|---|---|
| Signed in and onboarded | `guard={!!session && isOnboarded}` |
| Signed in, not onboarded | `guard={!!session && !isOnboarded}` |
| Signed out | `guard={!session}` |

Modals get `options={{ presentation: 'modal', title: '...' }}`, matching the
existing `add-spot` and `edit-profile` entries.

Tabs also need an entry in `app/(tabs)/_layout.tsx` with its icon.

## 3. Write the screen

```tsx
import { useState, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { supabase } from '@/lib/supabase';
import { ScreenBackground } from '@/components/ScreenBackground';

type Row = { id: string; title: string };

export default function NameScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        setLoading(true);
        setError(null);
        const { data, error } = await supabase.rpc('...', {});
        if (!alive) return;
        if (error) setError('Could not load. Pull to retry.');
        else setRows((data ?? []) as Row[]);
        setLoading(false);
      })();
      return () => { alive = false; };
    }, [session])
  );

  return <ScreenBackground>{/* four states below */}</ScreenBackground>;
}

const styles = StyleSheet.create({});
```

## 4. Handle all four states

Loading, empty, error, loaded. The empty state gets a real sentence in the app's
voice plus the action that fills it — never a bare "No results."

## 5. Style from tokens

Every color, font, and radius from `constants/theme.ts`. No hex literals.
`StyleSheet.create` at the bottom of the file.

## 6. Verify

```bash
npm run lint
npx tsc --noEmit
```

Then check it in the dev build in the auth state it's guarded by. Report what you
actually ran versus what the user still needs to check on device.

Read `.claude/rules/ui-ux.md` and `.claude/rules/react-native.md` for detail.
