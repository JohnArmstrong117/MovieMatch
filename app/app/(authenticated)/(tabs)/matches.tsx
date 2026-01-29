import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, RefreshControl, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { matchHelpers } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function MatchesScreen() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      loadMatches();
    }
  }, [user]);

  // Refresh matches when screen comes into focus (e.g., after swiping)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadMatches();
      }
    }, [user])
  );

  const loadMatches = async () => {
    if (!user) return;

    try {
      // Sync matches from swipes first
      const syncCount = await matchHelpers.syncFromSwipes(user.id);
      console.log(`🔄 Synced ${syncCount} new matches from swipes`);

      // Diagnostic: Check for mismatches (only in dev)
      if (__DEV__) {
        const diagnostics = await matchHelpers.diagnoseMismatches(user.id);
        console.log('📊 Match Diagnostics:', {
          totalLikes: diagnostics.totalLikes,
          totalMatches: diagnostics.totalMatches,
          likesWithoutMatches: diagnostics.likesWithoutMatches.length,
          matchesWithoutLikes: diagnostics.matchesWithoutLikes.length,
          passesWithMatches: diagnostics.passesWithMatches.length,
        });
        
        if (diagnostics.likesWithoutMatches.length > 0) {
          console.warn('⚠️ Likes without matches:', diagnostics.likesWithoutMatches);
        }
        if (diagnostics.matchesWithoutLikes.length > 0) {
          console.warn('⚠️ Matches without likes:', diagnostics.matchesWithoutLikes);
        }
        if (diagnostics.passesWithMatches.length > 0) {
          console.warn('⚠️ Passes with matches (should not happen):', diagnostics.passesWithMatches);
        }
      }

      // Load matches with title data
      const matchesData = await matchHelpers.getMatchesWithTitles(user.id);
      setMatches(matchesData);
      console.log(`✅ Loaded ${matchesData.length} matches`);
    } catch (error) {
      console.error('Error loading matches:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
  };

  const handleToggleWatched = async (matchId: string, currentWatched: boolean) => {
    try {
      await matchHelpers.updateMatch(matchId, { watched: !currentWatched });
      await loadMatches();
    } catch (error) {
      console.error('Error updating match:', error);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading matches...</ThemedText>
      </ThemedView>
    );
  }

  if (matches.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.emptyTitle}>
          No Matches Yet
        </ThemedText>
        <ThemedText style={styles.emptyText}>
          Start swiping to find titles you like!
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const posterUrl = item.poster_path
            ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
            : null;

          return (
            <TouchableOpacity
              style={styles.matchCard}
              onPress={() => handleToggleWatched(item.id, item.watched)}>
              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl }}
                  style={styles.poster}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <ThemedText>No Image</ThemedText>
                </View>
              )}

              <View style={styles.matchInfo}>
                <ThemedText type="subtitle" style={styles.matchTitle}>
                  {item.title || 'Unknown Title'}
                </ThemedText>
                <ThemedText style={styles.matchType}>
                  {item.type === 'movie' ? '🎬 Movie' : '📺 TV Series'}
                </ThemedText>
                {item.overview && (
                  <ThemedText style={styles.matchOverview} numberOfLines={2}>
                    {item.overview}
                  </ThemedText>
                )}
                <View style={styles.matchMeta}>
                  {item.vote_average && (
                    <ThemedText style={styles.metaText}>
                      ⭐ {item.vote_average.toFixed(1)}
                    </ThemedText>
                  )}
                  <ThemedText
                    style={[
                      styles.watchedBadge,
                      item.watched ? styles.watchedActive : styles.watchedInactive,
                    ]}>
                    {item.watched ? '✓ Watched' : 'Not Watched'}
                  </ThemedText>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  matchCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  poster: {
    width: 100,
    height: 150,
    backgroundColor: '#333',
  },
  posterPlaceholder: {
    backgroundColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  matchTitle: {
    marginBottom: 4,
  },
  matchType: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 8,
  },
  matchOverview: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
  },
  matchMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 14,
    fontWeight: '600',
  },
  watchedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  watchedActive: {
    backgroundColor: '#44ff44',
    color: '#000',
  },
  watchedInactive: {
    backgroundColor: '#ddd',
    color: '#666',
  },
  emptyTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.7,
  },
});

