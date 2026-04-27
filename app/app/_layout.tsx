import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, Redirect, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ensureMobileAdsInitialized } from '@/lib/mobile-ads';

export const unstable_settings = {
  // Don't set anchor - let auth state determine initial route
};

function InitialRouteHandler() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();

  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    if (loading || !rootNavigationState?.key) return;
    if (user && inAuthGroup) {
      router.replace('/(authenticated)/(tabs)');
    }
  }, [user, loading, segments, rootNavigationState?.key]);

  // Redirect to login when not authenticated (after all hooks so hook count is stable)
  if (!loading && rootNavigationState?.key && !user && !inAuthGroup) {
    return <Redirect href="/(auth)/login" />;
  }

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void ensureMobileAdsInitialized();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <InitialRouteHandler />
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(authenticated)" options={{ headerShown: false }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
