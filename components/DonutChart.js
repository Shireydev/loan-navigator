import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS } from '../theme';

// Animated donut chart built from many thin radial "tick" segments so it
// works without any SVG dependency. The ring sweeps in on mount / whenever
// the data changes. Each tick is colored according to which segment it falls
// in, producing clean colored arcs. A small white gap is inserted between
// adjacent segments (matching the reference image).

const SIZE = 230;
const THICKNESS = 34;
const RADIUS = SIZE / 2;
const TICKS = 160; // resolution of the ring
const TICK_W = 5;
const TICK_H = THICKNESS;

export default function DonutChart({ segments, centerValue, centerLabel, animateChanges = true }) {
  const progress = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  const active = segments.filter((s) => s.value > 0);
  const total = active.reduce((s, seg) => s + seg.value, 0) || 1;

  const sig = segments.map((s) => Math.round(s.value)).join('|');

  useEffect(() => {
    progress.stopAnimation();

    // Interactive charts can update many times during a drag. Keep the
    // entrance animation, but update subsequent values immediately when
    // animateChanges is disabled so animations do not pile up on the bridge.
    if (hasAnimated.current && !animateChanges) {
      progress.setValue(1);
      return undefined;
    }

    hasAnimated.current = true;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();

    return () => animation.stop();
  }, [sig, animateChanges, progress]);

  // Precompute segment boundaries (in tick space) so we can insert a gap of a
  // couple ticks between each colored arc.
  const GAP_TICKS = 2;
  const bounds = [];
  let acc = 0;
  active.forEach((seg) => {
    const start = Math.round((acc / total) * TICKS);
    acc += seg.value;
    const end = Math.round((acc / total) * TICKS);
    bounds.push({ start, end, color: seg.color });
  });

  const tickColors = new Array(TICKS).fill(null);
  bounds.forEach((b, bi) => {
    const gapEnd = bi < bounds.length - 1 || active.length > 1 ? GAP_TICKS : 0;
    for (let i = b.start; i < b.end; i++) {
      // Leave a gap at the trailing edge of each segment.
      if (i >= b.end - gapEnd) continue;
      tickColors[i] = b.color;
    }
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.donut}>
        {tickColors.map((color, i) => {
          if (!color) return null;
          const angle = (i / TICKS) * 360;
          const threshold = i / TICKS;
          const opacity = progress.interpolate({
            inputRange: [threshold, Math.min(threshold + 0.02, 1)],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={i}
              style={[
                styles.tickWrap,
                {
                  opacity,
                  transform: [{ rotate: `${angle}deg` }, { translateY: -(RADIUS - THICKNESS / 2) }],
                },
              ]}
            >
              <View style={[styles.tick, { backgroundColor: color }]} />
            </Animated.View>
          );
        })}

        <View style={styles.hole}>
          <Text style={styles.centerValue}>{centerValue}</Text>
          {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  donut: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickWrap: {
    position: 'absolute',
    width: TICK_W,
    height: TICK_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    width: TICK_W,
    height: TICK_H,
  },
  hole: {
    width: SIZE - THICKNESS * 2 - 10,
    height: SIZE - THICKNESS * 2 - 10,
    borderRadius: (SIZE - THICKNESS * 2 - 10) / 2,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: { color: COLORS.textPrimary, fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  centerLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 2,
  },
});
