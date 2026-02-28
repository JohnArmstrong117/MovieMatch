import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { friendHelpers } from '@/lib/db-helpers';

const INBOX_LAST_OPENED_KEY = 'inbox_last_opened_at';

type NotificationCountsContextValue = {
  unreadRecommendationsCount: number;
  pendingRequestsCount: number;
  refetch: () => Promise<void>;
  markInboxOpened: () => Promise<void>;
};

const NotificationCountsContext = createContext<NotificationCountsContextValue | null>(null);

export function NotificationCountsProvider({
  userId,
  children,
}: {
  userId: string | undefined;
  children: React.ReactNode;
}) {
  const [unreadRecommendationsCount, setUnreadRecommendationsCount] = useState(0);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const refetchRef = useRef<() => Promise<void>>(async () => {});

  const refetch = useCallback(async () => {
    if (!userId) {
      setUnreadRecommendationsCount(0);
      setPendingRequestsCount(0);
      return;
    }
    try {
      const since = await AsyncStorage.getItem(INBOX_LAST_OPENED_KEY);
      const [unread, pending] = await Promise.all([
        friendHelpers.getRecommendationsReceivedUnreadCount(userId, since ?? null),
        friendHelpers.getPendingReceivedCount(userId),
      ]);
      setUnreadRecommendationsCount(unread);
      setPendingRequestsCount(pending);
    } catch {
      setUnreadRecommendationsCount(0);
      setPendingRequestsCount(0);
    }
  }, [userId]);

  refetchRef.current = refetch;

  const markInboxOpened = useCallback(async () => {
    await AsyncStorage.setItem(INBOX_LAST_OPENED_KEY, new Date().toISOString());
    setUnreadRecommendationsCount(0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refetchRef.current();
    }, [refetch])
  );

  useEffect(() => {
    if (userId) refetch();
  }, [userId, refetch]);

  const value: NotificationCountsContextValue = {
    unreadRecommendationsCount,
    pendingRequestsCount,
    refetch,
    markInboxOpened,
  };

  return (
    <NotificationCountsContext.Provider value={value}>
      {children}
    </NotificationCountsContext.Provider>
  );
}

export function useNotificationCounts() {
  const ctx = useContext(NotificationCountsContext);
  if (!ctx) throw new Error('useNotificationCounts must be used within NotificationCountsProvider');
  return ctx;
}
