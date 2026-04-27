import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert, Linking } from 'react-native';
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
import { friendHelpers, profileHelpers } from '@/lib/db-helpers';
import { LEGAL_TERMS_VERSION, PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/legal';

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
        const count = await friendHelpers.getRecommendationsReceivedUnreadCount(since ?? null);
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
  const { user, signOut } = useAuth();
  const [checkingTerms, setCheckingTerms] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptingTerms, setAcceptingTerms] = useState(false);

  const [fontsLoaded] = useFonts({
    Limelight_400Regular,
  });

  useEffect(() => {
    let cancelled = false;
    const checkTerms = async () => {
      if (!user) {
        if (!cancelled) {
          setShowTermsModal(false);
          setCheckingTerms(false);
        }
        return;
      }
      try {
        const profile = await profileHelpers.getProfile(user.id);
        const accepted =
          !!profile?.terms_accepted_at && profile?.terms_version === LEGAL_TERMS_VERSION;
        if (!cancelled) setShowTermsModal(!accepted);
      } catch {
        if (!cancelled) setShowTermsModal(true);
      } finally {
        if (!cancelled) setCheckingTerms(false);
      }
    };
    checkTerms();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!fontsLoaded || checkingTerms) {
    return null;
  }

  const openUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open link', 'Could not open the link.');
    }
  };

  const acceptTermsAndContinue = async () => {
    if (!user || acceptingTerms) return;
    setAcceptingTerms(true);
    try {
      await profileHelpers.updateProfile(user.id, {
        terms_accepted_at: new Date().toISOString(),
        terms_version: LEGAL_TERMS_VERSION,
      });
      setShowTermsModal(false);
    } catch {
      Alert.alert('Error', 'Could not save Terms acceptance. Please try again.');
    } finally {
      setAcceptingTerms(false);
    }
  };

  const declineAndSignOut = async () => {
    await signOut();
  };

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
        <Modal visible={showTermsModal} transparent animationType="fade">
          <View style={styles.termsBackdrop}>
            <View style={styles.termsCard}>
              <Text style={styles.termsTitle}>Terms & Privacy Required</Text>
              <Text style={styles.termsBody}>
                To continue, you must accept the Terms/EULA. Objectionable content and abusive behavior are not allowed; accounts may be suspended or removed for violations.
              </Text>
              <View style={styles.termsLinksRow}>
                <TouchableOpacity onPress={() => openUrl(TERMS_URL)} disabled={acceptingTerms}>
                  <Text style={styles.termsLink}>Terms & EULA</Text>
                </TouchableOpacity>
                <Text style={styles.termsDot}> • </Text>
                <TouchableOpacity onPress={() => openUrl(PRIVACY_POLICY_URL)} disabled={acceptingTerms}>
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.termsActions}>
                <TouchableOpacity
                  style={[styles.termsButton, styles.termsDeclineButton]}
                  onPress={declineAndSignOut}
                  disabled={acceptingTerms}>
                  <Text style={styles.termsDeclineText}>Sign out</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.termsButton, styles.termsAcceptButton]}
                  onPress={acceptTermsAndContinue}
                  disabled={acceptingTerms}>
                  <Text style={styles.termsAcceptText}>
                    {acceptingTerms ? 'Saving…' : 'Agree & Continue'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  termsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  termsCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
  },
  termsTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111',
  },
  termsBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#333',
  },
  termsLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 14,
  },
  termsLink: {
    color: '#c41010',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  termsDot: {
    color: '#777',
  },
  termsActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  termsButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  termsDeclineButton: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  termsAcceptButton: {
    backgroundColor: '#c41010',
  },
  termsDeclineText: {
    color: '#222',
    fontWeight: '600',
  },
  termsAcceptText: {
    color: '#fff',
    fontWeight: '700',
  },
});