import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { swipeHelpers } from '@/lib/db-helpers';
import type { MockTitle } from '@/lib/mock-tmdb';
import { SwipeCard } from '@/components/swipe-card';
import { AdCard } from '@/components/ad-card';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { genreHelpers, streamingServiceHelpers, titleHelpers, feedHelpers, matchHelpers } from '@/lib/db-helpers';
import { MediaTypeToggle } from '@/components/media-type-toggle';
import { NativeAd, TestIds } from 'react-native-google-mobile-ads';

type SwipeDeckItem =
  | { kind: 'title'; id: string; title: MockTitle }
  | { kind: 'ad'; id: string };

const AD_INSERTION_INTERVAL = 16;
// Safety-first: stay on AdMob test ads unless explicitly enabled.
const USE_REAL_ADS = process.env.EXPO_PUBLIC_ADMOB_USE_REAL_ADS === 'true';
const NATIVE_AD_UNIT_ID = USE_REAL_ADS
  ? process.env.EXPO_PUBLIC_ADMOB_NATIVE_AD_UNIT_ID || TestIds.NATIVE
  : TestIds.NATIVE;

export default function SwipeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const mediaTypeRef = useRef(mediaType);
  mediaTypeRef.current = mediaType;
  const [titles, setTitles] = useState<MockTitle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasPreferences, setHasPreferences] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedTitle, setSelectedTitle] = useState<MockTitle | null>(null);
  const [genreById, setGenreById] = useState<Map<number, string> | null>(null);
  const [nativeAdsById, setNativeAdsById] = useState<Record<string, NativeAd>>({});

  useEffect(() => {
    checkPreferences();
  }, []);

  useEffect(() => {
    if (hasPreferences && user) {
      loadTitles();
    }
  }, [hasPreferences, user, mediaType]);

  useEffect(() => {
    if (!user || !hasPreferences) return;
    let cancelled = false;
    genreHelpers.getAll().then((list) => {
      if (cancelled) return;
      const map = new Map<number, string>();
      list.forEach((g: { genre_id: number; name: string }) => map.set(g.genre_id, g.name));
      setGenreById(map);
    });
    return () => {
      cancelled = true;
    };
  }, [user, hasPreferences]);

  // When screen gains focus: only reload if we have no titles (e.g. first load or after preferences change).
  // If we already have a stack (e.g. came back from Matches), keep it so we don't replace it with page 1
  // (which would all be already-swiped and show "No more titles").
  useFocusEffect(
    useCallback(() => {
      if (hasPreferences && user) {
        if (titles.length === 0) {
          loadTitles();
        }
      } else if (user) {
        checkPreferences();
      }
    }, [hasPreferences, user, mediaType, titles.length])
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
        console.warn('JWT clock sync issue - will retry on check');
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

    const type = mediaTypeRef.current;
    setLoading(true);
    try {
      const [services, genres] = await Promise.all([
        streamingServiceHelpers.getUserServices(user.id),
        genreHelpers.getUserGenres(user.id),
      ]);

      // Fetch from TMDB via Edge Function (movies or TV) – use ref so Refresh/focus always use current toggle
      console.log(`📡 Fetching ${type}s from feed_movies...`);
      const feedResponse = await feedHelpers.getFeed({ type, limit: 20, page: 1 });
      console.log(`📦 Received ${feedResponse.items.length} ${type}s from feed`);

      // Transform to MockTitle format
      const fetchedTitles: MockTitle[] = feedResponse.items.map((item) => ({
        id: item.tmdb_id,
        title: item.title,
        original_title: item.title,
        overview: item.overview,
        poster_path: item.poster_path,
        backdrop_path: null,
        release_date: item.release_date || undefined,
        first_air_date: item.first_air_date || undefined,
        vote_average: item.vote_average || 0,
        vote_count: item.vote_count || 0,
        popularity: item.popularity || 0,
        type,
        genre_ids: item.genre_ids ?? [],
      }));

      // Feed function already filters out swiped movies, but we'll keep the check for safety
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

  const swipeDeck = useMemo<SwipeDeckItem[]>(() => {
    const deck: SwipeDeckItem[] = [];
    titles.forEach((title, idx) => {
      deck.push({ kind: 'title', id: `${title.type}-${title.id}`, title });
      if ((idx + 1) % AD_INSERTION_INTERVAL === 0) {
        deck.push({
          kind: 'ad',
          id: `ad-${mediaType}-${Math.floor((idx + 1) / AD_INSERTION_INTERVAL)}`,
        });
      }
    });
    return deck;
  }, [titles, mediaType]);

  const advanceDeck = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next >= swipeDeck.length - 2 && next < swipeDeck.length) {
        loadMoreTitles();
      }
      return next;
    });
  }, [swipeDeck.length]);

  useEffect(() => {
    const upcomingAdIds = swipeDeck
      .slice(currentIndex, currentIndex + 30)
      .filter((item): item is Extract<SwipeDeckItem, { kind: 'ad' }> => item.kind === 'ad')
      .map((item) => item.id)
      .filter((id) => !nativeAdsById[id]);

    if (upcomingAdIds.length === 0) return;
    let cancelled = false;

    (async () => {
      for (const adId of upcomingAdIds) {
        try {
          const ad = await NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, {
            requestNonPersonalizedAdsOnly: true,
          });
          if (cancelled) {
            ad.destroy();
            continue;
          }
          setNativeAdsById((prev) => ({ ...prev, [adId]: ad }));
        } catch (e) {
          if (__DEV__) console.warn('Native ad preload failed:', e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentIndex, swipeDeck, nativeAdsById]);

  useEffect(() => {
    return () => {
      Object.values(nativeAdsById).forEach((ad) => ad.destroy());
    };
  }, [nativeAdsById]);

  const handleSwipeRight = async (title: MockTitle) => {
    if (!user) return;
    try {
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

      console.log(`💾 Saving LIKE swipe: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
      const swipe = await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'like',
      });
      console.log(`✅ Swipe saved:`, { id: swipe.id, tmdb_id: swipe.tmdb_id, type: swipe.type, decision: swipe.decision });

      try {
        console.log(`💾 Creating match: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
        const match = await matchHelpers.createMatch(user.id, title.id, title.type);
        console.log(`✅ Created match for ${title.title}:`, { match_id: match.id, tmdb_id: match.tmdb_id, type: match.type });
      } catch (error: any) {
        if (error?.code === '23505') {
          console.log(`ℹ️ Match already exists for ${title.title} (${title.id})`);
        } else {
          console.error('❌ Error creating match:', error);
        }
      }

      advanceDeck();
    } catch (error) {
      console.error('Error saving swipe:', error);
      Alert.alert('Error', 'Failed to save swipe');
    }
  };

  const handleSwipeWatched = async (title: MockTitle) => {
    if (!user) return;
    try {
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

      console.log(`💾 Saving LIKE swipe (Watched): user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
      await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'like',
      });

      try {
        const match = await matchHelpers.createMatch(user.id, title.id, title.type);
        await matchHelpers.updateMatch(match.id, { watched: true });
        console.log(`✅ Created match (watched) for ${title.title}:`, { match_id: match.id });
      } catch (error: any) {
        if (error?.code !== '23505') {
          console.error('❌ Error creating match (watched):', error);
        }
      }

      advanceDeck();
    } catch (error) {
      console.error('Error saving watched swipe:', error);
      Alert.alert('Error', 'Failed to save');
    }
  };

  const handleSwipeLeft = async (title: MockTitle) => {
    if (!user) return;
    try {
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

      console.log(`💾 Saving PASS swipe: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
      const swipe = await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: title.id,
        type: title.type,
        decision: 'pass',
      });
      console.log(`✅ Swipe saved:`, { id: swipe.id, tmdb_id: swipe.tmdb_id, type: swipe.type, decision: swipe.decision });

      try {
        console.log(`🗑️ Removing match: user_id=${user.id}, tmdb_id=${title.id}, type=${title.type}`);
        await matchHelpers.removeMatch(user.id, title.id, title.type);
        console.log(`✅ Removed match for ${title.title} (${title.id})`);
      } catch (error: any) {
        if (error?.code === 'PGRST116') {
          console.log(`ℹ️ No match to remove for ${title.title} (${title.id})`);
        } else {
          console.error('❌ Error removing match:', error);
        }
      }

      advanceDeck();
    } catch (error) {
      console.error('Error saving swipe:', error);
      Alert.alert('Error', 'Failed to save swipe');
    }
  };

  const loadMoreTitles = async () => {
    if (!user || loading) return;

    const type = mediaTypeRef.current;
    try {
      const nextPage = currentPage + 1;
      const feedResponse = await feedHelpers.getFeed({ type, limit: 20, page: nextPage });

      if (feedResponse.items.length === 0) {
        return;
      }

      const newTitles: MockTitle[] = feedResponse.items.map((item) => ({
        id: item.tmdb_id,
        title: item.title,
        original_title: item.title,
        overview: item.overview,
        poster_path: item.poster_path,
        backdrop_path: null,
        release_date: item.release_date || undefined,
        first_air_date: item.first_air_date || undefined,
        vote_average: item.vote_average || 0,
        vote_count: item.vote_count || 0,
        popularity: item.popularity || 0,
        type,
        genre_ids: item.genre_ids ?? [],
      }));

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
        <MediaTypeToggle value={mediaType} onChange={setMediaType} />
        <ThemedText>Loading {mediaType === 'tv' ? 'shows' : 'movies'}...</ThemedText>
      </ThemedView>
    );
  }

  if (titles.length === 0 || currentIndex >= swipeDeck.length) {
    return (
      <ThemedView style={styles.container}>
        <MediaTypeToggle value={mediaType} onChange={setMediaType} />
        <ThemedText type="title" style={styles.emptyTitle}>
          No More {mediaType === 'tv' ? 'Shows' : 'Movies'}
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

  // Top card must be titles[currentIndex] so tap/swipe handlers save the correct title.
  // Don't reverse: first card (index 0) gets highest zIndex and is the one user sees and interacts with.
  const visibleCards = swipeDeck
    .slice(currentIndex, currentIndex + 3)
    .map((item, index) => {
      if (item.kind === 'ad') {
        const nativeAd = nativeAdsById[item.id];
        if (!nativeAd) return null;
        return (
          <AdCard
            key={item.id}
            nativeAd={nativeAd}
            onSwipeLeft={advanceDeck}
            onSwipeRight={advanceDeck}
            onSwipeUp={advanceDeck}
            index={index}
            total={Math.min(3, swipeDeck.length - currentIndex)}
          />
        );
      }

      const title = item.title;
      const genreNames =
        title.genre_ids?.length && genreById
          ? title.genre_ids
              .map((id) => genreById.get(id))
              .filter(Boolean)
              .slice(0, 3)
              .join(', ') || undefined
          : undefined;
      return (
        <SwipeCard
          key={`${item.id}-${currentIndex + index}`}
          title={title}
          genreNames={genreNames}
          onSwipeLeft={() => handleSwipeLeft(title)}
          onSwipeRight={() => handleSwipeRight(title)}
          onSwipeUp={() => handleSwipeWatched(title)}
          onDoubleTap={() => {
            setSelectedTitle(title);
            setDetailVisible(true);
          }}
          index={index}
          total={Math.min(3, swipeDeck.length - currentIndex)}
        />
      );
    });

  const currentDeckItem = swipeDeck[currentIndex];
  const currentTitle = currentDeckItem?.kind === 'title' ? currentDeckItem.title : null;

  const detailItem = selectedTitle
    ? {
        tmdb_id: selectedTitle.id,
        type: selectedTitle.type,
        title: selectedTitle.title,
        original_title: selectedTitle.original_title ?? null,
        overview: selectedTitle.overview ?? null,
        poster_path: selectedTitle.poster_path ?? null,
        backdrop_path: selectedTitle.backdrop_path ?? null,
        vote_average: selectedTitle.vote_average ?? null,
        release_date: selectedTitle.release_date ?? null,
        first_air_date: selectedTitle.first_air_date ?? null,
      }
    : null;

  return (
    <ThemedView style={styles.container}>
      <MediaTypeToggle value={mediaType} onChange={setMediaType} />
      <View style={styles.cardStack}>{visibleCards}</View>

      <MovieDetailModal
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          setSelectedTitle(null);
        }}
        item={detailItem}
      />

      <View style={styles.actionButtons} collapsable={false}>
        <TouchableOpacity
          style={[styles.actionButton, styles.passButton]}
          onPress={() => (currentTitle ? handleSwipeLeft(currentTitle) : advanceDeck())}>
          <ThemedText style={styles.actionButtonText}>✕</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.watchedButton]}
          onPress={() => (currentTitle ? handleSwipeWatched(currentTitle) : advanceDeck())}>
          <ThemedText style={styles.actionButtonText}>✓</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={() => (currentTitle ? handleSwipeRight(currentTitle) : advanceDeck())}>
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
    paddingBottom: 1,
  },
  cardStack: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
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
    backgroundColor: '#c41010',
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
    backgroundColor: '#c41010',
    borderRadius: 8,
  },
  setupButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    direction: 'ltr',
    justifyContent: 'center',
    gap: 15,
    paddingVertical: 14,
    paddingBottom: 10,
  },
  actionButton: {
    width: 100,
    height: 40,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  passButton: {
    backgroundColor: '#c41010',
  },
  watchedButton: {
    backgroundColor: '#77d9e6',
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
