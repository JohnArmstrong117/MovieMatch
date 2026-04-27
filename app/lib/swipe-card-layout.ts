/** Max width on large phones/tablets so cards stay readable and not overly wide. */
const MAX_CARD_WIDTH = 560;

/**
 * Responsive swipe card size: capped width on tablets, height limited by window so the deck
 * fits above the tab bar and action row in portrait and landscape.
 */
export function getSwipeCardLayout(windowWidth: number, windowHeight: number) {
  const horizontalPad = Math.min(28, Math.max(16, windowWidth * 0.035));
  const availableW = Math.max(windowWidth - horizontalPad * 2, 260);
  const cardWidth = Math.min(availableW, MAX_CARD_WIDTH);
  const idealPosterHeight = cardWidth * 1.48;
  const maxHeightRatio = windowHeight > windowWidth ? 0.56 : 0.62;
  const maxHeight = Math.max(windowHeight * maxHeightRatio, 280);
  const cardHeight = Math.min(idealPosterHeight, maxHeight);

  const swipeThreshold = Math.min(110, Math.max(72, cardWidth * 0.22));
  const swipeUpThreshold = Math.min(96, Math.max(64, cardHeight * 0.12));

  return {
    cardWidth,
    cardHeight,
    screenWidth: windowWidth,
    screenHeight: windowHeight,
    swipeThreshold,
    swipeUpThreshold,
  };
}
