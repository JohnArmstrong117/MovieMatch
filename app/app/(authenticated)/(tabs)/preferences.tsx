import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import {
  streamingServiceHelpers,
  genreHelpers,
  profileHelpers,
} from '@/lib/db-helpers';
import type { TMDBProvider, TMDBGenre } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w92';

export default function PreferencesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [streamingServices, setStreamingServices] = useState<TMDBProvider[]>([]);
  const [userServices, setUserServices] = useState<number[]>([]);
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [userGenres, setUserGenres] = useState<number[]>([]);
  const [countryCode, setCountryCode] = useState<string>('');
  const [providerSearchQuery, setProviderSearchQuery] = useState<string>('');

  // Filter providers based on search query
  const filteredProviders = useMemo(() => {
    if (!providerSearchQuery.trim()) {
      return streamingServices;
    }
    const query = providerSearchQuery.toLowerCase();
    return streamingServices.filter(provider =>
      provider.provider_name.toLowerCase().includes(query)
    );
  }, [streamingServices, providerSearchQuery]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      let allServices = await streamingServiceHelpers.getAll();
      // After db reset providers table is empty; pull from TMDB via Edge Function
      if (allServices.length === 0) {
        await streamingServiceHelpers.syncFromTMDB();
        allServices = await streamingServiceHelpers.getAll();
      }

      const [userServicesData, allGenres, userGenresData, profile] = await Promise.all([
        streamingServiceHelpers.getUserServices(user.id),
        genreHelpers.getAll(),
        genreHelpers.getUserGenres(user.id),
        profileHelpers.getProfile(user.id),
      ]);

      setStreamingServices(allServices || []);
      setUserServices((userServicesData || []).map((p: TMDBProvider) => p.provider_id));
      setGenres(allGenres || []);
      setUserGenres((userGenresData || []).map((g: TMDBGenre) => g.genre_id));
      setCountryCode(profile?.country_code || '');
    } catch (error: any) {
      console.error('Error loading preferences:', error);
      const errorMessage = error?.message || error?.code || 'Unknown error';
      Alert.alert('Error', `Failed to load preferences: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleService = (providerId: number) => {
    setUserServices(prev =>
      prev.includes(providerId)
        ? prev.filter(id => id !== providerId)
        : [...prev, providerId]
    );
  };

  const toggleGenre = (genreId: number) => {
    setUserGenres(prev =>
      prev.includes(genreId)
        ? prev.filter(id => id !== genreId)
        : [...prev, genreId]
    );
  };

  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (userServices.length === 0) {
      Alert.alert('Error', 'Please select at least one streaming service');
      return;
    }

    if (userGenres.length === 0) {
      Alert.alert('Error', 'Please select at least one genre');
      return;
    }

    setSaving(true);
    try {
      // Get current user services and genres
      const currentServices = await streamingServiceHelpers.getUserServices(user.id);
      const currentGenres = await genreHelpers.getUserGenres(user.id);

      const currentProviderIds = currentServices.map(p => p.provider_id);
      const currentGenreIds = currentGenres.map(g => g.genre_id);

      // Remove services that are no longer selected
      for (const providerId of currentProviderIds) {
        if (!userServices.includes(providerId)) {
          await streamingServiceHelpers.removeUserService(user.id, providerId);
        }
      }

      // Add new services
      for (const providerId of userServices) {
        if (!currentProviderIds.includes(providerId)) {
          await streamingServiceHelpers.addUserService(user.id, providerId);
        }
      }

      // Remove genres that are no longer selected
      for (const genreId of currentGenreIds) {
        if (!userGenres.includes(genreId)) {
          await genreHelpers.removeUserGenre(user.id, genreId);
        }
      }

      // Add new genres
      for (const genreId of userGenres) {
        if (!currentGenreIds.includes(genreId)) {
          await genreHelpers.addUserGenre(user.id, genreId);
        }
      }

      // Update profile country code
      await profileHelpers.updateProfile(user.id, {
        country_code: countryCode || null,
      });

      Alert.alert('Success', 'Preferences saved! Your movie feed will refresh when you return to the swipe screen.');
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.loadingText}>Loading preferences...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.topBar}>
        <ThemedText type="subtitle" style={styles.screenTitle}>Preferences</ThemedText>
        <TouchableOpacity
          style={[styles.saveButtonSmall, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <ThemedText style={styles.saveButtonTextSmall}>Save</ThemedText>
          )}
        </TouchableOpacity>
      </ThemedView>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Favorite Genres
        </ThemedText>
        <ThemedText style={styles.sectionDescription}>
          Select your favorite genres
        </ThemedText>
        <View style={styles.chipContainer}>
          {genres.map(genre => (
            <TouchableOpacity
              key={genre.genre_id}
              style={[
                styles.chip,
                userGenres.includes(genre.genre_id) && styles.chipActive,
              ]}
              onPress={() => toggleGenre(genre.genre_id)}>
              <ThemedText
                style={[
                  styles.chipText,
                  userGenres.includes(genre.genre_id) && styles.chipTextActive,
                ]}>
                {genre.name}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Streaming Services
        </ThemedText>
        <ThemedText style={styles.sectionDescription}>
          Select the streaming services you subscribe to
        </ThemedText>
        <TextInput
          style={styles.searchInput}
          placeholder="Search providers..."
          placeholderTextColor="#999"
          value={providerSearchQuery}
          onChangeText={setProviderSearchQuery}
        />
        <View style={styles.chipContainer}>
          {filteredProviders.map(provider => {
            const isSelected = userServices.includes(provider.provider_id);
            const logoUrl = provider.logo_path 
              ? `${TMDB_IMAGE_BASE_URL}${provider.logo_path}` 
              : null;
            
            return (
              <TouchableOpacity
                key={provider.provider_id}
                style={[
                  styles.chip,
                  isSelected && styles.chipActive,
                  logoUrl && styles.chipWithLogo,
                ]}
                onPress={() => toggleService(provider.provider_id)}>
                {logoUrl && (
                  <Image 
                    source={{ uri: logoUrl }} 
                    style={styles.providerLogo}
                    resizeMode="contain"
                  />
                )}
                <ThemedText
                  style={[
                    styles.chipText,
                    isSelected && styles.chipTextActive,
                  ]}>
                  {provider.provider_name}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
        {filteredProviders.length === 0 && providerSearchQuery && (
          <ThemedText style={styles.noResultsText}>
            No providers found matching "{providerSearchQuery}"
          </ThemedText>
        )}
      </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  saveButtonSmall: {
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  saveButtonTextSmall: {
    color: '#fff',
    fontSize: 15,
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
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  sectionDescription: {
    marginBottom: 16,
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
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  noResultsText: {
    textAlign: 'center',
    marginTop: 16,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipWithLogo: {
    paddingLeft: 8,
  },
  chipActive: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  providerLogo: {
    width: 24,
    height: 24,
  },
  chipText: {
    fontSize: 14,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
});

