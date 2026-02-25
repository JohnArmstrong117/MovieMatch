import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  FlatList,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { friendHelpers, genreHelpers } from '@/lib/db-helpers';
import type { TMDBGenre } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { profileHelpers } from '@/lib/db-helpers';
import { matchHelpers } from '@/lib/db-helpers';

type WatchedFilter = 'all' | 'watched' | 'unwatched';
type SortBy = 'matched' | 'rating';

export default function SharedWithFriendScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { friendId } = useLocalSearchParams<{ friendId: string }>();
  const searchInputBg = useThemeColor({}, 'background');
  const searchInputText = useThemeColor({}, 'text');
  const searchInputBorder = useThemeColor(
    { light: 'rgba(0,0,0,0.12)', dark: 'rgba(255,255,255,0.15)' },
    'icon'
  );

  const [friendName, setFriendName] = useState<string>('');
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [filterGenreIds, setFilterGenreIds] = useState<number[]>([]);
  const [filterWatched, setFilterWatched] = useState<WatchedFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('matched');
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

  const load = useCallback(async () => {
    if (!user || !friendId) return;
    setLoading(true);
    try {
      const [profile, shared] = await Promise.all([
        profileHelpers.getProfile(friendId),
        friendHelpers.getSharedMatchesWithFriend(user.id, friendId),
      ]);
      setFriendName(profile?.display_name ?? 'Friend');
      setMatches(shared);
    } catch (e) {
      console.error(e);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [user, friendId]);

  useEffect(() => {
    if (user && friendId) {
      load();
      genreHelpers.getAll().then(setGenres);
    }
  }, [user, friendId, load]);

  const toggleGenreFilter = (genreId: number) => {
    setFilterGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const filteredAndSortedMatches = useMemo(() => {
    let list = matches.map((item) => {
      let ids = item.genre_ids;
      if (Array.isArray(ids)) {
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
      await load();
    } catch (error) {
      console.error('Error updating match:', error);
    }
  };

  if (!friendId) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Invalid friend</ThemedText>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={styles.backLink}>Go back</ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading shared matches...</ThemedText>
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.headerTitle} numberOfLines={1}>
          Shared with {friendName}
        </ThemedText>
      </View>

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
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.searchInput,
            { backgroundColor: searchInputBg, borderColor: searchInputBorder, color: searchInputText },
          ]}
          placeholder="Search shared matches..."
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
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterMenuVisible(false)} />
        <View style={styles.modalContent}>
          <ThemedView style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <ThemedText type="title" style={styles.modalTitle}>Filter & sort</ThemedText>
              <TouchableOpacity style={styles.modalDoneButton} onPress={() => setFilterMenuVisible(false)}>
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
                    <ThemedText style={[styles.watchedChipText, filterWatched === value && styles.watchedChipTextActive]}>
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
                  <ThemedText style={[styles.sortChipText, sortBy === 'matched' && styles.sortChipTextActive]}>Match order</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sortChip, sortBy === 'rating' && styles.sortChipActive]}
                  onPress={() => setSortBy('rating')}>
                  <ThemedText style={[styles.sortChipText, sortBy === 'rating' && styles.sortChipTextActive]}>Star rating</ThemedText>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </ThemedView>
        </View>
      </Modal>

      <MovieDetailModal
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); setSelectedMatch(null); }}
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
                handleToggleWatched(selectedMatch.id, selectedMatch.watched, selectedMatch.tmdb_id, selectedMatch.type);
                setSelectedMatch((prev) => (prev ? { ...prev, watched: !prev.watched } : null));
              }
            : undefined
        }
      />

      {matches.length === 0 ? (
        <View style={styles.emptyFilters}>
          <ThemedText type="subtitle" style={styles.emptyFiltersTitle}>
            No shared matches with {friendName}
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Titles you've both liked will appear here.
          </ThemedText>
        </View>
      ) : filteredAndSortedMatches.length === 0 ? (
        <View style={styles.emptyFilters}>
          <ThemedText type="subtitle" style={styles.emptyFiltersTitle}>
            {searchQuery.trim() ? 'No matches found' : 'No matches match your filters'}
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            {searchQuery.trim() ? 'Try a different search or clear the search bar.' : 'Try changing genre or watched filters.'}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedMatches}
          keyExtractor={(item) => item.id ?? `${item.tmdb_id}-${item.type}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null;
            return (
              <View style={styles.matchCard}>
                <TouchableOpacity
                  style={styles.matchCardTouchable}
                  onPress={() => { setSelectedMatch(item); setDetailVisible(true); }}
                  activeOpacity={0.7}>
                  {posterUrl ? (
                    <Image source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
                  ) : (
                    <View style={[styles.poster, styles.posterPlaceholder]}>
                      <ThemedText>No Image</ThemedText>
                    </View>
                  )}
                  <View style={styles.matchInfo}>
                    <ThemedText type="subtitle" style={styles.matchTitle}>{item.title || 'Unknown Title'}</ThemedText>
                    <ThemedText style={styles.matchType}>{item.type === 'movie' ? '🎬 Movie' : '📺 TV Series'}</ThemedText>
                    {item.overview && (
                      <ThemedText style={styles.matchOverview} numberOfLines={2}>{item.overview}</ThemedText>
                    )}
                    <View style={styles.matchMeta}>
                      {item.vote_average != null && (
                        <ThemedText style={styles.metaText}>⭐ {Number(item.vote_average).toFixed(1)}</ThemedText>
                      )}
                      <TouchableOpacity
                        style={[styles.watchedBadge, item.watched ? styles.watchedActive : styles.watchedInactive]}
                        onPress={() => handleToggleWatched(item.id, item.watched, item.tmdb_id, item.type)}>
                        <ThemedText style={[styles.watchedBadgeText, item.watched ? styles.watchedActiveText : styles.watchedInactiveText]}>
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
  container: { flex: 1, paddingTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: { paddingVertical: 8, paddingRight: 8 },
  backButtonText: { fontSize: 16, fontWeight: '600', color: '#0a7ea4' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  backLink: { color: '#0a7ea4', marginTop: 8 },
  filterButtonRow: { paddingHorizontal: 16, paddingVertical: 10, paddingBottom: 8 },
  searchRow: { paddingHorizontal: 16, paddingBottom: 12 },
  searchInput: {
    height: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
  },
  filterButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  filterButtonActive: { backgroundColor: 'rgba(10, 126, 164, 0.12)', borderColor: 'rgba(10, 126, 164, 0.3)' },
  filterButtonText: { fontSize: 16, fontWeight: '600' },
  filterButtonTextActive: { color: '#0a7ea4' },
  filterButtonSummary: { fontSize: 12, opacity: 0.8, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
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
  modalInner: { flex: 1, paddingBottom: 24, minHeight: 320 },
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
  modalTitle: { fontSize: 20 },
  modalDoneButton: { paddingVertical: 8, paddingHorizontal: 16 },
  modalDoneText: { fontSize: 16, fontWeight: '600', color: '#0a7ea4' },
  modalScroll: { paddingHorizontal: 20, paddingTop: 16 },
  filterLabel: { fontSize: 12, fontWeight: '600', opacity: 0.8, marginBottom: 8, marginTop: 12 },
  genreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  genreChipActive: { backgroundColor: '#0a7ea4' },
  genreChipText: { fontSize: 14 },
  genreChipTextActive: { color: '#fff', fontWeight: '600' },
  watchedRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  watchedChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  watchedChipActive: { backgroundColor: '#0a7ea4' },
  watchedChipText: { fontSize: 14 },
  watchedChipTextActive: { color: '#fff', fontWeight: '600' },
  sortRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  sortChipActive: { backgroundColor: '#0a7ea4' },
  sortChipText: { fontSize: 14 },
  sortChipTextActive: { color: '#fff', fontWeight: '600' },
  emptyFilters: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyFiltersTitle: { marginBottom: 8, textAlign: 'center' },
  emptyText: { textAlign: 'center', opacity: 0.7 },
  listContent: { padding: 16 },
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
  matchCardTouchable: { flex: 1, flexDirection: 'row' },
  poster: { width: 100, height: 150, backgroundColor: '#333' },
  posterPlaceholder: { backgroundColor: '#666', justifyContent: 'center', alignItems: 'center' },
  matchInfo: { flex: 1, padding: 12, justifyContent: 'space-between' },
  matchTitle: { marginBottom: 4 },
  matchType: { fontSize: 12, opacity: 0.7, marginBottom: 8 },
  matchOverview: { fontSize: 14, opacity: 0.8, marginBottom: 8 },
  matchMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 14, fontWeight: '600' },
  watchedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  watchedBadgeText: { fontSize: 12, fontWeight: '600' },
  watchedActive: { backgroundColor: '#44ff44' },
  watchedActiveText: { color: '#000' },
  watchedInactive: { backgroundColor: '#ddd' },
  watchedInactiveText: { color: '#666' },
});
