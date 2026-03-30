import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';

export type MediaType = 'movie' | 'tv';

type MediaTypeToggleProps = {
  value: MediaType;
  onChange: (value: MediaType) => void;
};

export function MediaTypeToggle({ value, onChange }: MediaTypeToggleProps) {
  const activeBg = useThemeColor({ light: '#c41010', dark: '#d65050' }, 'background');
  const activeText = '#fff';
  const inactiveText = useThemeColor({}, 'text');

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.segment, value === 'movie' && { backgroundColor: activeBg }]}
        onPress={() => onChange('movie')}
      >
        <ThemedText
          style={[
            styles.segmentText,
            { color: value === 'movie' ? activeText : inactiveText },
          ]}
        >
          Movies
        </ThemedText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.segment, value === 'tv' && { backgroundColor: activeBg }]}
        onPress={() => onChange('tv')}
      >
        <ThemedText
          style={[
            styles.segmentText,
            { color: value === 'tv' ? activeText : inactiveText },
          ]}
        >
          TV
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  segment: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
