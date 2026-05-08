import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

type ExpoPushTokenRow = {
  user_id: string;
  expo_push_token: string;
  platform: 'ios' | 'android';
  device_label: string | null;
  enabled: boolean;
  last_seen_at: string;
};

const inFlightByUser = new Map<string, Promise<void>>();
let notificationsConfigured = false;

function getEasProjectId(): string | null {
  const fromEasConfig = Constants?.easConfig?.projectId ?? null;
  if (fromEasConfig) return fromEasConfig;
  const fromExtra = (Constants?.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
    ?.projectId;
  return fromExtra ?? null;
}

function configureNotificationsOnce() {
  if (notificationsConfigured) return;
  notificationsConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#c41010',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = getEasProjectId();
  if (!projectId) {
    console.warn('[Push] Missing EAS project ID; cannot fetch Expo push token.');
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

export async function ensurePushRegistration(userId: string): Promise<void> {
  configureNotificationsOnce();

  if (!userId) return;
  const existing = inFlightByUser.get(userId);
  if (existing) return existing;

  const run = (async () => {
    try {
      const token = await getExpoPushToken();
      if (!token) return;

      const row: ExpoPushTokenRow = {
        user_id: userId,
        expo_push_token: token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        device_label: Device.modelName ?? null,
        enabled: true,
        last_seen_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('push_notification_tokens')
        .upsert(row, { onConflict: 'expo_push_token' });
      if (error) throw error;
    } catch (e) {
      console.warn('[Push] Registration failed:', e);
    } finally {
      inFlightByUser.delete(userId);
    }
  })();

  inFlightByUser.set(userId, run);
  await run;
}

