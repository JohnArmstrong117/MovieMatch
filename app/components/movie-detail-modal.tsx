import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { streamingServiceHelpers } from '@/lib/db-helpers';
import type { TMDBProvider } from '@/lib/db-helpers';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface MovieDetailItem {
  tmdb_id: number;
  type: 'movie' | 'tv';
  title: string;
  original_title?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  release_date?: string | null;
  first_air_date?: string | null;
}

export interface WatchProviderInfo {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
  type: 'flatrate' | 'rent' | 'buy';
}

interface MovieDetailModalProps {
  visible: boolean;
  onClose: () => void;
  item: MovieDetailItem | null;
  /** If provided, show a "Watched" toggle and call when it changes */
  matchId?: string | null;
  watched?: boolean;
  onToggleWatched?: () => void;
  /** User's personal star rating (1–5). When with onRate, shows star selector. */
  rating?: number | null;
  onRate?: (stars: number) => void;
  /** If provided and not in matches, show "Add to my matches" button */
  onAddToMatches?: () => void | Promise<void>;
  isInMyMatches?: boolean;
  /** When viewing a recommendation: sender display name and optional message */
  senderName?: string | null;
  senderMessage?: string | null;
}

export function MovieDetailModal({
  visible,
  onClose,
  item,
  matchId,
  watched = false,
  onToggleWatched,
  rating = null,
  onRate,
  onAddToMatches,
  isInMyMatches = false,
  senderName,
  senderMessage,
}: MovieDetailModalProps) {
  const { user } = useAuth();
  const watchedButtonBorderColor = useThemeColor(
    { light: 'rgba(0,0,0,0.18)', dark: 'rgba(255,255,255,0.9)' },
    'text'
  );
  const watchedButtonActiveBorderColor = useThemeColor(
    { light: '#2acc2a', dark: 'rgba(255,255,255,0.9)' },
    'text'
  );
  const [providers, setProviders] = useState<WatchProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [topCast, setTopCast] = useState<string[]>([]);
  const [loadingCast, setLoadingCast] = useState(false);
  /** User's selected providers (feed is filtered by these); shown when TMDB returns no per-title data */
  const [userProviders, setUserProviders] = useState<TMDBProvider[]>([]);

  useEffect(() => {
    if (!visible || !item) {
      setProviders([]);
      setUserProviders([]);
      setTopCast([]);
      return;
    }
    let cancelled = false;
    setLoadingProviders(true);
    setProviders([]);
    setUserProviders([]);
    const url = `${getSupabaseUrl()}/functions/v1/get_watch_providers`;
    const anonKey = getSupabaseAnonKey();
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ tmdb_id: item.tmdb_id, type: item.type }),
    })
      .then(async (res) => {
        let data: { providers?: unknown[] } = {};
        try {
          data = await res.json();
        } catch {
          // ignore
        }
        if (!cancelled) {
          setLoadingProviders(false);
          const list = Array.isArray(data?.providers) ? data.providers : [];
          if (list.length > 0) {
            setProviders(list as WatchProviderInfo[]);
          }
        }
      })
      .catch((err) => {
        if (__DEV__) console.warn('get_watch_providers:', err?.message ?? err);
        if (!cancelled) setLoadingProviders(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, item?.tmdb_id, item?.type]);

  useEffect(() => {
    if (!visible || !item) {
      setTopCast([]);
      setLoadingCast(false);
      return;
    }
    let cancelled = false;
    setLoadingCast(true);
    setTopCast([]);
    const url = `${getSupabaseUrl()}/functions/v1/get_credits`;
    const anonKey = getSupabaseAnonKey();
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ tmdb_id: item.tmdb_id, type: item.type }),
    })
      .then(async (res) => {
        let data: { cast?: string[] } = {};
        try {
          data = await res.json();
        } catch {
          // ignore
        }
        if (!cancelled) {
          setLoadingCast(false);
          const cast = Array.isArray(data?.cast) ? data.cast : [];
          setTopCast(cast.slice(0, 3));
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingCast(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, item?.tmdb_id, item?.type]);

  // When TMDB returns no providers, load user's selected providers (feed is filtered by these)
  useEffect(() => {
    if (!visible || !user || loadingProviders || providers.length > 0) {
      return;
    }
    let cancelled = false;
    streamingServiceHelpers.getUserServices(user.id).then((list) => {
      if (!cancelled && list.length > 0) {
        setUserProviders(list);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [visible, user?.id, loadingProviders, providers.length]);

  if (!item) return null;

  const posterUrl = item.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
    : null;
  const dateLabel =
    item.type === 'movie'
      ? item.release_date
      : item.first_air_date
        ? `First aired: ${item.first_air_date}`
        : null;

  const flatrate = providers.filter((p) => p.type === 'flatrate');
  const rent = providers.filter((p) => p.type === 'rent');
  const buy = providers.filter((p) => p.type === 'buy');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.backdropTouchable}>
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        </View>
        <View style={styles.card}>
          <ThemedView style={styles.inner}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={12}>
              <ThemedText style={styles.closeText}>✕</ThemedText>
            </TouchableOpacity>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              bounces={true}
              nestedScrollEnabled={true}>
              {posterUrl ? (
                <ExpoImage
                  source={{ uri: posterUrl }}
                  style={styles.poster}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.poster, styles.posterPlaceholder]}>
                  <ThemedText>No Image</ThemedText>
                </View>
              )}

              <ThemedText type="title" style={styles.title}>
                {item.title || 'Unknown Title'}
              </ThemedText>
              {senderMessage != null && senderMessage.trim() !== '' && (
                <View style={styles.senderMessageBlock}>
                  <ThemedText style={styles.senderMessageLabel}>
                    {senderName ? `Message from ${senderName}` : 'Message'}
                  </ThemedText>
                  <ThemedText style={styles.senderMessageText}>{senderMessage}</ThemedText>
                </View>
              )}
              {item.original_title && item.original_title !== item.title && (
                <ThemedText style={styles.originalTitle}>
                  {item.original_title}
                </ThemedText>
              )}
              <View style={styles.metaRow}>
                <ThemedText style={styles.meta}>
                  {item.type === 'movie' ? '🎬 Movie' : '📺 TV Series'}
                </ThemedText>
                {item.vote_average != null && (
                  <ThemedText style={styles.meta}>
                    ⭐ {Number(item.vote_average).toFixed(1)}
                  </ThemedText>
                )}
                {dateLabel && (
                  <ThemedText style={styles.meta}>{dateLabel}</ThemedText>
                )}
              </View>

              {matchId != null && onToggleWatched && (
                <TouchableOpacity
                  style={[
                    styles.watchedButton,
                    watched ? styles.watchedButtonActive : styles.watchedButtonInactive,
                    {
                      borderColor: watched
                        ? watchedButtonActiveBorderColor
                        : watchedButtonBorderColor,
                    },
                  ]}
                  onPress={onToggleWatched}>
                  <ThemedText
                    style={[
                      styles.watchedButtonText,
                      watched && styles.watchedButtonTextActive,
                    ]}>
                    {watched ? '✓ Watched' : 'Mark as Watched'}
                  </ThemedText>
                </TouchableOpacity>
              )}

              {matchId != null && onRate && (
                <View style={styles.ratingSection}>
                  <ThemedText style={styles.sectionLabel}>Your rating</ThemedText>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => onRate(star)}
                        style={styles.starTouch}
                        hitSlop={8}>
                        <ThemedText style={styles.star}>
                          {typeof rating === 'number' && rating >= star ? '★' : '☆'}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {onAddToMatches && !isInMyMatches && (
                <TouchableOpacity
                  style={styles.addToMatchesButton}
                  onPress={onAddToMatches}
                  activeOpacity={0.8}>
                  <ThemedText style={styles.addToMatchesButtonText}>
                    Add to my matches
                  </ThemedText>
                </TouchableOpacity>
              )}
              {onAddToMatches && isInMyMatches && (
                <View style={styles.inMyMatchesChip}>
                  <ThemedText style={styles.inMyMatchesChipText}>✓ In my matches</ThemedText>
                </View>
              )}

              {item.overview ? (
                <>
                  <ThemedText style={styles.sectionLabel}>Overview</ThemedText>
                  <ThemedText style={styles.overview}>{item.overview}</ThemedText>
                </>
              ) : (
                <ThemedText style={styles.overviewMuted}>No description available.</ThemedText>
              )}

              <ThemedText style={styles.sectionLabel}>Top Cast</ThemedText>
              {loadingCast ? (
                <ActivityIndicator size="small" style={styles.castLoader} />
              ) : topCast.length > 0 ? (
                <ThemedText style={styles.topCastText}>
                  {topCast.join(', ')}
                </ThemedText>
              ) : (
                <ThemedText style={styles.overviewMuted}>No cast information available.</ThemedText>
              )}

              <ThemedText style={styles.sectionLabel}>Where to watch (US)</ThemedText>
              {loadingProviders ? (
                <ActivityIndicator size="small" style={styles.providerLoader} />
              ) : providers.length === 0 ? (
                userProviders.length > 0 ? (
                  <View style={styles.providersSection}>
                    <ThemedText style={styles.providerTypeLabel}>
                      Likely on your selected providers
                    </ThemedText>
                    <ThemedText style={styles.providersMuted}>
                      Exact US availability couldn’t be loaded. This title is in your feed because it’s available on at least one of these—check the provider app for current availability.
                    </ThemedText>
                    <View style={styles.providerLogos}>
                      {userProviders.map((p) => (
                        <View key={p.provider_id} style={styles.providerChip}>
                          {p.logo_path ? (
                            <Image
                              source={{ uri: `${TMDB_IMAGE_BASE}/w92${p.logo_path}` }}
                              style={styles.providerLogo}
                              resizeMode="contain"
                            />
                          ) : null}
                          <ThemedText style={styles.providerName} numberOfLines={1}>
                            {p.provider_name}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <ThemedText style={styles.providersMuted}>
                    No streaming information available for the US for this title.
                  </ThemedText>
                )
              ) : (
                <View style={styles.providersSection}>
                  {flatrate.length > 0 && (
                    <View style={styles.providerGroup}>
                      <ThemedText style={styles.providerTypeLabel}>Stream</ThemedText>
                      <View style={styles.providerLogos}>
                        {flatrate.map((p) => (
                          <View key={`${p.provider_id}-flatrate`} style={styles.providerChip}>
                            {p.logo_path ? (
                              <Image
                                source={{
                                  uri: `${TMDB_IMAGE_BASE}/w92${p.logo_path}`,
                                }}
                                style={styles.providerLogo}
                                resizeMode="contain"
                              />
                            ) : null}
                            <ThemedText style={styles.providerName} numberOfLines={1}>
                              {p.provider_name}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {rent.length > 0 && (
                    <View style={styles.providerGroup}>
                      <ThemedText style={styles.providerTypeLabel}>Rent</ThemedText>
                      <View style={styles.providerLogos}>
                        {rent.map((p) => (
                          <View key={`${p.provider_id}-rent`} style={styles.providerChip}>
                            {p.logo_path ? (
                              <Image
                                source={{ uri: `${TMDB_IMAGE_BASE}/w92${p.logo_path}` }}
                                style={styles.providerLogo}
                                resizeMode="contain"
                              />
                            ) : null}
                            <ThemedText style={styles.providerName} numberOfLines={1}>
                              {p.provider_name}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  {buy.length > 0 && (
                    <View style={styles.providerGroup}>
                      <ThemedText style={styles.providerTypeLabel}>Buy</ThemedText>
                      <View style={styles.providerLogos}>
                        {buy.map((p) => (
                          <View key={`${p.provider_id}-buy`} style={styles.providerChip}>
                            {p.logo_path ? (
                              <Image
                                source={{ uri: `${TMDB_IMAGE_BASE}/w92${p.logo_path}` }}
                                style={styles.providerLogo}
                                resizeMode="contain"
                              />
                            ) : null}
                            <ThemedText style={styles.providerName} numberOfLines={1}>
                              {p.provider_name}
                            </ThemedText>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </ThemedView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  backdropTouchable: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  card: {
    zIndex: 1,
    width: '100%',
    maxWidth: 420,
    height: '85%',
    maxHeight: 600,
    borderRadius: 16,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  poster: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 12,
    backgroundColor: '#333',
    marginBottom: 16,
  },
  posterPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    marginBottom: 4,
  },
  originalTitle: {
    fontSize: 14,
    opacity: 0.8,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  meta: {
    fontSize: 14,
    opacity: 0.9,
  },
  watchedButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 2,
  },
  watchedButtonActive: {
    backgroundColor: '#44ff44',
  },
  watchedButtonInactive: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  watchedButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  watchedButtonTextActive: {
    color: '#000',
  },
  ratingSection: {
    marginBottom: 16,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starTouch: {
    padding: 4,
  },
  star: {
    fontSize: 28,
    opacity: 0.95,
    paddingTop: 10,
  },
  addToMatchesButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#fff',
  },
  addToMatchesButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inMyMatchesChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(68, 255, 68, 0.25)',
  },
  inMyMatchesChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  senderMessageBlock: {
    marginTop: 12,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(10, 126, 164, 0.5)',
  },
  senderMessageLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.85,
    marginBottom: 4,
  },
  senderMessageText: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.95,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.9,
    marginBottom: 6,
  },
  overview: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.95,
    marginBottom: 20,
  },
  overviewMuted: {
    fontSize: 15,
    opacity: 0.7,
    marginBottom: 20,
  },
  castLoader: {
    marginVertical: 6,
  },
  topCastText: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.95,
    marginBottom: 20,
  },
  providerLoader: {
    marginVertical: 12,
  },
  providersMuted: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  providersSection: {
    gap: 14,
  },
  providerGroup: {
    gap: 8,
  },
  providerTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
  },
  providerLogos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.06)',
    maxWidth: 140,
  },
  providerLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  providerName: {
    fontSize: 12,
    flex: 1,
  },
});
