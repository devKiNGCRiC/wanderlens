/**
 * Layout for the (auth) route group: login, signup and forgot-password.
 *
 * Purpose: a plain headerless Stack for the signed-out screens. The group is
 * only reachable under guard 4 in app/_layout.tsx (no session, not in
 * password recovery); signing in flips that guard and expo-router moves the
 * user on to onboarding or the tabs automatically. The parentheses in the
 * folder name mean "(auth)" does not appear in the URL.
 */
import { Stack } from 'expo-router';
/** Headerless Stack; each auth screen draws its own title. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}