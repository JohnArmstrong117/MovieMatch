import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

function getParamsFromUrl(url: string): URLSearchParams {
  const [withoutHash, hash = ''] = url.split('#');
  const queryPart = withoutHash.includes('?') ? withoutHash.split('?')[1] : '';
  const merged = [queryPart, hash].filter(Boolean).join('&');
  return new URLSearchParams(merged);
}

export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const router = useRouter();

  const passwordValidationError = useMemo(() => {
    if (newPassword.length > 0 && newPassword.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    if (confirmPassword.length > 0 && newPassword !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  }, [newPassword, confirmPassword]);

  useEffect(() => {
    let isMounted = true;

    const hydrateRecoverySession = async (url: string) => {
      const params = getParamsFromUrl(url);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (!accessToken || !refreshToken || type !== 'recovery') {
        return false;
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        throw error;
      }
      return true;
    };

    const bootstrap = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        const recoveredFromInitial = initialUrl ? await hydrateRecoverySession(initialUrl) : false;

        if (!recoveredFromInitial && isMounted) {
          setLinkError('Invalid or expired reset link. Please request a new password reset email.');
        }
      } catch (error: any) {
        if (isMounted) {
          setLinkError(error?.message || 'Unable to validate reset link.');
        }
      } finally {
        if (isMounted) {
          setReady(true);
        }
      }
    };

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void hydrateRecoverySession(url).catch((error: any) => {
        setLinkError(error?.message || 'Unable to validate reset link.');
      });
    });

    void bootstrap();

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please enter and confirm your new password.');
      return;
    }
    if (passwordValidationError) {
      Alert.alert('Error', passwordValidationError);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        throw error;
      }

      Alert.alert('Success', 'Password updated. Please sign in with your new password.');
      router.replace('/(auth)/login');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Unable to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.content}>
        <ThemedText type="title" style={styles.title}>
          Reset Password
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Choose a new password for your account.
        </ThemedText>

        {!ready ? (
          <ActivityIndicator size="large" />
        ) : linkError ? (
          <ThemedText style={styles.errorText}>{linkError}</ThemedText>
        ) : (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="New Password"
              placeholderTextColor="#999"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm New Password"
              placeholderTextColor="#999"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
            />
            {passwordValidationError ? (
              <ThemedText style={styles.errorText}>{passwordValidationError}</ThemedText>
            ) : null}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleUpdatePassword}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>Update Password</ThemedText>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.7,
  },
  form: {
    width: '100%',
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#c41010',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: '#b00020',
    marginBottom: 8,
    textAlign: 'center',
  },
});
