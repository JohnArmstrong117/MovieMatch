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
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { streamingServiceHelpers, friendHelpers } from '@/lib/db-helpers';
import type { TMDBProvider, FriendWithProfile } from '@/lib/db-helpers';
import { SAFETY_REASON_OPTIONS } from '@/lib/safety-reasons';
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
  /** Inbox: report message and/or block sender (reason picker + server moderation row). */
  inboxSafety?: {
    otherDisplayName: string | null;
    onReport: (reasonCode: string, reasonDetail: string | null) => Promise<void>;
    onBlock: (reasonCode: string, reasonDetail: string | null) => Promise<void>;
  } | null;
  /** If provided and item is in matches (matchId set), show "Remove from my matches" at bottom */
  onRemoveFromMatches?: () => void | Promise<void>;
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
  inboxSafety = null,
  onRemoveFromMatches,
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
  const recommendInputBg = useThemeColor({}, 'background');
  const recommendInputText = useThemeColor({}, 'text');
  const recommendInputBorder = useThemeColor(
    { light: 'rgba(0,0,0,0.12)', dark: 'rgba(255,255,255,0.15)' },
    'icon'
  );
  const [providers, setProviders] = useState<WatchProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [topCast, setTopCast] = useState<string[]>([]);
  const [loadingCast, setLoadingCast] = useState(false);
  /** User's selected providers (feed is filtered by these); shown when TMDB returns no per-title data */
  const [userProviders, setUserProviders] = useState<TMDBProvider[]>([]);
  /** Recommend to friends: modal open, friends list, selected ids, message draft, sending */
  const [recommendModalOpen, setRecommendModalOpen] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendWithProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [recommendMessage, setRecommendMessage] = useState('');
  const [recommendSending, setRecommendSending] = useState(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  const [safetyMode, setSafetyMode] = useState<'report' | 'block' | null>(null);
  const [selectedReasonCode, setSelectedReasonCode] = useState<string | null>(null);
  const [otherReasonText, setOtherReasonText] = useState('');
  const [safetySubmitting, setSafetySubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSafetyModalOpen(false);
      setSafetyMode(null);
      setSelectedReasonCode(null);
      setOtherReasonText('');
      setSafetySubmitting(false);
    }
  }, [visible]);

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
    if (!recommendModalOpen || !user) {
      if (!recommendModalOpen) {
        setSelectedFriendIds(new Set());
        setRecommendMessage('');
      }
      return;
    }
    let cancelled = false;
    setFriendsLoading(true);
    setFriendsList([]);
    friendHelpers.getFriends().then((list: FriendWithProfile[]) => {
      if (!cancelled) {
        setFriendsList(list);
        setFriendsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setFriendsLoading(false);
    });
    return () => { cancelled = true; };
  }, [recommendModalOpen, user]);

  const toggleFriendSelected = (friendId: string) => {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) next.delete(friendId);
      else next.add(friendId);
      return next;
    });
  };

  const allSelected = friendsList.length > 0 && selectedFriendIds.size === friendsList.length;
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedFriendIds(new Set());
    } else {
      setSelectedFriendIds(new Set(friendsList.map((f) => f.id)));
    }
  };

  const handleSendRecommendations = async () => {
    if (!user || !item || selectedFriendIds.size === 0) return;
    const trimmedMessage = recommendMessage.trim() || undefined;
    setRecommendSending(true);
    try {
      for (const toUserId of selectedFriendIds) {
        await friendHelpers.sendRecommendation(user.id, toUserId, item.tmdb_id, item.type, trimmedMessage ?? null);
      }
      setRecommendModalOpen(false);
      Alert.alert('Sent', `Recommended to ${selectedFriendIds.size} friend${selectedFriendIds.size === 1 ? '' : 's'}`);
    } catch (e: unknown) {
      Alert.alert('Error', (e as Error)?.message ?? 'Failed to send recommendations');
    } finally {
      setRecommendSending(false);
    }
  };

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

  const openSafetyReasonModal = (mode: 'report' | 'block') => {
    setSafetyMode(mode);
    setSelectedReasonCode(null);
    setOtherReasonText('');
    setSafetyModalOpen(true);
  };

  const submitSafetyReason = async () => {
    if (!inboxSafety || !safetyMode || !selectedReasonCode) return;
    const detail =
      selectedReasonCode === 'other' ? (otherReasonText.trim() || null) : null;
    if (selectedReasonCode === 'other' && !detail) {
      Alert.alert('Describe the issue', 'Please add a short description for “Something else”.');
      return;
    }
    setSafetySubmitting(true);
    try {
      if (safetyMode === 'report') {
        await inboxSafety.onReport(selectedReasonCode, detail);
        Alert.alert('Thanks', 'We received your report.');
      } else {
        await inboxSafety.onBlock(selectedReasonCode, detail);
        Alert.alert('Blocked', 'You will not see recommendations from this person, and you cannot interact.');
        onClose();
      }
      setSafetyModalOpen(false);
      setSafetyMode(null);
      setSelectedReasonCode(null);
      setOtherReasonText('');
    } catch (e) {
      Alert.alert('Error', (e as Error)?.message ?? 'Something went wrong');
    } finally {
      setSafetySubmitting(false);
    }
  };

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
              {inboxSafety && (
                <View style={styles.inboxSafetySection}>
                  <ThemedText style={styles.sectionLabel}>Safety</ThemedText>
                  <TouchableOpacity
                    style={styles.inboxSafetyButton}
                    onPress={() => openSafetyReasonModal('report')}
                    activeOpacity={0.7}>
                    <ThemedText style={styles.inboxSafetyButtonText}>Report message</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.inboxSafetyButton, styles.inboxSafetyButtonDanger]}
                    onPress={() => {
                      const name = inboxSafety.otherDisplayName?.trim() || 'this person';
                      Alert.alert(
                        'Block user?',
                        `Block ${name}? You will not see each other’s recommendations, and you cannot send friend requests or recommendations to each other. We log this for moderation.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Choose reason', onPress: () => openSafetyReasonModal('block') },
                        ]
                      );
                    }}
                    activeOpacity={0.7}>
                    <ThemedText style={styles.inboxSafetyButtonTextDanger}>Block user</ThemedText>
                  </TouchableOpacity>
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

              {item && user && (
                <TouchableOpacity
                  style={styles.recommendButton}
                  onPress={() => setRecommendModalOpen(true)}
                  activeOpacity={0.8}>
                  <ThemedText style={styles.recommendButtonText}>Recommend</ThemedText>
                </TouchableOpacity>
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

              {matchId != null && onRemoveFromMatches && (
                <TouchableOpacity
                  style={styles.removeFromMatchesButton}
                  onPress={onRemoveFromMatches}
                  activeOpacity={0.8}>
                  <ThemedText style={styles.removeFromMatchesButtonText}>
                    Remove from my matches
                  </ThemedText>
                </TouchableOpacity>
              )}
            </ScrollView>
          </ThemedView>
        </View>
      </View>

      <Modal
        visible={recommendModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setRecommendModalOpen(false)}>
        <Pressable style={styles.recommendBackdrop} onPress={() => setRecommendModalOpen(false)} />
        <View style={styles.recommendModalContent}>
          <ThemedView style={styles.recommendModalInner}>
            <View style={styles.recommendModalHeader}>
              <ThemedText type="title" style={styles.recommendModalTitle}>
                Recommend to friends
              </ThemedText>
              <TouchableOpacity onPress={() => setRecommendModalOpen(false)}>
                <ThemedText style={styles.modalDoneText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
            {item && (
              <ScrollView
                style={styles.recommendModalScroll}
                contentContainerStyle={styles.recommendModalBody}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator>
                <ThemedText style={styles.recommendItemTitle}>{item.title ?? 'Unknown Title'}</ThemedText>
                <ThemedText style={styles.recommendModalLabel}>Select friends</ThemedText>
                {friendsLoading ? (
                  <ActivityIndicator size="small" style={styles.recommendFriendsLoader} />
                ) : friendsList.length === 0 ? (
                  <ThemedText style={styles.recommendEmptyText}>No friends yet. Add friends to recommend.</ThemedText>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.recommendSelectAllRow, allSelected && styles.recommendFriendRowSelected]}
                      onPress={toggleSelectAll}
                      activeOpacity={0.7}>
                      <View style={[styles.recommendCheckbox, allSelected && styles.recommendCheckboxSelected]}>
                        {allSelected && <ThemedText style={styles.recommendCheckmark}>✓</ThemedText>}
                      </View>
                      <ThemedText style={styles.recommendSelectAllText}>
                        {allSelected ? 'Deselect all' : 'Select all'}
                      </ThemedText>
                    </TouchableOpacity>
                  <View style={styles.recommendFriendList}>
                    {friendsList.map((friend) => {
                      const isSelected = selectedFriendIds.has(friend.id);
                      return (
                        <TouchableOpacity
                          key={friend.id}
                          style={[styles.recommendFriendRow, isSelected && styles.recommendFriendRowSelected]}
                          onPress={() => toggleFriendSelected(friend.id)}
                          activeOpacity={0.7}>
                          <View style={[styles.recommendCheckbox, isSelected && styles.recommendCheckboxSelected]}>
                            {isSelected && <ThemedText style={styles.recommendCheckmark}>✓</ThemedText>}
                          </View>
                          <ThemedText style={styles.recommendFriendName} numberOfLines={1}>
                            {friend.display_name || 'Friend'}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  </>
                )}
                <ThemedText style={[styles.recommendModalLabel, styles.recommendMessageLabel]}>Add a short message (optional)</ThemedText>
                <TextInput
                  style={[
                    styles.recommendMessageInput,
                    { backgroundColor: recommendInputBg, borderColor: recommendInputBorder, color: recommendInputText },
                  ]}
                  placeholder="e.g. You'll love this one!"
                  placeholderTextColor="#888"
                  value={recommendMessage}
                  onChangeText={setRecommendMessage}
                  multiline
                  maxLength={300}
                  editable={!recommendSending}
                />
                <ThemedText style={styles.recommendMessageHint}>{recommendMessage.length}/300</ThemedText>
                <TouchableOpacity
                  style={[styles.recommendSendButton, (selectedFriendIds.size === 0 || recommendSending) && styles.recommendSendButtonDisabled]}
                  onPress={handleSendRecommendations}
                  disabled={selectedFriendIds.size === 0 || recommendSending}>
                  {recommendSending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.recommendSendButtonText}>
                      Send to {selectedFriendIds.size} friend{selectedFriendIds.size === 1 ? '' : 's'}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={safetyModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!safetySubmitting) setSafetyModalOpen(false);
        }}>
        <View style={styles.safetyBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!safetySubmitting) setSafetyModalOpen(false);
            }}
          />
          <ThemedView style={styles.safetySheet} onStartShouldSetResponder={() => true}>
            <ThemedText type="subtitle" style={styles.safetyTitle}>
              {safetyMode === 'block' ? 'Why are you blocking?' : 'Why are you reporting?'}
            </ThemedText>
            <ScrollView
              style={styles.safetyScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {SAFETY_REASON_OPTIONS.map((opt) => {
                const selected = selectedReasonCode === opt.code;
                return (
                  <TouchableOpacity
                    key={opt.code}
                    style={[styles.safetyReasonRow, selected && styles.safetyReasonRowSelected]}
                    onPress={() => setSelectedReasonCode(opt.code)}
                    disabled={safetySubmitting}>
                    <ThemedText style={styles.safetyReasonLabel}>{opt.label}</ThemedText>
                  </TouchableOpacity>
                );
              })}
              {selectedReasonCode === 'other' && (
                <TextInput
                  style={[
                    styles.safetyOtherInput,
                    { backgroundColor: recommendInputBg, borderColor: recommendInputBorder, color: recommendInputText },
                  ]}
                  placeholder="Brief details"
                  placeholderTextColor="#888"
                  value={otherReasonText}
                  onChangeText={setOtherReasonText}
                  multiline
                  maxLength={500}
                  editable={!safetySubmitting}
                />
              )}
            </ScrollView>
            <View style={styles.safetyActions}>
              <TouchableOpacity
                style={styles.safetyCancelBtn}
                onPress={() => !safetySubmitting && setSafetyModalOpen(false)}>
                <ThemedText style={styles.safetyCancelBtnText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.safetySubmitBtn,
                  (!selectedReasonCode || safetySubmitting) && styles.safetySubmitBtnDisabled,
                ]}
                onPress={submitSafetyReason}
                disabled={!selectedReasonCode || safetySubmitting}>
                {safetySubmitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.safetySubmitBtnText}>Submit</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </ThemedView>
        </View>
      </Modal>
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
  removeFromMatchesButton: {
    marginTop: 24,
    marginBottom: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#c41010',
  },
  removeFromMatchesButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#c41010',
  },
  recommendButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#c41010',
  },
  recommendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  recommendBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  recommendModalContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  recommendModalInner: {
    flex: 1,
    paddingBottom: 24,
    minHeight: 280,
  },
  recommendModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  recommendModalTitle: {
    fontSize: 20,
    flex: 1,
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#c41010',
  },
  recommendModalScroll: {
    flex: 1,
  },
  recommendModalBody: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  recommendItemTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  recommendModalLabel: {
    fontSize: 14,
    opacity: 0.85,
    marginTop: 16,
    marginBottom: 6,
  },
  recommendMessageLabel: {
    marginTop: 20,
  },
  recommendFriendsLoader: {
    marginVertical: 16,
  },
  recommendEmptyText: {
    fontSize: 14,
    opacity: 0.8,
    marginVertical: 8,
  },
  recommendSelectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  recommendSelectAllText: {
    fontSize: 16,
    fontWeight: '600',
  },
  recommendFriendList: {
    marginBottom: 8,
  },
  recommendFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  recommendFriendRowSelected: {
    backgroundColor: 'rgba(68, 136, 255, 0.08)',
  },
  recommendCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendCheckboxSelected: {
    borderColor: '#4488ff',
    backgroundColor: '#4488ff',
  },
  recommendCheckmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  recommendFriendName: {
    flex: 1,
    fontSize: 16,
  },
  recommendMessageInput: {
    minHeight: 88,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  recommendMessageHint: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  recommendSendButton: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#c41010',
    alignItems: 'center',
  },
  recommendSendButtonDisabled: {
    opacity: 0.6,
  },
  recommendSendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
  inboxSafetySection: {
    marginTop: 8,
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
  },
  inboxSafetyButton: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 8,
  },
  inboxSafetyButtonDanger: {
    marginTop: 4,
  },
  inboxSafetyButtonText: {
    fontSize: 16,
    color: '#1a6bcc',
    fontWeight: '600',
  },
  inboxSafetyButtonTextDanger: {
    fontSize: 16,
    color: '#c41010',
    fontWeight: '600',
  },
  safetyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  safetySheet: {
    borderRadius: 14,
    padding: 16,
    maxHeight: '80%',
  },
  safetyTitle: {
    marginBottom: 12,
  },
  safetyScroll: {
    maxHeight: 320,
  },
  safetyReasonRow: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  safetyReasonRowSelected: {
    borderColor: '#1a6bcc',
    backgroundColor: 'rgba(26, 107, 204, 0.08)',
  },
  safetyReasonLabel: {
    fontSize: 16,
  },
  safetyOtherInput: {
    minHeight: 72,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  safetyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  safetyCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  safetyCancelBtnText: {
    fontSize: 16,
    opacity: 0.85,
  },
  safetySubmitBtn: {
    marginLeft: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#c41010',
    minWidth: 100,
    alignItems: 'center',
  },
  safetySubmitBtnDisabled: {
    opacity: 0.5,
  },
  safetySubmitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
