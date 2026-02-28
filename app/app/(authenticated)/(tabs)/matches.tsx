import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  View,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { matchHelpers, genreHelpers, searchHelpers, titleHelpers, swipeHelpers } from '@/lib/db-helpers';
import type { TMDBGenre, TmdbSearchResult } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { MediaTypeToggle } from '@/components/media-type-toggle';

type WatchedFilter = 'all' | 'watched' | 'unwatched';
type SortBy = 'matched' | 'rating';

export default function MatchesScreen() {
  const { user } = useAuth();
  const searchInputBg = useThemeColor({}, 'background');
  const searchInputText = useThemeColor({}, 'text');
  const searchInputBorder = useThemeColor(
    { light: 'rgba(0,0,0,0.12)', dark: 'rgba(255,255,255,0.15)' },
    'icon'
  );
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [filterGenreIds, setFilterGenreIds] = useState<number[]>([]);
  const [filterWatched, setFilterWatched] = useState<WatchedFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('matched');
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [addSearchResults, setAddSearchResults] = useState<TmdbSearchResult[]>([]);
  const [addSearchLoading, setAddSearchLoading] = useState(false);
  const [addAddingId, setAddAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadMatches();
      genreHelpers.getAll().then(setGenres);
    }
  }, [user, mediaType]);

  // Refresh matches when screen comes into focus (e.g., after swiping)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadMatches();
      }
    }, [user, mediaType])
  );

  // Debounced TMDB search when "Add to matches" modal is open
  useEffect(() => {
    if (!addModalVisible) return;
    const q = addSearchQuery.trim();
    if (q.length < 2) {
      setAddSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setAddSearchLoading(true);
      try {
        const res = await searchHelpers.searchTmdb(q, 1);
        setAddSearchResults(res.results);
      } catch (e) {
        console.error('Add search error:', e);
        setAddSearchResults([]);
      } finally {
        setAddSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [addModalVisible, addSearchQuery]);

  const handleAddToMatches = async (item: TmdbSearchResult) => {
    if (!user) return;
    const key = `${item.type}-${item.tmdb_id}`;
    if (addAddingId === key) return;
    setAddAddingId(key);
    try {
      await titleHelpers.upsertTitle({
        tmdb_id: item.tmdb_id,
        type: item.type,
        title: item.title,
        poster_path: item.poster_path,
        overview: item.overview ?? undefined,
        release_date: item.release_date ?? undefined,
        first_air_date: item.first_air_date ?? undefined,
        vote_average: item.vote_average ?? undefined,
        adult: false,
        metadata: {},
      });
      await swipeHelpers.createSwipe({
        user_id: user.id,
        tmdb_id: item.tmdb_id,
        type: item.type,
        decision: 'like',
      });
      await matchHelpers.createMatch(user.id, item.tmdb_id, item.type);
      setAddModalVisible(false);
      setAddSearchQuery('');
      setAddSearchResults([]);
      loadMatches();
    } catch (err: any) {
      if (err?.code === '23505') {
        setAddModalVisible(false);
        setAddSearchQuery('');
        setAddSearchResults([]);
        loadMatches();
      } else {
        console.error('Add to matches error:', err);
      }
    } finally {
      setAddAddingId(null);
    }
  };

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

      // Load matches for current media type (movies or TV)
      const matchesData = await matchHelpers.getMatchesWithTitles(user.id, mediaType);
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

  const toggleGenreFilter = (genreId: number) => {
    setFilterGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const filteredAndSortedMatches = useMemo(() => {
    let list = matches.map((item) => {
      let ids = item.genre_ids;
      if (Array.isArray(ids)) {
        // already array (fallback or RPC)
      } else if (typeof ids === 'string') {
        try {
          const parsed = JSON.parse(ids);
          ids = Array.isArray(parsed) ? parsed : [];
        } catch {
          ids = [];
        }
      } else {
        ids = [];
      }
      return { ...item, genre_ids: Array.isArray(ids) ? ids : [] };
    });
    if (filterGenreIds.length > 0) {
      list = list.filter((item) =>
        (item.genre_ids || []).some((id: number) => filterGenreIds.includes(id))
      );
    }
    if (filterWatched === 'watched') list = list.filter((item) => item.watched);
    if (filterWatched === 'unwatched') list = list.filter((item) => !item.watched);
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((item) => {
        const title = (item.title ?? '').toLowerCase();
        const original = (item.original_title ?? '').toLowerCase();
        const overview = (item.overview ?? '').toLowerCase();
        return title.includes(query) || original.includes(query) || overview.includes(query);
      });
    }
    if (sortBy === 'rating') {
      list = [...list].sort((a, b) => {
        const scoreA = a.rating ?? (typeof a.vote_average === 'number' ? a.vote_average / 2 : 0);
        const scoreB = b.rating ?? (typeof b.vote_average === 'number' ? b.vote_average / 2 : 0);
        return scoreB - scoreA;
      });
    }
    return list;
  }, [matches, filterGenreIds, filterWatched, sortBy, searchQuery]);

  const handleToggleWatched = async (
    matchId: string | null,
    currentWatched: boolean,
    tmdbId?: number,
    type?: 'movie' | 'tv'
  ) => {
    if (!user) return;
    try {
      let id = matchId;
      if (!id && tmdbId != null && type) {
        const match = await matchHelpers.createMatch(user.id, tmdbId, type);
        id = match.id;
      }
      if (id) {
        await matchHelpers.updateMatch(id, { watched: !currentWatched });
      }
      await loadMatches();
    } catch (error) {
      console.error('Error updating match:', error);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <MediaTypeToggle value={mediaType} onChange={setMediaType} />
        <ThemedText>Loading matches...</ThemedText>
      </ThemedView>
    );
  }

  if (matches.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <MediaTypeToggle value={mediaType} onChange={setMediaType} />
        <ThemedText type="title" style={styles.emptyTitle}>
          No {mediaType === 'tv' ? 'TV' : 'Movie'} Matches Yet
        </ThemedText>
        <ThemedText style={styles.emptyText}>
          Start swiping {mediaType === 'tv' ? 'TV shows' : 'movies'} to find titles you like!
        </ThemedText>
      </ThemedView>
    );
  }

  const hasActiveFilters =
    filterGenreIds.length > 0 || filterWatched !== 'all' || sortBy !== 'matched';
  const filterSummary =
    (filterGenreIds.length ? `${filterGenreIds.length} genre(s)` : '') +
    (filterWatched !== 'all' ? (filterGenreIds.length ? ' · ' : '') + (filterWatched === 'watched' ? 'Watched' : 'Not watched') : '') +
    (sortBy !== 'matched' ? (filterGenreIds.length || filterWatched !== 'all' ? ' · ' : '') + (sortBy === 'rating' ? 'By rating' : '') : '');

  return (
    <ThemedView style={styles.container}>
      <MediaTypeToggle value={mediaType} onChange={setMediaType} />
      <View style={styles.filterButtonRow}>
        <TouchableOpacity
          style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
          onPress={() => setFilterMenuVisible(true)}>
          <ThemedText style={[styles.filterButtonText, hasActiveFilters && styles.filterButtonTextActive]}>
            Filter & sort
          </ThemedText>
          {hasActiveFilters && filterSummary ? (
            <ThemedText style={styles.filterButtonSummary} numberOfLines={1}>
              {filterSummary}
            </ThemedText>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setAddSearchQuery('');
            setAddSearchResults([]);
            setAddModalVisible(true);
          }}>
          <ThemedText style={styles.addButtonText}>+ Add</ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: searchInputBg,
              borderColor: searchInputBorder,
              color: searchInputText,
            },
          ]}
          placeholder="Search matches..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <Modal
        visible={filterMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterMenuVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setFilterMenuVisible(false)}
        />
        <View style={styles.modalContent}>
          <ThemedView style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <ThemedText type="title" style={styles.modalTitle}>
                Filter & sort
              </ThemedText>
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setFilterMenuVisible(false)}>
                <ThemedText style={styles.modalDoneText}>Done</ThemedText>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <ThemedText style={styles.filterLabel}>Genre</ThemedText>
              <View style={styles.genreWrap}>
                {genres.map((genre) => {
                  const active = filterGenreIds.includes(genre.genre_id);
                  return (
                    <TouchableOpacity
                      key={genre.genre_id}
                      style={[styles.genreChip, active && styles.genreChipActive]}
                      onPress={() => toggleGenreFilter(genre.genre_id)}>
                      <ThemedText style={[styles.genreChipText, active && styles.genreChipTextActive]}>
                        {genre.name}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <ThemedText style={styles.filterLabel}>Watched</ThemedText>
              <View style={styles.watchedRow}>
                {(['all', 'watched', 'unwatched'] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.watchedChip, filterWatched === value && styles.watchedChipActive]}
                    onPress={() => setFilterWatched(value)}>
                    <ThemedText
                      style={[
                        styles.watchedChipText,
                        filterWatched === value && styles.watchedChipTextActive,
                      ]}>
                      {value === 'all' ? 'All' : value === 'watched' ? 'Watched' : 'Not watched'}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              <ThemedText style={styles.filterLabel}>Sort by</ThemedText>
              <View style={styles.sortRow}>
                <TouchableOpacity
                  style={[styles.sortChip, sortBy === 'matched' && styles.sortChipActive]}
                  onPress={() => setSortBy('matched')}>
                  <ThemedText
                    style={[styles.sortChipText, sortBy === 'matched' && styles.sortChipTextActive]}>
                    Match order
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortChip, sortBy === 'rating' && styles.sortChipActive]}
                  onPress={() => setSortBy('rating')}>
                  <ThemedText
                    style={[styles.sortChipText, sortBy === 'rating' && styles.sortChipTextActive]}>
                    Star rating
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAddModalVisible(false)}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.addModalKeyboardWrap}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <View style={styles.addModalContent}>
            <ThemedView style={styles.addModalInner}>
              <View style={styles.modalHeader}>
              <ThemedText type="title" style={styles.modalTitle}>
                Add to matches
              </ThemedText>
              <TouchableOpacity
                style={styles.modalDoneButton}
                onPress={() => setAddModalVisible(false)}>
                <ThemedText style={styles.modalDoneText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.addSearchInput,
                {
                  backgroundColor: searchInputBg,
                  borderColor: searchInputBorder,
                  color: searchInputText,
                },
              ]}
              placeholder="Search movies and TV shows..."
              placeholderTextColor="#888"
              value={addSearchQuery}
              onChangeText={setAddSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {addSearchLoading ? (
              <ThemedText style={styles.addSearchHint}>Searching...</ThemedText>
            ) : addSearchQuery.trim().length >= 2 && addSearchResults.length === 0 ? (
              <ThemedText style={styles.addSearchHint}>No results. Try a different search.</ThemedText>
            ) : addSearchQuery.trim().length < 2 ? (
              <ThemedText style={styles.addSearchHint}>Type at least 2 characters to search.</ThemedText>
            ) : null}
            <FlatList
              data={addSearchResults}
              keyExtractor={(item) => `${item.type}-${item.tmdb_id}`}
              style={styles.addResultsList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const posterUrl = item.poster_path
                  ? `https://image.tmdb.org/t/p/w154${item.poster_path}`
                  : null;
                const key = `${item.type}-${item.tmdb_id}`;
                const adding = addAddingId === key;
                return (
                  <TouchableOpacity
                    style={styles.addResultRow}
                    onPress={() => handleAddToMatches(item)}
                    disabled={adding}
                  >
                    {posterUrl ? (
                      <Image source={{ uri: posterUrl }} style={styles.addResultPoster} contentFit="cover" />
                    ) : (
                      <View style={[styles.addResultPoster, styles.posterPlaceholder]}>
                        <ThemedText style={styles.addResultPlaceholderText}>?</ThemedText>
                      </View>
                    )}
                    <View style={styles.addResultInfo}>
                      <ThemedText type="subtitle" style={styles.addResultTitle} numberOfLines={2}>
                        {item.title}
                      </ThemedText>
                      <ThemedText style={styles.addResultType}>
                        {item.type === 'movie' ? 'Movie' : 'TV Series'}
                        {(item.release_date || item.first_air_date) && ` · ${(item.release_date || item.first_air_date)?.slice(0, 4)}`}
                      </ThemedText>
                    </View>
                    {adding ? (
                      <ThemedText style={styles.addResultAdding}>Adding…</ThemedText>
                    ) : (
                      <ThemedText style={styles.addResultAddLabel}>Add</ThemedText>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
            </ThemedView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <MovieDetailModal
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          setSelectedMatch(null);
        }}
        item={
          selectedMatch
            ? {
                tmdb_id: selectedMatch.tmdb_id,
                type: selectedMatch.type,
                title: selectedMatch.title ?? 'Unknown',
                original_title: selectedMatch.original_title ?? null,
                overview: selectedMatch.overview ?? null,
                poster_path: selectedMatch.poster_path ?? null,
                backdrop_path: selectedMatch.backdrop_path ?? null,
                vote_average: selectedMatch.vote_average ?? null,
                release_date: selectedMatch.release_date ?? null,
                first_air_date: selectedMatch.first_air_date ?? null,
              }
            : null
        }
        matchId={selectedMatch?.id ?? null}
        watched={selectedMatch?.watched ?? false}
        onToggleWatched={
          selectedMatch
            ? () => {
                handleToggleWatched(
                  selectedMatch.id,
                  selectedMatch.watched,
                  selectedMatch.tmdb_id,
                  selectedMatch.type
                );
                setSelectedMatch((prev) =>
                  prev ? { ...prev, watched: !prev.watched } : null
                );
              }
            : undefined
        }
      />

      {filteredAndSortedMatches.length === 0 ? (
        <View style={styles.emptyFilters}>
          <ThemedText type="subtitle" style={styles.emptyFiltersTitle}>
            {searchQuery.trim() ? 'No matches found' : 'No matches match your filters'}
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            {searchQuery.trim()
              ? 'Try a different search or clear the search bar.'
              : 'Try changing genre or watched filters.'}
          </ThemedText>
        </View>
      ) : (
      <FlatList
        data={filteredAndSortedMatches}
        keyExtractor={(item) => item.id ?? `${item.tmdb_id}-${item.type}`}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const posterUrl = item.poster_path
            ? `https://image.tmdb.org/t/p/w300${item.poster_path}`
            : null;

          return (
            <View style={styles.matchCard}>
              <TouchableOpacity
                style={styles.matchCardTouchable}
                onPress={() => {
                  setSelectedMatch(item);
                  setDetailVisible(true);
                }}
                activeOpacity={0.7}>
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
                    <TouchableOpacity
                      style={[
                        styles.watchedBadge,
                        item.watched ? styles.watchedActive : styles.watchedInactive,
                      ]}
                      onPress={() =>
                        handleToggleWatched(item.id, item.watched, item.tmdb_id, item.type)
                      }>
                      <ThemedText
                        style={[
                          styles.watchedBadgeText,
                          item.watched ? styles.watchedActiveText : styles.watchedInactiveText,
                        ]}>
                        {item.watched ? '✓ Watched' : 'Not Watched'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
      />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 16,
  },
  filterButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: 8,
  },
  addButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#e01245',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchInput: {
    height: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(10, 126, 164, 0.12)',
    borderColor: 'rgba(10, 126, 164, 0.3)',
  },
  filterButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  filterButtonTextActive: {
    color: '#e01245',
  },
  filterButtonSummary: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  addModalKeyboardWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
  },
  addModalContent: {
    flex: 1,
    maxHeight: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  modalContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  modalInner: {
    flex: 1,
    paddingBottom: 24,
    minHeight: 320,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  modalTitle: {
    fontSize: 20,
  },
  modalDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e01245',
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  addModalInner: {
    flex: 1,
    paddingBottom: 24,
    minHeight: 360,
    maxHeight: '85%',
  },
  addSearchInput: {
    height: 44,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  addSearchHint: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    fontSize: 14,
    opacity: 0.8,
  },
  addResultsList: {
    flex: 1,
    marginTop: 8,
    paddingHorizontal: 20,
  },
  addResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  addResultPoster: {
    width: 52,
    height: 78,
    borderRadius: 8,
  },
  addResultInfo: {
    flex: 1,
    marginLeft: 12,
  },
  addResultTitle: {
    fontSize: 16,
  },
  addResultType: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 2,
  },
  addResultAdding: {
    fontSize: 14,
    opacity: 0.7,
    marginLeft: 8,
  },
  addResultAddLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e01245',
    marginLeft: 8,
  },
  addResultPlaceholderText: {
    fontSize: 18,
    opacity: 0.6,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
    marginBottom: 8,
    marginTop: 12,
  },
  genreWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  genreChipActive: {
    backgroundColor: '#e01245',
  },
  genreChipText: {
    fontSize: 14,
  },
  genreChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  watchedRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  watchedChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  watchedChipActive: {
    backgroundColor: '#e01245',
  },
  watchedChipText: {
    fontSize: 14,
  },
  watchedChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  sortChipActive: {
    backgroundColor: '#e01245',
  },
  sortChipText: {
    fontSize: 14,
  },
  sortChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyFilters: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyFiltersTitle: {
    marginBottom: 8,
    textAlign: 'center',
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
  matchCardTouchable: {
    flex: 1,
    flexDirection: 'row',
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
  },
  watchedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  watchedActive: {
    backgroundColor: '#44ff44',
  },
  watchedActiveText: {
    color: '#000',
  },
  watchedInactive: {
    backgroundColor: '#ddd',
  },
  watchedInactiveText: {
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

