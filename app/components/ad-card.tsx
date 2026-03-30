import React from 'react';
import { Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,
} from 'react-native-google-mobile-ads';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const SWIPE_THRESHOLD = 100;
const SWIPE_UP_THRESHOLD = 80;

type AdCardProps = {
  nativeAd: NativeAd;
  index: number;
  total: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp?: () => void;
};

export function AdCard({ nativeAd, index, total, onSwipeLeft, onSwipeRight, onSwipeUp }: AdCardProps) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const isTopCard = index === 0;

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const panGesture = Gesture.Pan()
    .enabled(isTopCard)
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      scale.value = interpolate(
        Math.abs(translateX.value),
        [0, SCREEN_WIDTH / 2],
        [1, 0.95],
        Extrapolate.CLAMP
      );
    })
    .onEnd((event) => {
      const tx = event.translationX;
      const ty = event.translationY;
      const isSwipeUp = onSwipeUp && ty < -SWIPE_UP_THRESHOLD && Math.abs(ty) >= Math.abs(tx);

      if (isSwipeUp) {
        translateY.value = withSpring(-SCREEN_HEIGHT);
        translateX.value = withSpring(0);
        scale.value = withSpring(0.9);
        runOnJS(triggerHaptic)();
        opacity.value = withSpring(0, {}, () => runOnJS(onSwipeUp!)());
      } else if (Math.abs(tx) > SWIPE_THRESHOLD) {
        const direction = tx > 0 ? 'right' : 'left';
        translateX.value = withSpring(direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH);
        translateY.value = withSpring(0);
        runOnJS(triggerHaptic)();
        opacity.value = withSpring(0, {}, () => {
          if (direction === 'right') runOnJS(onSwipeRight)();
          else runOnJS(onSwipeLeft)();
        });
      } else {
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

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, animatedCardStyle]}>
        <ThemedView style={styles.cardContent}>
          <NativeAdView nativeAd={nativeAd} style={styles.nativeAdWrap}>
            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <ThemedText type="title" style={styles.title}>
                {nativeAd.headline || 'Sponsored'}
              </ThemedText>
            </NativeAsset>

            <NativeAsset assetType={NativeAssetType.MEDIA}>
              <View style={styles.mediaWrap}>
                <NativeMediaView style={styles.media} />
              </View>
            </NativeAsset>

            <NativeAsset assetType={NativeAssetType.BODY}>
              <ThemedText style={styles.body} numberOfLines={3}>
                {nativeAd.body || 'Tap to learn more from this advertiser.'}
              </ThemedText>
            </NativeAsset>

            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <TouchableOpacity style={styles.ctaButton} activeOpacity={0.85}>
                <ThemedText style={styles.ctaText}>
                  {nativeAd.callToAction || 'Learn more'}
                </ThemedText>
              </TouchableOpacity>
            </NativeAsset>

            <ThemedText style={styles.sponsoredText}>Sponsored</ThemedText>
          </NativeAdView>
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
  nativeAdWrap: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-start',
  },
  title: {
    marginBottom: 10,
    fontSize: 24,
  },
  mediaWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginBottom: 12,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  body: {
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 12,
  },
  ctaButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#c41010',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '600',
  },
  sponsoredText: {
    marginTop: 10,
    fontSize: 12,
    opacity: 0.7,
  },
});
