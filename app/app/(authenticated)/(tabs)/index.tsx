import { Image } from 'expo-image';
import { Platform, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HelloWave } from '@/components/hello-wave';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const { user, session, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/(auth)/login');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sign out');
    }
  };

  const checkStoredSession = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const supabaseKeys = keys.filter(key => key.includes('supabase'));
      const sessionData = await AsyncStorage.getItem('supabase.auth.token');
      
      Alert.alert(
        'Stored Session Info',
        `Supabase keys found: ${supabaseKeys.length}\n` +
        `Session data: ${sessionData ? 'Present' : 'Not found'}\n` +
        `Keys: ${supabaseKeys.join(', ')}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const testPersistence = async () => {
    try {
      // Get current session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      Alert.alert(
        'Session Persistence Test',
        `Current session: ${currentSession ? 'Active' : 'None'}\n` +
        `User ID: ${currentSession?.user?.id || 'N/A'}\n` +
        `Email: ${currentSession?.user?.email || 'N/A'}\n` +
        `Expires: ${currentSession?.expires_at ? new Date(currentSession.expires_at * 1000).toLocaleString() : 'N/A'}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome!</ThemedText>
        <HelloWave />
      </ThemedView>

      {/* Auth Debug Info */}
      <ThemedView style={styles.debugContainer}>
        <ThemedText type="subtitle">Auth Status</ThemedText>
        <ThemedText style={styles.debugText}>
          Logged in: {user ? 'Yes' : 'No'}
        </ThemedText>
        {user && (
          <>
            <ThemedText style={styles.debugText}>
              Email: {user.email || 'N/A'}
            </ThemedText>
            <ThemedText style={styles.debugText}>
              User ID: {user.id}
            </ThemedText>
            <ThemedText style={styles.debugText}>
              Session: {session ? 'Active' : 'None'}
            </ThemedText>
          </>
        )}
      </ThemedView>

      {/* Test Buttons */}
      <ThemedView style={styles.testContainer}>
        <ThemedText type="subtitle">Test Auth & Persistence</ThemedText>
        
        <TouchableOpacity style={styles.testButton} onPress={testPersistence}>
          <ThemedText style={styles.buttonText}>Test Session Persistence</ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={styles.testButton} onPress={checkStoredSession}>
          <ThemedText style={styles.buttonText}>Check Stored Session</ThemedText>
        </TouchableOpacity>

        {user && (
          <TouchableOpacity style={[styles.testButton, styles.signOutButton]} onPress={handleSignOut}>
            <ThemedText style={styles.buttonText}>Sign Out</ThemedText>
          </TouchableOpacity>
        )}
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Testing Instructions</ThemedText>
        <ThemedText>
          1. Sign in with your account{'\n'}
          2. Check session persistence - should show active session{'\n'}
          3. Close and restart the app{'\n'}
          4. You should still be logged in (persistence test){'\n'}
          5. Sign out to test the full flow
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  debugContainer: {
    gap: 8,
    marginBottom: 16,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  debugText: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  testContainer: {
    gap: 12,
    marginBottom: 16,
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  testButton: {
    padding: 12,
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    alignItems: 'center',
  },
  signOutButton: {
    backgroundColor: '#dc3545',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
