import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { swipeHelpers } from '@/lib/db-helpers';
import type { MockTitle } from '@/lib/mock-tmdb';
import { SwipeCard } from '@/components/swipe-card';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { genreHelpers, streamingServiceHelpers, titleHelpers, feedHelpers, matchHelpers } from '@/lib/db-helpers';

export default function SwipeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [titles, setTitles] = useState<MockTitle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
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

  // Refresh titles when screen comes into focus (e.g., after preferences update)
  useFocusEffect(
    useCallback(() => {
      if (hasPreferences && user) {
        // Reset and reload titles to reflect any preference changes
        loadTitles();
      } else if (user) {
        // Re-check preferences in case they were set
        checkPreferences();
      }
    }, [hasPreferences, user])
  );

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

      // Fetch movies from TMDB via Edge Function
      console.log('📡 Fetching movies from feed_movies...');
      const feedResponse = await feedHelpers.getMovies({ limit: 20, page: 1 });
      console.log(`📦 Received ${feedResponse.items.length} movies from feed`);

      // Transform FeedMovie to MockTitle format
      const fetchedTitles: MockTitle[] = feedResponse.items.map(movie => ({
        id: movie.tmdb_id,
        title: movie.title,
        original_title: movie.title,
        overview: movie.overview,
        poster_path: movie.poster_path,
        backdrop_path: null, // TMDB feed doesn't include backdrop_path
        release_date: movie.release_date || undefined,
        first_air_date: undefined,
        vote_average: movie.vote_average || 0,
        vote_count: movie.vote_count || 0,
        popularity: movie.popularity || 0,
        type: 'movie' as const,
        genre_ids: [], // Genre IDs not included in feed response
      }));

      // Feed function already filters out swiped movies, but we'll keep the check for safety
      // Remove duplicates by creating a unique key from type and id
      const uniqueTitles = fetchedTitles.filter(
        (title, index, self) =>
          index === self.findIndex(t => t.id === title.id && t.type === title.type)
      );

      setTitles(uniqueTitles);
      setCurrentIndex(0);
      setCurrentPage(1);
    } catch (error: any) {
      console.error('Error loading titles:', error);
      console.error('Error details:', error?.details);
      console.error('Error status:', error?.status);
      console.error('Error response data:', error?.responseData);
      
      // Handle specific errors from feed_movies Edge Function
      const errorMessage = error?.message || error?.error || error?.responseData?.error || error?.responseData?.message || 'Failed to load titles';
      
      if (errorMessage.includes('No providers selected') || errorMessage.includes('No genres selected')) {
        setHasPreferences(false);
        Alert.alert('Setup Required', errorMessage);
      } else if (errorMessage.includes('TMDB_API_KEY not configured')) {
        Alert.alert(
          'Configuration Error',
          'TMDB API key is not configured. Please check your Edge Functions setup.'
        );
      } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('Invalid token')) {
        Alert.alert('Authentication Error', 'Please sign in again.');
      } else {
        Alert.alert('Error', errorMessage);
      }
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

      // Save swipe FIRST (this is the source of truth)
      console.log(`💾 Saving LIKE swipe: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
      const swipe = await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'like',
      });
      console.log(`✅ Swipe saved:`, { id: swipe.id, tmdb_id: swipe.tmdb_id, type: swipe.type, decision: swipe.decision });

      // Create match immediately AFTER swipe is saved
      // This ensures the swipe exists before the match
      try {
        console.log(`💾 Creating match: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
        const match = await matchHelpers.createMatch(user.id, title.id, title.type);
        console.log(`✅ Created match for ${title.title}:`, { match_id: match.id, tmdb_id: match.tmdb_id, type: match.type });
      } catch (error: any) {
        // If match already exists, that's fine (idempotent)
        if (error?.code === '23505') {
          console.log(`ℹ️ Match already exists for ${title.title} (${title.id})`);
        } else {
          console.error('❌ Error creating match:', error);
          // Don't fail the swipe if match creation fails - sync will handle it later
        }
      }

      // Move to next card
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);

      // Load more if running low (using nextIndex to check future state)
      if (nextIndex >= titles.length - 2 && nextIndex < titles.length) {
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

      // Save swipe FIRST (this is the source of truth)
      console.log(`💾 Saving PASS swipe: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
      const swipe = await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'pass',
      });
      console.log(`✅ Swipe saved:`, { id: swipe.id, tmdb_id: swipe.tmdb_id, type: swipe.type, decision: swipe.decision });

      // Remove match if it exists (in case user changed their mind or it was incorrectly added)
      try {
        console.log(`🗑️ Removing match: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
        await matchHelpers.removeMatch(user.id, title.id, title.type);
        console.log(`✅ Removed match for ${title.title} (${title.id})`);
      } catch (error: any) {
        // If match doesn't exist, that's fine (idempotent)
        if (error?.code === 'PGRST116') {
          console.log(`ℹ️ No match to remove for ${title.title} (${title.id})`);
        } else {
          console.error('❌ Error removing match:', error);
          // Don't fail the swipe if match removal fails - sync will handle it later
        }
      }

      // Move to next card
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);

      // Load more if running low (using nextIndex to check future state)
      if (nextIndex >= titles.length - 2 && nextIndex < titles.length) {
        loadMoreTitles();
      }
    } catch (error) {
      console.error('Error saving swipe:', error);
      Alert.alert('Error', 'Failed to save swipe');
    }
  };

  const loadMoreTitles = async () => {
    if (!user || loading) return;

    try {
      const nextPage = currentPage + 1;
      const feedResponse = await feedHelpers.getMovies({ limit: 20, page: nextPage });

      if (feedResponse.items.length === 0) {
        return; // No more movies
      }

      // Transform FeedMovie to MockTitle format
      const newTitles: MockTitle[] = feedResponse.items.map(movie => ({
        id: movie.tmdb_id,
        title: movie.title,
        original_title: movie.title,
        overview: movie.overview,
        poster_path: movie.poster_path,
        backdrop_path: null,
        release_date: movie.release_date || undefined,
        first_air_date: undefined,
        vote_average: movie.vote_average || 0,
        vote_count: movie.vote_count || 0,
        popularity: movie.popularity || 0,
        type: 'movie' as const,
        genre_ids: [],
      }));

      // Remove duplicates - check both existing titles array
      const existingIds = new Set(titles.map(t => `${t.type}-${t.id}`));
      const uniqueNewTitles = newTitles.filter(
        title => !existingIds.has(`${title.type}-${title.id}`)
      );

      if (uniqueNewTitles.length > 0) {
        setTitles(prev => [...prev, ...uniqueNewTitles]);
        setCurrentPage(nextPage);
      }
    } catch (error) {
      console.error('Error loading more titles:', error);
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

  const visibleCards = titles
    .slice(currentIndex, currentIndex + 3)
    .reverse()
    .map((title, index) => (
      <SwipeCard
        key={`${title.type}-${title.id}-${currentIndex + index}`}
        title={title}
        onSwipeLeft={handleSwipeLeft}
        onSwipeRight={handleSwipeRight}
        index={index}
        total={Math.min(3, titles.length - currentIndex)}
      />
    ));

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

