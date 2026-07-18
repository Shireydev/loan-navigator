import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';

export default function GradientHeader({
  title,
  subtitle,
  icon,
  eyebrow,
  variant = 'default',
  onIconPress,
  iconAccessibilityLabel = 'Home',
}) {
  const insets = useSafeAreaInsets();
  const financial = variant === 'financial';

  return (
    <LinearGradient
      colors={financial ? ['#07162F', '#0A2D61'] : [COLORS.gradientA, COLORS.gradientB]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.wrap, financial && styles.financialWrap, { paddingTop: insets.top + 16 }]}
    >
      {financial ? (
        <>
          <View style={styles.financialGlow} />
          <View style={styles.financialRule} />
        </>
      ) : null}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <View style={styles.eyebrowRow}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>{eyebrow}</Text>
            </View>
          ) : null}
          <Text style={[styles.title, financial && styles.financialTitle]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, financial && styles.financialSubtitle]}>{subtitle}</Text>
          ) : null}
        </View>
        {icon ? (
          onIconPress ? (
            <Pressable
              onPress={onIconPress}
              accessibilityRole="button"
              accessibilityLabel={iconAccessibilityLabel}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconWrap,
                financial && styles.financialIconWrap,
                pressed && styles.iconPressed,
              ]}
            >
              <Ionicons
                name={icon}
                size={financial ? 22 : 26}
                color={financial ? '#8CC5FF' : '#fff'}
              />
            </Pressable>
          ) : (
            <View style={[styles.iconWrap, financial && styles.financialIconWrap]}>
              <Ionicons
                name={icon}
                size={financial ? 22 : 26}
                color={financial ? '#8CC5FF' : '#fff'}
              />
            </View>
          )
        ) : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  financialWrap: {
    paddingBottom: 20,
    overflow: 'hidden',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(121,184,255,0.24)',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4, fontWeight: '500' },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  financialIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: 'rgba(91,169,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.28)',
  },
  iconPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#62D5B3',
    marginRight: 7,
  },
  eyebrow: {
    color: '#9EC9F5',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  financialTitle: { fontSize: 25, letterSpacing: -0.4 },
  financialSubtitle: { color: 'rgba(222,237,255,0.76)', fontSize: 13 },
  financialGlow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    right: -72,
    top: -55,
    backgroundColor: 'rgba(45,132,230,0.13)',
  },
  financialRule: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(76,158,247,0.42)',
  },
});
