import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const STORAGE_KEY = 'meesh_first_login_tutorial_seen';

const H_PADDING = 24;

type Slide = {
  key: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    key: 'preferences',
    title: 'Start with Preferences',
    body:
      'The first thing to do is open the Preferences tab and choose your favorite genres and the streaming services you use. That powers what you see in your swipe feed, and tapping any card opens more details.',
  },
  {
    key: 'swipe',
    title: 'Swipe',
    body:
      'On the Swipe screen, swipe left to pass, right to add a title to your matches, and swipe up to mark something as watched. You can also use the buttons below the cards.',
  },
  {
    key: 'matches',
    title: 'Matches',
    body:
      'Your Matches tab is where liked titles live. Filter by genre or watched status, sort by match order, TMDB ratings, or your own star ratings, and recommend titles to friends from the detail view.',
  },
  {
    key: 'friends',
    title: 'Friends',
    body:
      'Use the Friends tab to add friends, accept requests, and open shared matches to see titles you both liked. You can recommend movies and shows from your matches or from detail screens.',
  },
];

type FirstLoginTutorialProps = {
  /** When true, component checks storage and may show tutorial */
  enabled: boolean;
};

export function FirstLoginTutorial({ enabled }: FirstLoginTutorialProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const slideWidth = windowWidth - H_PADDING * 2;
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && seen !== '1') {
          setVisible(true);
        }
      } catch {
        if (!cancelled) setVisible(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const dismiss = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // still hide UI
    }
    setVisible(false);
  }, []);

  const onSkip = useCallback(() => {
    dismiss();
  }, [dismiss]);

  const onNext = useCallback(() => {
    if (index < SLIDES.length - 1) {
      const next = index + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setIndex(next);
    } else {
      dismiss();
    }
  }, [index, dismiss]);

  const onBack = useCallback(() => {
    if (index <= 0) return;
    const prev = index - 1;
    listRef.current?.scrollToIndex({ index: prev, animated: true });
    setIndex(prev);
  }, [index]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  if (!visible) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onSkip}>
      <View
        style={[
          styles.backdrop,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: H_PADDING },
        ]}>
        <ThemedView style={styles.card}>
          <FlatList
            ref={listRef}
            style={{ width: slideWidth }}
            data={SLIDES}
            keyExtractor={(item) => item.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const x = e.nativeEvent.contentOffset.x;
              const i = Math.round(x / slideWidth);
              setIndex(Math.min(Math.max(i, 0), SLIDES.length - 1));
            }}
            getItemLayout={(_, i) => ({
              length: slideWidth,
              offset: slideWidth * i,
              index: i,
            })}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: slideWidth }]}>
                <ThemedText type="title" style={styles.slideTitle}>
                  {item.title}
                </ThemedText>
                <ThemedText style={styles.slideBody}>{item.body}</ThemedText>
              </View>
            )}
          />

          <View style={styles.dots}>
            {SLIDES.map((slide, i) => (
              <View key={slide.key} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipButton} onPress={onSkip} hitSlop={12}>
              <ThemedText style={styles.skipText}>Skip</ThemedText>
            </TouchableOpacity>
            <View style={styles.rightActions}>
              {index > 0 && (
                <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.85}>
                  <ThemedText style={styles.backText}>Back</ThemedText>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.nextButton} onPress={onNext} activeOpacity={0.85}>
                <ThemedText style={styles.nextText}>
                  {index === SLIDES.length - 1 ? 'Get started' : 'Next'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  card: {
    borderRadius: 16,
    paddingVertical: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  slide: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    minHeight: 220,
  },
  slideTitle: {
    marginBottom: 12,
    textAlign: 'center',
  },
  slideBody: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(128,128,128,0.45)',
  },
  dotActive: {
    backgroundColor: '#c41010',
    width: 22,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  skipText: {
    fontSize: 16,
    opacity: 0.75,
  },
  backButton: {
    borderWidth: 1,
    borderColor: '#c41010',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  backText: {
    color: '#c41010',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#c41010',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  nextText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
