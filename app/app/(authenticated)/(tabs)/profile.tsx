import { StyleSheet, ScrollView, TouchableOpacity, View, Alert } from 'react-native';
import { Link, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/auth-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const displayName =
    (user?.user_metadata?.name as string)?.trim() ||
    user?.email?.split('@')[0] ||
    'User';

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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.tint }]}>
            <ThemedText style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <ThemedText type="title" style={styles.displayName}>
            {displayName}
          </ThemedText>
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
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '600',
    color: '#fff',
  },
  displayName: {
    marginBottom: 4,
    textAlign: 'center',
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
