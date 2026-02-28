import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  View,
  Image,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useNotificationCounts } from '@/contexts/notification-counts-context';
import { friendHelpers, matchHelpers } from '@/lib/db-helpers';
import type { RecommendationReceived } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MovieDetailModal } from '@/components/movie-detail-modal';

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

export default function InboxScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<RecommendationReceived[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailItem, setDetailItem] = useState<RecommendationReceived | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  /** Set of "tmdb_id-type" for titles the user already has in their matches */
  const [matchSet, setMatchSet] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [data, matches] = await Promise.all([
        friendHelpers.getRecommendationsReceived(user.id),
        matchHelpers.getMatchesWithTitles(user.id),
      ]);
      setItems(data);
      const set = new Set<string>();
      (matches ?? []).forEach((m: { tmdb_id: number; type: string }) => {
        set.add(`${m.tmdb_id}-${m.type}`);
      });
      setMatchSet(set);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const { markInboxOpened } = useNotificationCounts();

  useFocusEffect(
    useCallback(() => {
      if (user) {
        load();
        markInboxOpened();
      }
    }, [user, load, markInboxOpened])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (!user) return null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.headerTitle}>
          Inbox
        </ThemedText>
      </View>

      <MovieDetailModal
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); setDetailItem(null); }}
        item={
          detailItem
            ? {
                tmdb_id: detailItem.tmdb_id,
                type: detailItem.type as 'movie' | 'tv',
                title: detailItem.title ?? 'Unknown',
                original_title: detailItem.original_title ?? null,
                overview: detailItem.overview ?? null,
                poster_path: detailItem.poster_path ?? null,
                backdrop_path: detailItem.backdrop_path ?? null,
                vote_average: detailItem.vote_average ?? null,
                release_date: detailItem.release_date ?? null,
                first_air_date: detailItem.first_air_date ?? null,
              }
            : null
        }
        senderName={detailItem?.from_user_display_name ?? null}
        senderMessage={detailItem?.message ?? null}
        isInMyMatches={detailItem ? matchSet.has(`${detailItem.tmdb_id}-${detailItem.type}`) : false}
        onAddToMatches={
          detailItem && user
            ? async () => {
                try {
                  await matchHelpers.addToMatchesFromInbox(user.id, detailItem.tmdb_id, detailItem.type as 'movie' | 'tv');
                  setMatchSet((prev) => new Set(prev).add(`${detailItem.tmdb_id}-${detailItem.type}`));
                } catch (e) {
                  console.error(e);
                }
              }
            : undefined
        }
      />

      {loading ? (
        <ThemedText style={styles.centered}>Loading...</ThemedText>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            No recommendations yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            When friends recommend movies to you, they’ll show up here.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => {
            const posterUrl = item.poster_path
              ? `https://image.tmdb.org/t/p/w154${item.poster_path}`
              : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => { setDetailItem(item); setDetailVisible(true); }}
                activeOpacity={0.7}>
                {posterUrl ? (
                  <Image source={{ uri: posterUrl }} style={styles.poster} resizeMode="cover" />
                ) : (
                  <View style={[styles.poster, styles.posterPlaceholder]}>
                    <ThemedText style={styles.posterPlaceholderText}>No Image</ThemedText>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <ThemedText type="subtitle" style={styles.cardTitle} numberOfLines={2}>
                    {item.title ?? 'Unknown Title'}
                  </ThemedText>
                  <ThemedText style={styles.cardFrom}>
                    From {item.from_user_display_name ?? 'Someone'}
                  </ThemedText>
                  {item.message && item.message.trim() !== '' && (
                    <ThemedText style={styles.cardMessage} numberOfLines={2}>
                      "{item.message.trim()}"
                    </ThemedText>
                  )}
                  <ThemedText style={styles.cardMeta}>
                    {item.type === 'movie' ? '🎬 Movie' : '📺 TV'} · {formatDate(item.created_at)}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: { paddingVertical: 8, paddingRight: 8 },
  backButtonText: { fontSize: 16, fontWeight: '600', color: '#e01245' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  centered: { flex: 1, textAlign: 'center', marginTop: 24 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: { marginBottom: 8, textAlign: 'center' },
  emptyText: { textAlign: 'center', opacity: 0.7 },
  listContent: { padding: 16, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  poster: {
    width: 80,
    height: 120,
    backgroundColor: '#333',
  },
  posterPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterPlaceholderText: { fontSize: 11, opacity: 0.8 },
  cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { marginBottom: 4 },
  cardFrom: { fontSize: 14, opacity: 0.85, marginBottom: 2 },
  cardMessage: { fontSize: 13, opacity: 0.8, fontStyle: 'italic', marginBottom: 4 },
  cardMeta: { fontSize: 12, opacity: 0.7 },
});
