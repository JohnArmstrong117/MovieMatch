import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useNotificationCounts } from '@/contexts/notification-counts-context';
import { friendHelpers } from '@/lib/db-helpers';
import type { FriendWithProfile, PendingRequestWithProfile } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function FriendsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { refetch: refetchNotificationCounts } = useNotificationCounts();
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [pendingReceived, setPendingReceived] = useState<PendingRequestWithProfile[]>([]);
  const [pendingSent, setPendingSent] = useState<PendingRequestWithProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; display_name: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  /** Friend selected for action popup (View shared / Recommend / Remove) */
  const [selectedFriend, setSelectedFriend] = useState<FriendWithProfile | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [friendsList, received, sent] = await Promise.all([
        friendHelpers.getFriends(user.id),
        friendHelpers.getPendingReceived(user.id),
        friendHelpers.getPendingSent(user.id),
      ]);
      setFriends(friendsList);
      setPendingReceived(received);
      setPendingSent(sent);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) load();
    }, [user, load])
  );

  useEffect(() => {
    if (!user || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await friendHelpers.searchByDisplayName(user.id, searchQuery.trim(), 15);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [user, searchQuery]);

  const handleSendRequest = async (toUserId: string) => {
    if (!user) return;
    setActionLoading(toUserId);
    try {
      await friendHelpers.sendRequest(user.id, toUserId);
      setSearchResults((prev) => prev.filter((p) => p.id !== toUserId));
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAccept = async (requestId: string) => {
    if (!user) return;
    setActionLoading(requestId);
    try {
      await friendHelpers.acceptRequest(requestId, user.id);
      await load();
      refetchNotificationCounts();
    } catch {
      Alert.alert('Error', 'Failed to accept');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user) return;
    setActionLoading(requestId);
    try {
      await friendHelpers.rejectRequest(requestId, user.id);
      await load();
      refetchNotificationCounts();
    } catch {
      Alert.alert('Error', 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (requestId: string) => {
    if (!user) return;
    setActionLoading(requestId);
    try {
      await friendHelpers.cancelRequest(requestId, user.id);
      await load();
    } catch {
      Alert.alert('Error', 'Failed to cancel');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = (friend: FriendWithProfile, onRemoved?: () => void) => {
    if (!user) return;
    Alert.alert(
      'Remove friend',
      `Remove ${friend.display_name || 'this user'} from your friends?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(friend.id);
            try {
              await friendHelpers.removeFriend(user.id, friend.id);
              await load();
              onRemoved?.();
            } catch {
              Alert.alert('Error', 'Failed to remove friend');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  };

  if (!user) return null;

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.loadingText}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  const pendingIncoming = pendingReceived.length > 0;
  const pendingOutgoing = pendingSent.length > 0;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.screenTitle}>
          Friends
        </ThemedText>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Your friends */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Your friends
          </ThemedText>
          {friends.length === 0 ? (
            <ThemedText style={styles.muted}>No friends yet. Add someone below or accept a request.</ThemedText>
          ) : (
            friends.map((f) => (
              <TouchableOpacity
                key={f.id}
                style={styles.friendRow}
                onPress={() => setSelectedFriend(f)}
                activeOpacity={0.7}>
                {f.avatar_url ? (
                  <Image source={{ uri: f.avatar_url }} style={styles.friendAvatar} />
                ) : (
                  <View style={styles.friendAvatarPlaceholder}>
                    <ThemedText style={styles.friendAvatarPlaceholderText}>
                      {(f.display_name || '?').charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}
                <ThemedText style={styles.friendRowLabel} numberOfLines={1}>
                  {f.display_name || 'Unknown'}
                </ThemedText>
                <ThemedText style={styles.friendRowChevron}>›</ThemedText>
              </TouchableOpacity>
            ))
          )}
        </ThemedView>

        {/* Pending incoming */}
        {pendingIncoming && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Requests to you
            </ThemedText>
            {pendingReceived.map((r) => (
              <View key={r.request_id} style={styles.row}>
                <ThemedText style={styles.rowLabel}>{r.display_name || 'Unknown'}</ThemedText>
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={[styles.smallButton, styles.smallButtonSuccess]}
                    onPress={() => handleAccept(r.request_id)}
                    disabled={actionLoading === r.request_id}>
                    {actionLoading === r.request_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.smallButtonText}>Accept</ThemedText>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallButtonDanger}
                    onPress={() => handleReject(r.request_id)}
                    disabled={actionLoading === r.request_id}>
                    <ThemedText style={styles.smallButtonDangerText}>Reject</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ThemedView>
        )}

        {/* Pending outgoing */}
        {pendingOutgoing && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Pending requests
            </ThemedText>
            {pendingSent.map((r) => (
              <View key={r.request_id} style={styles.row}>
                <ThemedText style={styles.rowLabel}>{r.display_name || 'Unknown'}</ThemedText>
                <TouchableOpacity
                  style={styles.smallButtonDanger}
                  onPress={() => handleCancel(r.request_id)}
                  disabled={actionLoading === r.request_id}>
                  {actionLoading === r.request_id ? (
                    <ActivityIndicator size="small" color="#c00" />
                  ) : (
                    <ThemedText style={styles.smallButtonDangerText}>Cancel</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </ThemedView>
        )}

        {/* From contacts */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            From contacts
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Find friends on FlickSwipe or invite contacts to join
          </ThemedText>
          <TouchableOpacity
            style={styles.contactsButton}
            onPress={() => router.push('/contacts')}
            activeOpacity={0.7}>
            <ThemedText style={styles.contactsButtonText}>Open contacts</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* Add friend */}
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Add friend
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Search by display name
          </ThemedText>
          <TextInput
            style={styles.searchInput}
            placeholder="Display name..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" style={styles.searchLoader} />}
          {searchQuery.trim() && !searching && (
            <>
              {searchResults.length === 0 ? (
                <ThemedText style={styles.muted}>No users found or already friends/pending.</ThemedText>
              ) : (
                searchResults.map((p) => (
                  <View key={p.id} style={styles.row}>
                    <ThemedText style={styles.rowLabel}>{p.display_name || 'Unknown'}</ThemedText>
                    <TouchableOpacity
                      style={styles.smallButton}
                      onPress={() => handleSendRequest(p.id)}
                      disabled={actionLoading === p.id}>
                      {actionLoading === p.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <ThemedText style={styles.smallButtonText}>Add</ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}
        </ThemedView>
      </ScrollView>

      <Modal
        visible={!!selectedFriend}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedFriend(null)}>
        <Pressable style={styles.actionModalBackdrop} onPress={() => setSelectedFriend(null)} />
        <ThemedView style={styles.actionModalContent}>
          {selectedFriend && (
            <>
              <View style={styles.actionModalHeader}>
                {selectedFriend.avatar_url ? (
                  <Image source={{ uri: selectedFriend.avatar_url }} style={styles.actionModalAvatar} />
                ) : (
                  <View style={styles.actionModalAvatarPlaceholder}>
                    <ThemedText style={styles.actionModalAvatarPlaceholderText}>
                      {(selectedFriend.display_name || '?').charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                )}
                <ThemedText type="subtitle" style={styles.actionModalName} numberOfLines={1}>
                  {selectedFriend.display_name || 'Unknown'}
                </ThemedText>
              </View>
              <TouchableOpacity
                style={styles.actionModalButton}
                onPress={() => {
                  if (selectedFriend) router.push(`/shared-with/${selectedFriend.id}`);
                  setSelectedFriend(null);
                }}>
                <ThemedText style={styles.actionModalButtonText}>View shared</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionModalButton}
                onPress={() => {
                  if (selectedFriend) router.push(`/recommend-to/${selectedFriend.id}`);
                  setSelectedFriend(null);
                }}>
                <ThemedText style={styles.actionModalButtonText}>Recommend</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionModalButton, styles.actionModalButtonDanger]}
                onPress={() => {
                  if (selectedFriend) handleRemoveFriend(selectedFriend, () => setSelectedFriend(null));
                }}
                disabled={selectedFriend && actionLoading === selectedFriend.id}>
                {selectedFriend && actionLoading === selectedFriend.id ? (
                  <ActivityIndicator size="small" color="#c00" />
                ) : (
                  <ThemedText style={styles.actionModalButtonDangerText}>Remove friend</ThemedText>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionModalButtonCancel}
                onPress={() => setSelectedFriend(null)}>
                <ThemedText style={styles.actionModalButtonCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
            </>
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  loadingText: {
    marginTop: 16,
    textAlign: 'center',
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  sectionDescription: {
    marginBottom: 12,
    opacity: 0.7,
    fontSize: 14,
  },
  contactsButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#e01245',
    borderRadius: 12,
    alignItems: 'center',
  },
  contactsButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  muted: {
    opacity: 0.7,
    fontSize: 14,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  searchLoader: {
    marginBottom: 8,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 12,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  friendAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10, 126, 164, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendAvatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
    opacity: 0.9,
  },
  friendRowLabel: {
    fontSize: 16,
    flex: 1,
  },
  friendRowChevron: {
    fontSize: 20,
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowLabel: {
    fontSize: 16,
    flex: 1,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    backgroundColor: '#e01245',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  smallButtonSuccess: {
    backgroundColor: '#e01245',
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  smallButtonDanger: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c00',
  },
  smallButtonDangerText: {
    color: '#c00',
    fontSize: 14,
    fontWeight: '600',
  },
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  actionModalContent: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 40,
    borderRadius: 16,
    overflow: 'hidden',
    paddingVertical: 8,
  },
  actionModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  actionModalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  actionModalAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(10, 126, 164, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionModalAvatarPlaceholderText: {
    fontSize: 20,
    fontWeight: '600',
    opacity: 0.9,
  },
  actionModalName: {
    flex: 1,
    fontSize: 18,
  },
  actionModalButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  actionModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e01245',
  },
  actionModalButtonDanger: {},
  actionModalButtonDangerText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#c00',
  },
  actionModalButtonCancel: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  actionModalButtonCancelText: {
    fontSize: 16,
    opacity: 0.8,
  },
});
