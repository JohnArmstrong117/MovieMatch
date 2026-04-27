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
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { friendHelpers, genreHelpers, matchHelpers } from '@/lib/db-helpers';
import type { TMDBGenre } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MovieDetailModal } from '@/components/movie-detail-modal';
import { profileHelpers } from '@/lib/db-helpers';

type WatchedFilter = 'all' | 'watched' | 'unwatched';
type SortBy = 'matched' | 'rating';

function key(tmdbId: number, type: string) {
  return `${tmdbId}-${type}`;
}

export default function RecommendToFriendScreen() {
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
  const [recommendedSet, setRecommendedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [recommendingKey, setRecommendingKey] = useState<string | null>(null);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [filterGenreIds, setFilterGenreIds] = useState<number[]>([]);
  const [filterWatched, setFilterWatched] = useState<WatchedFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('matched');
  const [filterMenuVisible, setFilterMenuVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  /** When set, show modal to add optional message before sending recommendation */
  const [recommendModalItem, setRecommendModalItem] = useState<any | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  /** Keyboard height so we can push the sheet up above it (iOS) */
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const load = useCallback(async () => {
    if (!user || !friendId) return;
    setLoading(true);
    try {
      const blocked = await friendHelpers.isBlockedWith(friendId);
      if (blocked) {
        Alert.alert('Unavailable', 'You can’t recommend titles to this person.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        setMatches([]);
        setFriendName('');
        return;
      }
      await matchHelpers.syncFromSwipes(user.id);
      const [profile, myMatches, sent] = await Promise.all([
        profileHelpers.getProfile(friendId),
        matchHelpers.getMatchesWithTitles(user.id),
        friendHelpers.getRecommendationsSentToFriend(user.id, friendId),
      ]);
      setFriendName(profile?.display_name ?? 'Friend');
      setMatches(myMatches);
      setRecommendedSet(new Set(sent.map((r) => key(r.tmdb_id, r.type))));
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load your matches');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [user, friendId, router]);

  useEffect(() => {
    if (user && friendId) {
      load();
      genreHelpers.getAll().then(setGenres);
    }
  }, [user, friendId, load]);

  // When recommend modal is open, listen for keyboard to push sheet up (fixes iOS keyboard covering content)
  useEffect(() => {
    if (!recommendModalItem) {
      setKeyboardHeight(0);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardHeight(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardHeight(0);
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [recommendModalItem]);

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

  const handleRecommendPress = (item: any) => {
    const k = key(item.tmdb_id, item.type);
    if (recommendedSet.has(k)) return;
    setRecommendModalItem(item);
    setMessageDraft('');
  };

  const handleSendRecommendation = async () => {
    const item = recommendModalItem;
    if (!user || !friendId || !item) return;
    const k = key(item.tmdb_id, item.type);
    if (recommendedSet.has(k)) {
      setRecommendModalItem(null);
      return;
    }
    setRecommendingKey(k);
    try {
      await friendHelpers.sendRecommendation(
        user.id,
        friendId,
        item.tmdb_id,
        item.type,
        messageDraft.trim() || undefined
      );
      setRecommendedSet((prev) => new Set(prev).add(k));
      setRecommendModalItem(null);
      setMessageDraft('');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send recommendation');
    } finally {
      setRecommendingKey(null);
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
        <ThemedText>Loading your matches...</ThemedText>
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
          Recommend to {friendName}
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
          placeholder="Search your matches..."
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
      />

      <Modal
        visible={!!recommendModalItem}
        transparent
        animationType="slide"
        onRequestClose={() => setRecommendModalItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRecommendModalItem(null)} />
        <View style={[styles.modalContent, { marginBottom: keyboardHeight }]}>
            <ThemedView style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <ThemedText type="title" style={styles.modalTitle}>
                  Recommend to {friendName}
                </ThemedText>
                <TouchableOpacity onPress={() => setRecommendModalItem(null)}>
                  <ThemedText style={styles.modalDoneText}>Cancel</ThemedText>
                </TouchableOpacity>
              </View>
              {recommendModalItem && (
                <ScrollView
                  style={styles.recommendModalScroll}
                  contentContainerStyle={styles.recommendModalBody}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}>
                  <ThemedText style={styles.recommendModalTitle}>
                    {recommendModalItem.title ?? 'Unknown Title'}
                  </ThemedText>
                  <ThemedText style={styles.recommendModalLabel}>Add a short message (optional)</ThemedText>
                  <TextInput
                    style={[
                      styles.recommendMessageInput,
                      { backgroundColor: searchInputBg, borderColor: searchInputBorder, color: searchInputText },
                    ]}
                    placeholder="e.g. You'll love this one!"
                    placeholderTextColor="#888"
                    value={messageDraft}
                    onChangeText={setMessageDraft}
                    multiline
                    maxLength={300}
                    editable={recommendingKey !== key(recommendModalItem.tmdb_id, recommendModalItem.type)}
                  />
                  <ThemedText style={styles.recommendMessageHint}>{messageDraft.length}/300</ThemedText>
                  <TouchableOpacity
                    style={styles.recommendSendButton}
                    onPress={handleSendRecommendation}
                    disabled={recommendingKey === key(recommendModalItem.tmdb_id, recommendModalItem.type)}>
                    {recommendingKey === key(recommendModalItem.tmdb_id, recommendModalItem.type) ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.recommendSendButtonText}>Send recommendation</ThemedText>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              )}
            </ThemedView>
          </View>
      </Modal>

      {matches.length === 0 ? (
        <View style={styles.emptyFilters}>
          <ThemedText type="subtitle" style={styles.emptyFiltersTitle}>
            No matches yet
          </ThemedText>
          <ThemedText style={styles.emptyText}>
            Like some titles on the Swipe tab, then you can recommend them to {friendName}.
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
            const k = key(item.tmdb_id, item.type);
            const alreadyRecommended = recommendedSet.has(k);
            const isRecommending = recommendingKey === k;
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
                        style={[
                          styles.recommendButton,
                          alreadyRecommended && styles.recommendButtonDone,
                        ]}
                        onPress={() => handleRecommendPress(item)}
                        disabled={alreadyRecommended || isRecommending}>
                        {isRecommending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : alreadyRecommended ? (
                          <ThemedText style={styles.recommendButtonText}>✓ Recommended</ThemedText>
                        ) : (
                          <ThemedText style={styles.recommendButtonText}>Recommend</ThemedText>
                        )}
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
  backButtonText: { fontSize: 16, fontWeight: '600', color: '#c41010' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600' },
  backLink: { color: '#c41010', marginTop: 8 },
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
  filterButtonTextActive: { color: '#c41010' },
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
  modalInner: { flex: 1, paddingBottom: 24, minHeight: 280 },
  recommendModalScroll: { flex: 1 },
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
  modalDoneText: { fontSize: 16, fontWeight: '600', color: '#c41010' },
  recommendModalBody: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  recommendModalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 4 },
  recommendModalLabel: { fontSize: 14, opacity: 0.85, marginTop: 16, marginBottom: 6 },
  recommendMessageInput: {
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  recommendMessageHint: { fontSize: 12, opacity: 0.6, marginTop: 4 },
  recommendSendButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#c41010',
    alignItems: 'center',
  },
  recommendSendButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  modalScroll: { paddingHorizontal: 20, paddingTop: 16 },
  filterLabel: { fontSize: 12, fontWeight: '600', opacity: 0.8, marginBottom: 8, marginTop: 12 },
  genreWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genreChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  genreChipActive: { backgroundColor: '#c41010' },
  genreChipText: { fontSize: 14 },
  genreChipTextActive: { color: '#fff', fontWeight: '600' },
  watchedRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  watchedChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  watchedChipActive: { backgroundColor: '#c41010' },
  watchedChipText: { fontSize: 14 },
  watchedChipTextActive: { color: '#fff', fontWeight: '600' },
  sortRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)' },
  sortChipActive: { backgroundColor: '#c41010' },
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
  recommendButton: {
    backgroundColor: '#c41010',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  recommendButtonDone: {
    backgroundColor: '#2e7d32',
  },
  recommendButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
