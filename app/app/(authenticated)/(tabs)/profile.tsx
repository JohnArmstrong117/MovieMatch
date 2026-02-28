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
} from 'react-native';
import { Link, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { profileHelpers } from '@/lib/db-helpers';

const AVATAR_COLOR_PRESETS = [
  '#e01245',
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
  const { user, signOut } = useAuth();
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
    } catch {
      Alert.alert('Error', 'Failed to save display name');
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
        </View>

        <TouchableOpacity
          style={[styles.signOutButton, { backgroundColor: colors.icon }]}
          onPress={handleSignOut}
          activeOpacity={0.8}>
          <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
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
});
