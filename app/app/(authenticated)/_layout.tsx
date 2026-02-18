import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthGate } from '@/components/auth-gate';

export default function AuthenticatedLayout() {
  const insets = useSafeAreaInsets();

  return (
    <AuthGate>
      <View style={styles.container}>
        <View style={[styles.banner, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
          <Text style={styles.bannerText}>FlickSwipe</Text>
        </View>
        <View style={styles.content}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
        </View>
      </View>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a7ea4',
  },
  bannerText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
});