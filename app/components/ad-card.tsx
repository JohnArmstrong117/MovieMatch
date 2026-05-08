import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
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
import { getSwipeCardLayout } from '@/lib/swipe-card-layout';
import { adsDiagLog } from '@/lib/ads-diagnostics';

type AdCardProps = {
  nativeAd: NativeAd;
  index: number;
  total: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp?: () => void;
};

export function AdCard({ nativeAd, index, total, onSwipeLeft, onSwipeRight, onSwipeUp }: AdCardProps) {
  useEffect(() => {
    adsDiagLog('ad_card_mount', {
      isTop: index === 0,
      headlineLen: nativeAd.headline?.length ?? 0,
      hasMedia: !!nativeAd.mediaContent,
      responseId: nativeAd.responseId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- log once per responseId + stack slot
  }, [index, nativeAd.responseId]);

  const { width: winW, height: winH } = useWindowDimensions();
  const { cardWidth, cardHeight, screenWidth, screenHeight, swipeThreshold, swipeUpThreshold } =
    getSwipeCardLayout(winW, winH);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const isTopCard = index === 0;

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const primaryImageUrl = nativeAd.images?.[0]?.url ?? null;
  const iconUrl = nativeAd.icon?.url ?? null;

  const panGesture = Gesture.Pan()
    .enabled(isTopCard)
    // Let simple taps reach NativeAd assets (for click-through) and only capture true drags.
    .activeOffsetX([-16, 16])
    .activeOffsetY([-16, 16])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
      scale.value = interpolate(
        Math.abs(translateX.value),
        [0, screenWidth / 2],
        [1, 0.95],
        Extrapolate.CLAMP
      );
    })
    .onEnd((event) => {
      const tx = event.translationX;
      const ty = event.translationY;
      const isSwipeUp = onSwipeUp && ty < -swipeUpThreshold && Math.abs(ty) >= Math.abs(tx);

      if (isSwipeUp) {
        runOnJS(triggerHaptic)();
        runOnJS(onSwipeUp!)();
        translateY.value = withSpring(-screenHeight);
        translateX.value = withSpring(0);
        scale.value = withSpring(0.9);
        opacity.value = withSpring(0);
      } else if (Math.abs(tx) > swipeThreshold) {
        const direction = tx > 0 ? 'right' : 'left';
        runOnJS(triggerHaptic)();
        if (direction === 'right') runOnJS(onSwipeRight)();
        else runOnJS(onSwipeLeft)();
        translateX.value = withSpring(direction === 'right' ? screenWidth : -screenWidth);
        translateY.value = withSpring(0);
        opacity.value = withSpring(0);
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
      }
    });

  // Let native ad assets (CTA/media/headline) receive taps while pan handles true drags.
  const nativeGesture = Gesture.Native();
  const composedGesture = Gesture.Race(panGesture, nativeGesture);

  const animatedCardStyle = useAnimatedStyle(() => {
    const rotation = interpolate(
      translateX.value,
      [-screenWidth / 2, 0, screenWidth / 2],
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
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.card, { width: cardWidth, height: cardHeight }, animatedCardStyle]}>
        <ThemedView style={styles.cardContent}>
          <NativeAdView nativeAd={nativeAd} style={styles.nativeAdWrap}>
            {(nativeAd.advertiser ?? nativeAd.store) ? (
              <View style={styles.advertiserRow}>
                {nativeAd.advertiser ? (
                  <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                    <ThemedText style={styles.advertiserText} numberOfLines={1}>
                      {nativeAd.advertiser}
                    </ThemedText>
                  </NativeAsset>
                ) : null}
                {nativeAd.advertiser && nativeAd.store ? (
                  <ThemedText style={styles.advertiserSeparator}> · </ThemedText>
                ) : null}
                {nativeAd.store ? (
                  <NativeAsset assetType={NativeAssetType.STORE}>
                    <ThemedText style={styles.advertiserText} numberOfLines={1}>
                      {nativeAd.store}
                    </ThemedText>
                  </NativeAsset>
                ) : null}
              </View>
            ) : null}

            <NativeAsset assetType={NativeAssetType.HEADLINE}>
              <ThemedText type="title" style={styles.title}>
                {nativeAd.headline || 'Sponsored'}
              </ThemedText>
            </NativeAsset>

            <View style={styles.mediaWrap}>
              {nativeAd.mediaContent ? (
                <NativeMediaView style={styles.media} resizeMode="cover" />
              ) : primaryImageUrl ? (
                <NativeAsset assetType={NativeAssetType.IMAGE}>
                  <Image source={{ uri: primaryImageUrl }} style={styles.media} contentFit="cover" />
                </NativeAsset>
              ) : iconUrl ? (
                <NativeAsset assetType={NativeAssetType.ICON}>
                  <Image source={{ uri: iconUrl }} style={styles.media} contentFit="cover" />
                </NativeAsset>
              ) : (
                <View style={styles.mediaPlaceholder}>
                  <ThemedText style={styles.mediaPlaceholderText}>Sponsored</ThemedText>
                </View>
              )}
            </View>

            <NativeAsset assetType={NativeAssetType.BODY}>
              <ThemedText style={styles.body} numberOfLines={3}>
                {nativeAd.body || 'Tap to learn more from this advertiser.'}
              </ThemedText>
            </NativeAsset>

            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <View style={styles.ctaButton}>
                <ThemedText style={styles.ctaText}>
                  {nativeAd.callToAction || 'Learn more'}
                </ThemedText>
              </View>
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
    alignSelf: 'center',
  },
  cardContent: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#f2f2f2',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  nativeAdWrap: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-start',
  },
  advertiserRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 6,
  },
  advertiserText: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.65,
    flexShrink: 1,
  },
  advertiserSeparator: {
    fontSize: 13,
    opacity: 0.5,
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
  mediaPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  mediaPlaceholderText: {
    fontSize: 13,
    opacity: 0.6,
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
