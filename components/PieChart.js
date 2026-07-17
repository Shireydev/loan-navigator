import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS } from '../theme';

// Animated LABELED pie chart (full pie, no hole) built from many thin radial
// "tick" segments so it works without any SVG dependency. Each colored wedge
// gets a label + percentage callout positioned around the pie.

const SIZE = 220;
const RADIUS = SIZE / 2;
const TICKS = 180; // resolution of the pie
const TICK_W = 5;

export default function PieChart({ segments }) {
  const progress = useRef(new Animated.Value(0)).current;

  const active = segments.filter((s) => s.value > 0);
  const total = active.reduce((s, seg) => s + seg.value, 0) || 1;

  const sig = segments.map((s) => Math.round(s.value)).join('|');

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sig]);

  // Precompute a color for each tick index based on cumulative segment share.
  const tickColors = [];
  let acc = 0;
  let segIdx = 0;
  let segEndTick = active.length ? Math.round((active[0].value / total) * TICKS) : 0;
  for (let i = 0; i < TICKS; i++) {
    while (segIdx < active.length - 1 && i >= segEndTick) {
      segIdx++;
      acc += active[segIdx - 1].value;
      segEndTick = Math.round(((acc + active[segIdx].value) / total) * TICKS);
    }
    tickColors.push(active.length ? active[segIdx].color : COLORS.border);
  }

  // Build label callouts positioned at the mid-angle of each wedge.
  let runningStart = 0;
  const labels = active.map((seg) => {
    const frac = seg.value / total;
    const midFrac = runningStart + frac / 2;
    runningStart += frac;
    // Angle measured from top (12 o'clock), clockwise.
    const angleDeg = midFrac * 360;
    const angleRad = (angleDeg - 90) * (Math.PI / 180);
    const labelR = RADIUS * 0.62;
    const cx = RADIUS + Math.cos(angleRad) * labelR;
    const cy = RADIUS + Math.sin(angleRad) * labelR;
    return {
      ...seg,
      pct: Math.round(frac * 100),
      cx,
      cy,
    };
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.pie}>
        {tickColors.map((color, i) => {
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
                  transform: [
                    { rotate: `${angle}deg` },
                    { translateY: -RADIUS / 2 },
                  ],
                },
              ]}
            >
              <View style={[styles.tick, { backgroundColor: color }]} />
            </Animated.View>
          );
        })}

        {/* Labels layer */}
        {labels.map((l, i) => (
          <Animated.View
            key={`lbl-${i}`}
            style={[
              styles.labelBubble,
              {
                left: l.cx - 30,
                top: l.cy - 16,
                opacity: progress,
              },
            ]}
          >
            <Text style={styles.labelPct}>{l.pct}%</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  pie: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tickWrap: {
    position: 'absolute',
    width: TICK_W,
    height: RADIUS,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  tick: {
    width: TICK_W,
    height: RADIUS,
  },
  labelBubble: {
    position: 'absolute',
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelPct: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
