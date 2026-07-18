import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet } from 'react-native';

import { COLORS } from '../theme';

const DISPLAY_DURATION_MS = 1400;
const FADE_DURATION_MS = 350;

export default function StartupSplash({ onFinish }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onFinish();
      });
    }, DISPLAY_DURATION_MS);

    return () => {
      clearTimeout(timer);
      opacity.stopAnimation();
    };
  }, [onFinish, opacity]);

  return (
    <Animated.View style={[styles.container, { opacity }]} accessibilityLabel="Loan Navigator">
      <Image source={require('../assets/splash.png')} style={styles.image} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: COLORS.background,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
