import React from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import type { MockTitle } from '@/lib/mock-tmdb';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const SWIPE_THRESHOLD = 100;

interface SwipeCardProps {
  title: MockTitle;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  index: number;
  total: number;
}

export function SwipeCard({ title, onSwipeLeft, onSwipeRight, index, total }: SwipeCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Track if this is the first render to force reset
  const renderCountRef = React.useRef(0);
  renderCountRef.current += 1;

  // Reset animated values when title changes to prevent stale state
  React.useEffect(() => {
    console.log(`[SwipeCard] Card mounted/updated - Title: ${title.title} (${title.type}-${title.id}), index: ${index}, total: ${total}, renderCount: ${renderCountRef.current}`);
    // Force reset all animation values - this ensures no stale state
    translateX.value = 0;
    translateY.value = 0;
    scale.value = 1;
    opacity.value = 1;
  }, [title.id, title.type, title.title, index, total, translateX, translateY, scale, opacity]);
  

  const isTopCard = index === total - 1;

  const panGesture = Gesture.Pan()
    .enabled(isTopCard)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;

      // Add rotation based on swipe
      const rotation = interpolate(
        translateX.value,
        [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
        [-15, 0, 15],
        Extrapolate.CLAMP
      );
      scale.value = interpolate(
        Math.abs(translateX.value),
        [0, SCREEN_WIDTH / 2],
        [1, 0.95],
        Extrapolate.CLAMP
      );
    })
    .onEnd((event) => {
      const swipeDistance = event.translationX;

      if (Math.abs(swipeDistance) > SWIPE_THRESHOLD) {
        // Swipe detected
        const direction = swipeDistance > 0 ? 'right' : 'left';
        translateX.value = withSpring(direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
        opacity.value = withSpring(0, {}, () => {
          if (direction === 'right') {
            runOnJS(onSwipeRight)();
          } else {
            runOnJS(onSwipeLeft)();
          }
        });

        // Haptic feedback
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        // Return to center
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
      [-15, 0, 15],
      Extrapolate.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation}deg` },
        { scale: scale.value },
      ],
      opacity: opacity.value,
      zIndex: total - index,
    };
  });

  const leftOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [-SCREEN_WIDTH / 2, -SWIPE_THRESHOLD, 0],
      [1, 0.5, 0],
      Extrapolate.CLAMP
    );
    return { opacity };
  });

  const rightOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD, SCREEN_WIDTH / 2],
      [0, 0.5, 1],
      Extrapolate.CLAMP
    );
    return { opacity };
  });

  const posterUrl = title.poster_path
    ? `https://image.tmdb.org/t/p/w500${title.poster_path}`
    : null;

  // Log on every render to see what's actually being rendered
  console.log(`[SwipeCard] Rendering with title: "${title.title}" (${title.type}-${title.id}), index: ${index}, posterUrl: ${posterUrl}`);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, animatedCardStyle]}>
        {/* Card content */}
        <ThemedView style={styles.cardContent}>
          {posterUrl ? (
            <Image
              key={`poster-${title.id}-${title.type}`}
              source={{ uri: posterUrl }}
              style={styles.poster}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.poster, styles.posterPlaceholder]}>
              <ThemedText>No Image</ThemedText>
            </View>
          )}

          {/* Gradient overlay for text readability */}
          <View style={styles.gradientOverlay}>
            <View style={styles.gradientTop} />
            <View style={styles.gradientBottom} />
          </View>

          {/* Content overlay */}
          <View style={styles.contentOverlay}>
            {/* Debug: Show actual title being rendered */}
            <ThemedText type="title" style={styles.title} key={`title-text-${title.id}-${title.type}`}>
              {title.title}
              {/* Debug indicator - remove after fixing */}
              {__DEV__ && <ThemedText style={{ fontSize: 10, opacity: 0.5 }}> (ID: {title.id}, idx: {index})</ThemedText>}
            </ThemedText>
            <ThemedText style={styles.overview} numberOfLines={3}>
              {title.overview}
            </ThemedText>
            <View style={styles.metaRow}>
              <ThemedText style={styles.meta}>
                {title.type === 'movie' ? '🎬 Movie' : '📺 TV Series'}
              </ThemedText>
              <ThemedText style={styles.meta}>⭐ {title.vote_average.toFixed(1)}</ThemedText>
            </View>
          </View>

          {/* Swipe overlays */}
          <Animated.View style={[styles.swipeOverlay, styles.passOverlay, leftOverlayStyle]}>
            <ThemedText type="title" style={styles.swipeLabel}>
              PASS
            </ThemedText>
          </Animated.View>

          <Animated.View style={[styles.swipeOverlay, styles.likeOverlay, rightOverlayStyle]}>
            <ThemedText type="title" style={styles.swipeLabel}>
              LIKE
            </ThemedText>
          </Animated.View>
        </ThemedView>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignSelf: 'center',
  },
  cardContent: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  poster: {
    width: '100%',
    height: '100%',
    backgroundColor: '#333',
  },
  posterPlaceholder: {
    backgroundColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    overflow: 'hidden',
  },
  gradientTop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  gradientBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 30,
  },
  title: {
    color: '#fff',
    marginBottom: 8,
    fontSize: 24,
    fontWeight: 'bold',
  },
  overview: {
    color: '#fff',
    marginBottom: 12,
    fontSize: 14,
    opacity: 0.9,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.8,
  },
  swipeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 4,
  },
  passOverlay: {
    borderColor: '#ff4444',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  likeOverlay: {
    borderColor: '#44ff44',
    backgroundColor: 'rgba(68, 255, 68, 0.1)',
  },
  swipeLabel: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});

