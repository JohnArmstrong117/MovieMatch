import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { swipeHelpers, matchHelpers } from '@/lib/db-helpers';
import { mockTMDB, type MockTitle } from '@/lib/mock-tmdb';
import { SwipeCard } from '@/components/swipe-card';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { genreHelpers, streamingServiceHelpers, titleHelpers } from '@/lib/db-helpers';

export default function SwipeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [titles, setTitles] = useState<MockTitle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasPreferences, setHasPreferences] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    checkPreferences();
  }, []);

  useEffect(() => {
    if (hasPreferences && user) {
      loadTitles();
    }
  }, [hasPreferences, user]);

  const checkPreferences = async () => {
    if (!user) return;

    try {
      const [services, genres] = await Promise.all([
        streamingServiceHelpers.getUserServices(user.id),
        genreHelpers.getUserGenres(user.id),
      ]);

      if (services.length === 0 || genres.length === 0) {
        setHasPreferences(false);
        return;
      }

      setHasPreferences(true);
    } catch (error: any) {
      console.error('Error checking preferences:', error);
      
      // Handle JWT clock sync errors gracefully
      if (error?.code === 'PGRST303' || error?.message?.includes('JWT issued at future')) {
        console.warn('JWT clock sync issue - will retry on next check');
        // Retry after a short delay
        setTimeout(() => {
          checkPreferences();
        }, 2000);
        return;
      }
      
      // Only show alert for non-clock-sync errors
      if (error?.code !== 'PGRST303') {
        Alert.alert('Error', 'Failed to load preferences');
      }
    }
  };

  const loadTitles = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [services, genres] = await Promise.all([
        streamingServiceHelpers.getUserServices(user.id),
        genreHelpers.getUserGenres(user.id),
      ]);

      const providerIds = services.map(s => s.provider_key);
      const genreIds = genres.map(g => g.external_id);

      console.log('[SwipeScreen] Loading titles with filters:', {
        providerIds,
        genreIds,
        serviceCount: services.length,
        genreCount: genres.length,
      });

      // Fetch titles from mock TMDB (replace with real API)
      // Reset page when loading fresh titles
      setCurrentPage(1);
      const fetchedTitles = await mockTMDB.getTitles({
        type: 'both',
        genreIds,
        providerIds,
        limit: 10,
        page: 1,
      });

      console.log('[SwipeScreen] Fetched titles:', fetchedTitles.map(t => `${t.title} (${t.type}-${t.id})`));

      // Filter out titles user has already swiped on
      const swipedChecks = await Promise.all(
        fetchedTitles.map(title =>
          swipeHelpers.hasSwiped(user.id, title.id, title.type).catch(() => false)
        )
      );

      // Log which titles were filtered out
      fetchedTitles.forEach((title, index) => {
        if (swipedChecks[index]) {
          console.log(`[SwipeScreen] Filtered out already swiped: ${title.title} (${title.type}-${title.id})`);
        }
      });

      const unswipedTitles = fetchedTitles.filter(
        (_, index) => !swipedChecks[index]
      );

      console.log('[SwipeScreen] After filtering swiped titles:', unswipedTitles.map(t => `${t.title} (${t.type}-${t.id})`));

      // Remove duplicates by creating a unique key from type and id
      const uniqueTitles = unswipedTitles.filter(
        (title, index, self) =>
          index === self.findIndex(t => t.id === title.id && t.type === title.type)
      );

      console.log('[SwipeScreen] Unique titles after deduplication:', uniqueTitles.map(t => `${t.title} (${t.type}-${t.id})`));
      console.log('[SwipeScreen] Setting titles array with length:', uniqueTitles.length);

      setTitles(uniqueTitles);
      setCurrentIndex(0);
    } catch (error) {
      console.error('Error loading titles:', error);
      Alert.alert('Error', 'Failed to load titles');
    } finally {
      setLoading(false);
    }
  };

  const handleSwipeRight = async () => {
    if (!user || currentIndex >= titles.length) return;

    const title = titles[currentIndex];
    try {
      // Cache title data first
      await titleHelpers.upsertTitle({
        tmdb_id: title.id,
        type: title.type,
        title: title.title,
        original_title: title.original_title,
        poster_path: title.poster_path,
        backdrop_path: title.backdrop_path,
        overview: title.overview,
        release_date: title.release_date,
        first_air_date: title.first_air_date,
        popularity: title.popularity,
        vote_average: title.vote_average,
        vote_count: title.vote_count,
        adult: false,
        metadata: { genre_ids: title.genre_ids },
      });

      // Save swipe with decision='like'
      await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'like',
      });

      // Immediately sync this like to matches
      await matchHelpers.syncFromSwipes(user.id);

      // Move to next card
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);

      // Load more if running low (using nextIndex to check future state)
      // Only load if we're not already loading more
      if (nextIndex >= titles.length - 2 && nextIndex < titles.length && !loadingMore) {
        loadMoreTitles();
      }
    } catch (error) {
      console.error('Error saving swipe:', error);
      Alert.alert('Error', 'Failed to save swipe');
    }
  };

  const handleSwipeLeft = async () => {
    if (!user || currentIndex >= titles.length) return;

    const title = titles[currentIndex];
    try {
      // Cache title data first (even for passes, in case they like it later)
      await titleHelpers.upsertTitle({
        tmdb_id: title.id,
        type: title.type,
        title: title.title,
        original_title: title.original_title,
        poster_path: title.poster_path,
        backdrop_path: title.backdrop_path,
        overview: title.overview,
        release_date: title.release_date,
        first_air_date: title.first_air_date,
        popularity: title.popularity,
        vote_average: title.vote_average,
        vote_count: title.vote_count,
        adult: false,
        metadata: { genre_ids: title.genre_ids },
      });

      // Save swipe
      await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'pass',
      });

      // Move to next card
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);

      // Load more if running low (using nextIndex to check future state)
      // Only load if we're not already loading more
      if (nextIndex >= titles.length - 2 && nextIndex < titles.length && !loadingMore) {
        loadMoreTitles();
      }
    } catch (error) {
      console.error('Error saving swipe:', error);
      Alert.alert('Error', 'Failed to save swipe');
    }
  };

  const loadMoreTitles = async () => {
    // Prevent concurrent calls
    if (!user || loading || loadingMore) return;

    setLoadingMore(true);
    try {
      const [services, genres] = await Promise.all([
        streamingServiceHelpers.getUserServices(user.id),
        genreHelpers.getUserGenres(user.id),
      ]);

      const providerIds = services.map(s => s.provider_key);
      const genreIds = genres.map(g => g.external_id);

      // Increment page to get different titles
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);

      console.log('[SwipeScreen] Loading more titles, page:', nextPage);

      const fetchedTitles = await mockTMDB.getTitles({
        type: 'both',
        genreIds,
        providerIds,
        limit: 10,
        page: nextPage,
      });

      console.log('[SwipeScreen] Fetched more titles:', fetchedTitles.map(t => `${t.title} (${t.type}-${t.id})`));

      // Filter out already swiped titles
      const swipedChecks = await Promise.all(
        fetchedTitles.map(title =>
          swipeHelpers.hasSwiped(user.id, title.id, title.type).catch(() => false)
        )
      );

      const unswipedTitles = fetchedTitles.filter(
        (_, index) => !swipedChecks[index]
      );

      console.log('[SwipeScreen] After filtering swiped (loadMore):', unswipedTitles.map(t => `${t.title} (${t.type}-${t.id})`));

      // Use functional update to ensure we check against latest state
      // This prevents race conditions when multiple calls happen
      setTitles(prev => {
        console.log('[SwipeScreen] loadMoreTitles - Current titles before update:', prev.map(t => `${t.title} (${t.type}-${t.id})`));
        console.log('[SwipeScreen] loadMoreTitles - New titles to add:', unswipedTitles.map(t => `${t.title} (${t.type}-${t.id})`));
        
        // Create a Set of existing title keys for efficient lookup
        const existingIds = new Set(
          prev.map(t => `${t.type}-${t.id}`)
        );

        // Also track duplicates within the new batch
        const seenInBatch = new Set<string>();

        // Filter out duplicates - both against existing and within batch
        const uniqueNewTitles = unswipedTitles.filter(title => {
          const key = `${title.type}-${title.id}`;
          
          // Skip if already in existing titles
          if (existingIds.has(key)) {
            console.log(`[SwipeScreen] Skipping duplicate: ${title.title} (${key}) - already in existing titles`);
            return false;
          }
          
          // Skip if duplicate within this batch
          if (seenInBatch.has(key)) {
            console.log(`[SwipeScreen] Skipping duplicate: ${title.title} (${key}) - duplicate in batch`);
            return false;
          }
          
          seenInBatch.add(key);
          return true;
        });

        // Only return new array if we have new titles to avoid unnecessary re-renders
        if (uniqueNewTitles.length === 0) {
          console.log('[SwipeScreen] No new unique titles to add');
          return prev;
        }

        const newTitles = [...prev, ...uniqueNewTitles];
        console.log('[SwipeScreen] Final titles after update:', newTitles.map(t => `${t.title} (${t.type}-${t.id})`));
        return newTitles;
      });
    } catch (error) {
      console.error('Error loading more titles:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!hasPreferences) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.emptyTitle}>
          Setup Required
        </ThemedText>
        <ThemedText style={styles.emptyText}>
          Please select your streaming services and genre preferences to start swiping.
        </ThemedText>
        <TouchableOpacity
          style={styles.setupButton}
          onPress={() => router.push('/(authenticated)/(tabs)/preferences')}>
          <ThemedText style={styles.setupButtonText}>Go to Preferences</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading titles...</ThemedText>
      </ThemedView>
    );
  }

  if (titles.length === 0 || currentIndex >= titles.length) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.emptyTitle}>
          No More Titles
        </ThemedText>
        <ThemedText style={styles.emptyText}>
          Check back later for more recommendations!
        </ThemedText>
        <TouchableOpacity style={styles.refreshButton} onPress={loadTitles}>
          <ThemedText style={styles.refreshButtonText}>Refresh</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  // Get the next 3 titles to display, ensuring we don't go beyond array bounds
  const nextTitles = titles.slice(currentIndex, currentIndex + 3);
  
  // Debug: Log what we're displaying
  if (nextTitles.length > 0) {
    console.log(`[SwipeScreen] Displaying cards (currentIndex: ${currentIndex}, total titles: ${titles.length}):`, 
      nextTitles.map((t, idx) => `${t.title} (${t.type}-${t.id}) at display index ${idx}`));
  }
  
  // Render cards - first card in array should be on top (highest z-index)
  // Render in reverse order so last card (first in array) appears on top
  // but use original index for z-index calculation
  const visibleCards = [...nextTitles]
    .reverse()
    .map((title, reverseIndex) => {
      // Calculate the actual index in the original array
      const actualIndex = currentIndex + (nextTitles.length - 1 - reverseIndex);
      // Use the original display index (0, 1, 2) for z-index, not reverseIndex
      // First card (display index 0) should have highest z-index
      const displayIndex = nextTitles.length - 1 - reverseIndex;
      // Critical: Include currentIndex in key to force complete remount when swiping
      const uniqueKey = `card-pos-${currentIndex}-idx-${actualIndex}-${title.type}-${title.id}`;
      console.log(`[SwipeScreen] Rendering card: ${title.title} with key ${uniqueKey} at reverseIndex ${reverseIndex}, displayIndex ${displayIndex}, actualIndex ${actualIndex}, currentIndex ${currentIndex}`);
      return (
        <SwipeCard
          key={uniqueKey}
          title={title}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={handleSwipeRight}
          index={displayIndex}  // Use displayIndex (0-based from start of nextTitles) for z-index
          total={nextTitles.length}
        />
      );
    });

  return (
    <ThemedView style={styles.container}>
      <View style={styles.cardStack}>{visibleCards}</View>

      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.actionButton, styles.passButton]} onPress={handleSwipeLeft}>
          <ThemedText style={styles.actionButtonText}>✕</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.likeButton]} onPress={handleSwipeRight}>
          <ThemedText style={styles.actionButtonText}>♥</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardStack: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
  },
  refreshButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  setupButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
  },
  setupButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    paddingVertical: 20,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  passButton: {
    backgroundColor: '#ff4444',
  },
  likeButton: {
    backgroundColor: '#44ff44',
  },
  actionButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
});

