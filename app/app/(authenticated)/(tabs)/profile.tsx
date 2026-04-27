import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
  TextInput,
  Text,
  Linking,
} from 'react-native';
import { Link, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { accountHelpers, profileHelpers, swipeHelpers } from '@/lib/db-helpers';

const AVATAR_COLOR_PRESETS = [
  '#c41010',
  '#6B2D3C',
  '#0a7ea4',
  '#1a5f7a',
  '#2d6a4f',
  '#5c4d7d',
  '#b5651d',
  '#9d4edd',
  '#2ec4b6',
];

export default function ProfileScreen() {
  const { user, session, signOut } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const inputTextColor = useThemeColor({}, 'text');
  const inputPlaceholderColor = useThemeColor({}, 'icon');
  const inputBorderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.15)', dark: 'rgba(255,255,255,0.2)' },
    'icon'
  );

  const [displayName, setDisplayName] = useState('');
  const [avatarColor, setAvatarColor] = useState(colors.tint);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clearingPasses, setClearingPasses] = useState<'movie' | 'tv' | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const profile = await profileHelpers.getProfile(user.id);
      setDisplayName(profile?.display_name || '');
      const saved = profile?.avatar_color;
      setAvatarColor(saved && /^#[0-9A-Fa-f]{6}$/.test(saved) ? saved : colors.tint);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user, colors.tint]);

  useEffect(() => {
    if (user) loadProfile();
  }, [user, loadProfile]);

  const displayNameFallback =
    displayName.trim() ||
    (user?.user_metadata?.name as string)?.trim() ||
    user?.email?.split('@')[0] ||
    'User';

  const saveDisplayName = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await profileHelpers.updateProfile(user.id, {
        display_name: displayName.trim() || null,
      });
    } catch (e) {
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'Failed to save display name'
      );
    } finally {
      setSaving(false);
    }
  };

  const saveAvatarColor = async (hex: string) => {
    if (!user) return;
    setAvatarColor(hex);
    try {
      await profileHelpers.updateProfile(user.id, {
        avatar_color: hex,
      });
    } catch (e) {
      // Column may not exist until migration 20240113000000_profiles_avatar_color is applied
      if (__DEV__) console.warn('Could not save icon color (migration applied?)', e);
    }
  };

  const confirmDeleteAccount = () => {
    if (!user || !session || deletingAccount) return;
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all data on our servers: profile, preferences, swipes, matches, friends, and recommendations. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await accountHelpers.deleteMyAccount();
              await signOut();
              router.replace('/(auth)/login');
            } catch (e: unknown) {
              const message =
                e instanceof Error ? e.message : 'Could not delete your account. Try again later.';
              Alert.alert('Error', message);
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)/login');
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : 'Failed to sign out';
              Alert.alert('Error', message);
            }
          },
        },
      ]
    );
  };

  const openPrivacyPolicy = async () => {
    const url = 'https://johnarmstrong117-vgapl.wordpress.com/privacypolicy/';
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert('Unable to open link', 'Could not open the privacy policy URL.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open link', 'Could not open the privacy policy URL.');
    }
  };

  const confirmClearPassed = (type: 'movie' | 'tv') => {
    if (!user) return;
    const label = type === 'movie' ? 'passed movies' : 'passed TV shows';
    Alert.alert(
      'Reset passed titles',
      `This will remove all your ${label} so they can appear in your swipe deck again. Your likes and matches will be kept.\n\nContinue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setClearingPasses(type);
              await swipeHelpers.clearPassedSwipes(user.id, type);
              Alert.alert('Done', `Your ${label} have been reset.`);
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : 'Failed to reset passed titles';
              Alert.alert('Error', message);
            } finally {
              setClearingPasses(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <View style={[styles.avatarCircle, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText} numberOfLines={1}>
              {displayNameFallback.charAt(0).toUpperCase()}
            </Text>
          </View>
          <ThemedText style={styles.colorLabel}>Icon color</ThemedText>
          <View style={styles.colorRow}>
            {AVATAR_COLOR_PRESETS.map((hex) => (
              <TouchableOpacity
                key={hex}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: hex },
                  avatarColor === hex && styles.colorSwatchSelected,
                ]}
                onPress={() => saveAvatarColor(hex)}
              />
            ))}
          </View>
          <TextInput
            style={[
              styles.displayNameInput,
              {
                color: inputTextColor,
                borderColor: inputBorderColor,
              },
            ]}
            placeholder="Display name (shown to friends)"
            placeholderTextColor={inputPlaceholderColor}
            value={displayName}
            onChangeText={setDisplayName}
            onBlur={saveDisplayName}
            editable={!saving}
          />
          {saving && <ActivityIndicator size="small" style={styles.savingIndicator} />}
          {user?.email && (
            <ThemedText style={styles.email}>{user.email}</ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Account
          </ThemedText>

          <Link href="/(auth)/forgot-password" asChild>
            <TouchableOpacity style={styles.menuRow}>
              <IconSymbol name="lock.fill" size={22} color={colors.icon} />
              <ThemedText style={styles.menuLabel}>Change password</ThemedText>
              <IconSymbol name="chevron.right" size={20} color={colors.icon} />
            </TouchableOpacity>
          </Link>

          <TouchableOpacity
            style={[styles.menuRow, styles.deleteAccountRow]}
            onPress={confirmDeleteAccount}
            disabled={deletingAccount || !session}>
            {deletingAccount ? (
              <ActivityIndicator size="small" color="#c41010" />
            ) : (
              <IconSymbol name="trash.fill" size={22} color="#c41010" />
            )}
            <ThemedText style={styles.deleteAccountLabel}>Delete account</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Reset passed titles
          </ThemedText>
          <ThemedText style={styles.sectionHelper}>
            Removing passed titles lets those movies or shows appear in your swipe deck again. Likes and matches are not affected.
          </ThemedText>
          <View style={styles.resetButtonsRow}>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => confirmClearPassed('movie')}
              disabled={clearingPasses === 'movie'}>
              {clearingPasses === 'movie' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.resetButtonText}>Reset passed movies</ThemedText>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => confirmClearPassed('tv')}
              disabled={clearingPasses === 'tv'}>
              {clearingPasses === 'tv' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={styles.resetButtonText}>Reset passed TV</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: colors.icon }]}
          onPress={handleSignOut}
          activeOpacity={0.8}>
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.privacyPolicyLink}
          onPress={openPrivacyPolicy}
          activeOpacity={0.8}>
          <ThemedText style={styles.privacyPolicyText}>Privacy Policy</ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    opacity: 0.8,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '700',
    color: '#fff',
  },
  colorLabel: {
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.9,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#fff',
    borderWidth: 2,
  },
  displayNameInput: {
    width: '100%',
    maxWidth: 280,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 4,
  },
  savingIndicator: {
    marginVertical: 4,
  },
  email: {
    fontSize: 14,
    opacity: 0.8,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionHelper: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    gap: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
  },
  deleteAccountRow: {
    marginTop: 12,
    backgroundColor: 'rgba(196, 16, 16, 0.08)',
  },
  deleteAccountLabel: {
    flex: 1,
    fontSize: 16,
    color: '#c41010',
    fontWeight: '600',
  },
  signOutButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  privacyPolicyLink: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  privacyPolicyText: {
    fontSize: 14,
    opacity: 0.8,
    textDecorationLine: 'underline',
  },
  resetButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#c41010',
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
