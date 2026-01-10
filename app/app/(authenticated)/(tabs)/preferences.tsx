import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import {
  streamingServiceHelpers,
  genreHelpers,
  profileHelpers,
} from '@/lib/db-helpers';
import type { StreamingService, Genre } from '@/lib/db-helpers';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function PreferencesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [streamingServices, setStreamingServices] = useState<StreamingService[]>([]);
  const [userServices, setUserServices] = useState<string[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [userGenres, setUserGenres] = useState<string[]>([]);
  const [countryCode, setCountryCode] = useState<string>('');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [allServices, userServicesData, allGenres, userGenresData, profile] =
        await Promise.all([
          streamingServiceHelpers.getAll(),
          streamingServiceHelpers.getUserServices(user.id),
          genreHelpers.getAll(),
          genreHelpers.getUserGenres(user.id),
          profileHelpers.getProfile(user.id),
        ]);

      setStreamingServices(allServices || []);
      setUserServices((userServicesData || []).map(s => s.id));
      setGenres(allGenres || []);
      setUserGenres((userGenresData || []).map(g => g.id));
      setCountryCode(profile?.country_code || '');
    } catch (error: any) {
      console.error('Error loading preferences:', error);
      const errorMessage = error?.message || error?.code || 'Unknown error';
      Alert.alert('Error', `Failed to load preferences: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleService = (serviceId: string) => {
    setUserServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const toggleGenre = (genreId: string) => {
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

      const currentServiceIds = currentServices.map(s => s.id);
      const currentGenreIds = currentGenres.map(g => g.id);

      // Remove services that are no longer selected
      for (const serviceId of currentServiceIds) {
        if (!userServices.includes(serviceId)) {
          await streamingServiceHelpers.removeUserService(user.id, serviceId);
        }
      }

      // Add new services
      for (const serviceId of userServices) {
        if (!currentServiceIds.includes(serviceId)) {
          await streamingServiceHelpers.addUserService(user.id, serviceId);
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

      // Update profile country code if changed
      if (countryCode) {
        await profileHelpers.updateProfile(user.id, { country_code: countryCode });
      }

      Alert.alert('Success', 'Preferences saved!');
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Streaming Services
        </ThemedText>
        <ThemedText style={styles.sectionDescription}>
          Select the streaming services you subscribe to
        </ThemedText>
        <View style={styles.chipContainer}>
          {streamingServices.map(service => (
            <TouchableOpacity
              key={service.id}
              style={[
                styles.chip,
                userServices.includes(service.id) && styles.chipActive,
              ]}
              onPress={() => toggleService(service.id)}>
              <ThemedText
                style={[
                  styles.chipText,
                  userServices.includes(service.id) && styles.chipTextActive,
                ]}>
                {service.name}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </ThemedView>

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
              key={genre.id}
              style={[
                styles.chip,
                userGenres.includes(genre.id) && styles.chipActive,
              ]}
              onPress={() => toggleGenre(genre.id)}>
              <ThemedText
                style={[
                  styles.chipText,
                  userGenres.includes(genre.id) && styles.chipTextActive,
                ]}>
                {genre.name}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </ThemedView>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.saveButtonText}>Save Preferences</ThemedText>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
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
  },
  chipActive: {
    backgroundColor: '#0a7ea4',
    borderColor: '#0a7ea4',
  },
  chipText: {
    fontSize: 14,
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

