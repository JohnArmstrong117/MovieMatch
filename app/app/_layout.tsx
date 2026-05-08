import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, Redirect, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ensureMobileAdsInitialized } from '@/lib/mobile-ads';
import { ensurePushRegistration } from '@/lib/push-notifications';

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

function PushRegistrationHandler() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    void ensurePushRegistration(user.id);
  }, [user?.id]);

  return null;
}

function notificationTargetPath(
  data: Record<string, unknown> | undefined
): '/(authenticated)/(tabs)/friends' | '/(authenticated)/inbox' | null {
  const kind = typeof data?.kind === 'string' ? data.kind : null;
  if (kind === 'friend_request') return '/(authenticated)/(tabs)/friends';
  if (kind === 'recommendation') return '/(authenticated)/inbox';
  return null;
}

function NotificationRoutingHandler() {
  const { user } = useAuth();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const handledIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !rootNavigationState?.key) return;

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handledIdsRef.current.has(id)) return;
      handledIdsRef.current.add(id);

      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      const target = notificationTargetPath(data);
      if (!target) return;
      router.push(target);
    };

    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    return () => {
      sub.remove();
    };
  }, [user?.id, rootNavigationState?.key]);

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
        <PushRegistrationHandler />
        <NotificationRoutingHandler />
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
