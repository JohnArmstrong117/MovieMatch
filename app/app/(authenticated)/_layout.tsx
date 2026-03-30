import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from '@expo-google-fonts/limelight/useFonts';
import { Limelight_400Regular } from '@expo-google-fonts/limelight/400Regular';
import { AuthGate } from '@/components/auth-gate';
import { FirstLoginTutorial } from '@/components/first-login-tutorial';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { NotificationCountsProvider } from '@/contexts/notification-counts-context';
import { friendHelpers } from '@/lib/db-helpers';

const INBOX_LAST_OPENED_KEY = 'inbox_last_opened_at';

function InboxButton() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const isInbox = pathname === '/inbox' || pathname?.endsWith('/inbox');

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    if (isInbox) {
      AsyncStorage.setItem(INBOX_LAST_OPENED_KEY, new Date().toISOString());
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const since = await AsyncStorage.getItem(INBOX_LAST_OPENED_KEY);
        const count = await friendHelpers.getRecommendationsReceivedUnreadCount(user.id, since ?? null);
        if (!cancelled) setUnreadCount(count);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, isInbox, pathname]);

  return (
    <TouchableOpacity
      style={styles.inboxButton}
      onPress={() => router.push('/inbox')}
      hitSlop={12}>
      <View>
        <IconSymbol name="envelope.fill" size={22} color="#fff" />
        {unreadCount > 0 && (
          <View style={styles.inboxBadge}>
            <Text style={styles.inboxBadgeText} numberOfLines={1}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function AuthenticatedLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [fontsLoaded] = useFonts({
    Limelight_400Regular,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthGate>
      <NotificationCountsProvider userId={user?.id}>
        <View style={styles.container}>
          <View style={[styles.banner, { paddingTop: insets.top + 4, paddingBottom: 6 }]}>
            <View style={styles.bannerSpacer} />
            <View style={styles.bannerTitleWrap}>
              <Text style={[styles.bannerText, styles.bannerTextFlick]}>Meesh</Text>
            </View>
            <InboxButton />
          </View>
          <View style={styles.content}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="shared-with" options={{ headerShown: false }} />
              <Stack.Screen name="recommend-to" options={{ headerShown: false }} />
              <Stack.Screen name="inbox" options={{ headerShown: false }} />
              <Stack.Screen name="contacts" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
            </Stack>
          </View>
          <FirstLoginTutorial enabled={!!user} />
        </View>
      </NotificationCountsProvider>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#c41010',
    paddingHorizontal: 16,
    minHeight: 44,
  },
  bannerSpacer: {
    width: 36,
    height: 36,
  },
  bannerTitleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
    paddingHorizontal: 48,
  },
  bannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  bannerText: {
    fontSize: 26,
    color: '#fff',
    letterSpacing: 0.5,
  },
  bannerTextFlick: {
    fontFamily: 'Limelight_400Regular',
    fontWeight: '400',
  },
  inboxButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#e53935',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  inboxBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});