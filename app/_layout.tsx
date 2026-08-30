//_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthProvider';
import { SplashLoading } from '@/components/SplashLoading';

import { useFonts, Fraunces_500Medium, Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold } from '@expo-google-fonts/manrope';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';


export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium, Fraunces_500Medium_Italic,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold,
    IBMPlexMono_400Regular, IBMPlexMono_500Medium,
  });
  const { session, profile, loading } = useAuth();

  if (!fontsLoaded) return <SplashLoading />;
  if (loading) return <SplashLoading />;

  const isOnboarded = !!profile?.onboarded;

  return (
    <Stack>
      <Stack.Protected guard={!!session && isOnboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="add-spot" options={{ presentation: 'modal', title: 'Add a spot' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !isOnboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootNavigator />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}