import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      hitSlop={props.hitSlop ?? { top: 6, bottom: 6, left: 2, right: 2 }}
      onPressIn={(ev) => {
        if (Platform.OS === 'ios') {
          try {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch {
            // Haptics can fail on some environments; must not block navigation.
          }
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
