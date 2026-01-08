import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { swipeHelpers } from '@/lib/db-helpers';
import { mockTMDB, type MockTitle } from '@/lib/mock-tmdb';
import { SwipeCard } from '@/components/swipe-card';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { genreHelpers, streamingServiceHelpers } from '@/lib/db-helpers';

export default function SwipeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [titles, setTitles] = useState<MockTitle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasPreferences, setHasPreferences] = useState(false);

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
    } catch (error) {
      console.error('Error checking preferences:', error);
      Alert.alert('Error', 'Failed to load preferences');
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

      // Fetch titles from mock TMDB (replace with real API)
      const fetchedTitles = await mockTMDB.getTitles({
        type: 'both',
        genreIds,
        providerIds,
        limit: 10,
      });

      // Filter out titles user has already swiped on
      const swipedTitles = await Promise.all(
        fetchedTitles.map(title =>
          swipeHelpers.hasSwiped(user.id, title.id, title.type)
        )
      );

      const unswipedTitles = fetchedTitles.filter(
        (_, index) => !swipedTitles[index]
      );

      setTitles(unswipedTitles);
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
      await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'like',
      });

      // Move to next card
      setCurrentIndex(prev => prev + 1);

      // Load more if running low
      if (currentIndex >= titles.length - 3) {
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
      await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'pass',
      });

      // Move to next card
      setCurrentIndex(prev => prev + 1);

      // Load more if running low
      if (currentIndex >= titles.length - 3) {
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
      const [services, genres] = await Promise.all([
        streamingServiceHelpers.getUserServices(user.id),
        genreHelpers.getUserGenres(user.id),
      ]);

      const providerIds = services.map(s => s.provider_key);
      const genreIds = genres.map(g => g.external_id);

      const fetchedTitles = await mockTMDB.getTitles({
        type: 'both',
        genreIds,
        providerIds,
        limit: 10,
      });

      // Filter out already swiped titles
      const swipedTitles = await Promise.all(
        fetchedTitles.map(title =>
          swipeHelpers.hasSwiped(user.id, title.id, title.type)
        )
      );

      const unswipedTitles = fetchedTitles.filter(
        (_, index) => !swipedTitles[index]
      );

      setTitles(prev => [...prev, ...unswipedTitles]);
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
        key={title.id}
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

