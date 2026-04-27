import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  TextInput,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Contacts from 'expo-contacts';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { friendHelpers } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

function normalizePhone(phone: string): string {
  return (phone ?? '').replace(/\D/g, '');
}

function formatPhoneDisplay(digits: string): string {
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return digits;
}

type ContactItem = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  userId?: string;
  displayName?: string | null;
};

const INVITE_MESSAGE = "I'm using Meesh to discover movies and TV shows. Join me and we can share recommendations!";
const INVITE_URL = 'https://apps.apple.com/app/flickswipe'; // Replace with your App Store / Play Store link or universal link
const PRIVACY_POLICY_URL = 'https://johnarmstrong117-vgapl.wordpress.com/privacypolicy/';
export default function ContactsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [permissionStatus, setPermissionStatus] = useState<Contacts.PermissionStatus | null>(null);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const searchBg = useThemeColor({}, 'background');
  const searchText = useThemeColor({}, 'text');

  const filteredContacts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    const digits = q.replace(/\D/g, '');
    return contacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.displayName?.toLowerCase().includes(q)) return true;
      if (c.emails.some((e) => e.includes(q))) return true;
      if (digits.length >= 4 && c.phones.some((p) => p.includes(digits))) return true;
      return false;
    });
  }, [contacts, searchQuery]);

  const requestPermission = useCallback(async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    setPermissionStatus(status);
    return status;
  }, []);

  const openPrivacyPolicy = useCallback(async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      Alert.alert('Unable to open link', 'Could not open the privacy policy URL.');
    }
  }, []);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const status = await Contacts.getPermissionsAsync();
      setPermissionStatus(status.status);
      if (status.status !== 'granted') {
        setContacts([]);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });
      const items: ContactItem[] = (data || [])
        .map((c) => ({
          id: c.id,
          name: c.name ?? 'No name',
          emails: (c.emails ?? []).map((e) => (e.email ?? '').trim().toLowerCase()).filter(Boolean),
          phones: (c.phoneNumbers ?? [])
            .map((p) => normalizePhone(p.number ?? ''))
            .filter((digits) => digits.length >= 10),
        }))
        .filter((c) => c.emails.length > 0 || c.phones.length > 0);
      setContacts(items);

      if (items.length > 0) {
        setLookupLoading(true);
        try {
          const allEmails = [...new Set(items.flatMap((c) => c.emails))];
          const allPhones = [...new Set(items.flatMap((c) => c.phones))];
          const [emailLookup, phoneLookup] = await Promise.all([
            allEmails.length > 0 ? friendHelpers.lookupByEmails(user.id, allEmails) : Promise.resolve([]),
            allPhones.length > 0 ? friendHelpers.lookupByPhones(user.id, allPhones) : Promise.resolve([]),
          ]);
          const byEmail = new Map(emailLookup.map((r) => [r.email, { user_id: r.user_id, display_name: r.display_name }]));
          const byPhone = new Map(phoneLookup.map((r) => [r.phone, { user_id: r.user_id, display_name: r.display_name }]));
          const merged = items.map((c) => {
            for (const email of c.emails) {
              const match = byEmail.get(email);
              if (match) return { ...c, userId: match.user_id, displayName: match.display_name };
            }
            for (const phone of c.phones) {
              const match = byPhone.get(phone);
              if (match) return { ...c, userId: match.user_id, displayName: match.display_name };
            }
            return c;
          });
          merged.sort((a, b) => {
            const aIsUser = a.userId ? 1 : 0;
            const bIsUser = b.userId ? 1 : 0;
            if (bIsUser !== aIsUser) return bIsUser - aIsUser;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          });
          setContacts(merged);
        } catch (e) {
          console.error('Lookup failed:', e);
        } finally {
          setLookupLoading(false);
        }
      }
    } catch (e) {
      console.error('Load contacts failed:', e);
      Alert.alert('Error', 'Could not load contacts');
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * App Store Guideline 5.1.1(iv): do not show a custom dialog with Cancel before the system
   * contacts permission — the user must proceed straight to the OS prompt from the primary action.
   * Disclosure copy lives inline on this screen instead.
   */
  const handleAllowAccessPress = useCallback(async () => {
    try {
      const status = await requestPermission();
      if (status === 'granted') {
        await loadContacts();
      }
    } catch (e) {
      console.error('Contacts permission flow failed:', e);
      Alert.alert('Error', 'Could not request contacts access');
    }
  }, [loadContacts, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      if (user) loadContacts();
    }, [user, loadContacts])
  );

  const handleAddFriend = async (contact: ContactItem) => {
    if (!user || !contact.userId) return;
    setActionLoading(contact.id);
    try {
      await friendHelpers.sendRequest(user.id, contact.userId);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleInvite = async (contact: ContactItem) => {
    try {
      await Share.share({
        message: `${INVITE_MESSAGE}\n\n${INVITE_URL}`,
        title: 'Join Meesh',
        url: INVITE_URL,
      });
    } catch (e) {
      if ((e as any)?.message !== 'User did not share') {
        Alert.alert('Error', 'Could not open share');
      }
    }
  };

  if (!user) return null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ThemedText style={styles.backButtonText}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="subtitle" style={styles.title}>
          Add from contacts
        </ThemedText>
      </View>

      {permissionStatus === null || loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.helper}>Loading…</ThemedText>
        </View>
      ) : permissionStatus !== 'granted' ? (
        <ScrollView
          style={styles.permissionScroll}
          contentContainerStyle={styles.permissionScrollContent}
          keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.helper}>
            Allow access to your contacts to find friends on Meesh or invite them to join.
          </ThemedText>
          <ThemedText style={styles.disclosureBlock}>
            Contact details (emails and phone numbers) will be sent to our server to find friends already on
            Meesh.
          </ThemedText>
          <ThemedText style={styles.disclosureBlock}>
            We use this only for friend discovery and invites, not unrelated marketing.
          </ThemedText>
          <TouchableOpacity onPress={openPrivacyPolicy}>
            <ThemedText style={styles.inlineLink}>View Privacy Policy</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryButton} onPress={handleAllowAccessPress}>
            <ThemedText style={styles.primaryButtonText}>Allow access to contacts</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          {lookupLoading && (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="small" />
              <ThemedText style={styles.helper}>Checking who's on Meesh…</ThemedText>
            </View>
          )}
          {contacts.length > 0 && (
            <View style={styles.searchWrap}>
              <TextInput
                style={[styles.searchInput, { backgroundColor: searchBg, color: searchText }]}
                placeholder="Search contacts…"
                placeholderTextColor="#888"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
          )}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {contacts.length === 0 ? (
              <ThemedText style={styles.helper}>No contacts with email or phone, or none left to add.</ThemedText>
            ) : filteredContacts.length === 0 ? (
              <ThemedText style={styles.helper}>No contacts match "{searchQuery.trim()}".</ThemedText>
            ) : (
              filteredContacts.map((contact) => (
                <View key={contact.id} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <ThemedText type="subtitle" style={styles.contactName} numberOfLines={1}>
                      {contact.name}
                    </ThemedText>
                    <ThemedText style={styles.contactEmail} numberOfLines={1}>
                      {contact.emails[0] ?? (contact.phones[0] ? formatPhoneDisplay(contact.phones[0]) : '')}
                    </ThemedText>
                  </View>
                  {contact.userId ? (
                    <TouchableOpacity
                      style={styles.addButton}
                      onPress={() => handleAddFriend(contact)}
                      disabled={actionLoading === contact.id}
                    >
                      {actionLoading === contact.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <ThemedText style={styles.addButtonText}>
                          Add friend{contact.displayName ? ` (${contact.displayName})` : ''}
                        </ThemedText>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.inviteButton} onPress={() => handleInvite(contact)}>
                      <ThemedText style={styles.inviteButtonText}>Invite to app</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#c41010',
    fontWeight: '600',
  },
  title: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionScroll: {
    flex: 1,
  },
  permissionScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  disclosureBlock: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  inlineLink: {
    marginTop: 16,
    color: '#c41010',
    fontWeight: '600',
    textDecorationLine: 'underline',
    fontSize: 15,
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  searchInput: {
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  helper: {
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.8,
  },
  primaryButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: '#c41010',
    borderRadius: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  rowInfo: {
    flex: 1,
    marginRight: 12,
  },
  contactName: {
    fontSize: 16,
  },
  contactEmail: {
    fontSize: 13,
    opacity: 0.8,
    marginTop: 2,
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#c41010',
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  inviteButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 8,
  },
  inviteButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
