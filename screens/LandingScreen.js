import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { COLORS } from '../theme';

const HOME_TOOLS = [
  {
    key: 'estimate',
    title: 'Mortgage\nEstimate',
    description: 'Estimate payments',
    icon: 'home-outline',
    color: '#57A3FF',
    target: { tab: 'Estimate', screen: 'EstimatorHome' },
  },
  {
    key: 'payoff',
    title: 'Pay Off\nFaster',
    description: 'Build a payoff plan',
    icon: 'trending-down-outline',
    color: '#39D7B0',
    target: { tab: 'Payoff' },
  },
  {
    key: 'refi',
    title: 'Refinance\nAnalysis',
    description: 'Compare your savings',
    icon: 'swap-horizontal-outline',
    color: '#A78BFA',
    target: { tab: 'Refinance' },
  },
];

const AUTO_TOOLS = [
  {
    key: 'buy',
    title: 'Auto Loan\nEstimate',
    description: 'Plan your purchase',
    icon: 'car-outline',
    color: '#32D6C5',
    target: { tab: 'Auto', mode: 'purchase' },
  },
  {
    key: 'auto_payoff',
    title: 'Pay Off\nFaster',
    description: 'Accelerate payoff',
    icon: 'speedometer-outline',
    color: '#F5C451',
    target: { tab: 'Auto', mode: 'payoff' },
  },
  {
    key: 'auto_refi',
    title: 'Refinance\nAnalysis',
    description: 'Review your options',
    icon: 'repeat-outline',
    color: '#E879B7',
    target: { tab: 'Auto', mode: 'refinance' },
  },
];

function ToolCard({ tool, onPress }) {
  return (
    <TouchableOpacity style={styles.tool} activeOpacity={0.78} onPress={onPress}>
      <LinearGradient
        colors={[tool.color + '1F', tool.color + '08']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.toolIcon,
          {
            borderColor: tool.color + '38',
          },
        ]}
      >
        <Ionicons name={tool.icon} size={25} color={tool.color} />
      </LinearGradient>

      <Text style={styles.toolTitle}>{tool.title}</Text>

      <Text style={styles.toolDescription} numberOfLines={1}>
        {tool.description}
      </Text>

      <View style={styles.toolFooter}>
        <Text style={[styles.openText, { color: tool.color }]}>Open</Text>

        <Ionicons name="arrow-forward" size={13} color={tool.color} />
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({ icon, title, color }) {
  return (
    <View style={styles.sectionHead}>
      <View
        style={[
          styles.sectionIcon,
          {
            backgroundColor: color + '18',
            borderColor: color + '30',
          },
        ]}
      >
        <Ionicons name={icon} size={15} color={color} />
      </View>

      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.sectionLine} />
    </View>
  );
}

export default function LandingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const go = (tool) => {
    Haptics.selectionAsync();

    const target = tool.target;

    if (target.screen) {
      navigation.navigate(target.tab, {
        screen: target.screen,
      });
    } else if (target.mode) {
      navigation.navigate(target.tab, {
        landingMode: target.mode,
        ts: Date.now(),
      });
    } else {
      navigation.navigate(target.tab);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 12,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------- HERO ---------------- */}

        <View style={styles.heroOuter}>
          <LinearGradient
            colors={['#07162F', '#0A2D61', '#0A58AE']}
            locations={[0, 0.58, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            {/* Decorative background elements */}

            <View style={styles.heroGlowTop} />
            <View style={styles.heroGlowBottom} />

            <View style={styles.compassRingOuter} />
            <View style={styles.compassRingInner} />

            <Ionicons
              name="navigate"
              size={18}
              color="rgba(255,255,255,0.14)"
              style={styles.compassTop}
            />

            <Ionicons
              name="navigate"
              size={14}
              color="rgba(255,255,255,0.10)"
              style={styles.compassRight}
            />

            <Image
              source={require('../assets/icon.png')}
              style={styles.heroLogo}
              resizeMode="contain"
            />

            <View style={styles.heroContent}>
              <View style={styles.heroBrandRow}>
                <View style={styles.heroBrandIcon}>
                  <Ionicons name="navigate-outline" size={13} color="#8CC5FF" />
                </View>

                <Text style={styles.heroEyebrow}>LOAN NAVIGATOR</Text>
              </View>

              <Text style={styles.heroTitle}>
                Your Goals.{'\n'}
                <Text style={styles.heroTitleAccent}>Our Calculators.</Text>
              </Text>

              <Text style={styles.heroSub}>Powerful tools to help you finance what matters.</Text>

              <View style={styles.heroFeatures}>
                <View style={styles.heroFeature}>
                  <Ionicons name="checkmark-circle" size={15} color="#7FC2FF" />
                  <Text style={styles.heroFeatureText}>Mortgage</Text>
                </View>

                <View style={styles.heroFeatureDivider} />

                <View style={styles.heroFeature}>
                  <Ionicons name="checkmark-circle" size={15} color="#7FC2FF" />
                  <Text style={styles.heroFeatureText}>Auto</Text>
                </View>

                <View style={styles.heroFeatureDivider} />

                <View style={styles.heroFeature}>
                  <Ionicons name="checkmark-circle" size={15} color="#7FC2FF" />
                  <Text style={styles.heroFeatureText}>Refinance</Text>
                </View>
              </View>
            </View>

            <LinearGradient
              colors={['rgba(68,169,255,0)', 'rgba(68,169,255,0.95)', 'rgba(68,169,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroAccent}
            />
          </LinearGradient>
        </View>

        {/* ---------------- HOME LOANS ---------------- */}

        <View style={styles.section}>
          <SectionHeader icon="home-outline" title="HOME LOANS" color="#57A3FF" />

          <View style={styles.grid}>
            {HOME_TOOLS.map((tool) => (
              <ToolCard key={tool.key} tool={tool} onPress={() => go(tool)} />
            ))}
          </View>
        </View>

        {/* ---------------- AUTO LOANS ---------------- */}

        <View style={styles.section}>
          <SectionHeader icon="car-outline" title="AUTO LOANS" color="#32D6C5" />

          <View style={styles.grid}>
            {AUTO_TOOLS.map((tool) => (
              <ToolCard key={tool.key} tool={tool} onPress={() => go(tool)} />
            ))}
          </View>
        </View>

        {/* ---------------- TRUST MESSAGE ---------------- */}

        <View style={styles.trustCard}>
          <LinearGradient
            colors={['rgba(48,126,229,0.12)', 'rgba(17,43,82,0.18)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.trustGradient}
          >
            <View style={styles.trustIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#6FB5FF" />
            </View>

            <View style={styles.trustContent}>
              <Text style={styles.trustTitle}>Plan with confidence</Text>

              <Text style={styles.trustText}>
                Smart estimates designed to help you make informed financial decisions.
              </Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLine} />

          <Text style={styles.footerText}>Smart decisions today. More freedom tomorrow.</Text>

          <View style={styles.footerLine} />
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const CARD_GAP = 10;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scroll: {
    paddingBottom: 20,
  },

  /* ---------------- HERO ---------------- */

  heroOuter: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 28,
    backgroundColor: '#0B2347',
    shadowColor: '#1685FF',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.2,
    shadowRadius: 22,
    elevation: 8,
  },

  hero: {
    minHeight: 242,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(129,190,255,0.25)',
  },

  heroContent: {
    zIndex: 4,
    maxWidth: '76%',
  },

  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 17,
  },

  heroBrandIcon: {
    width: 25,
    height: 25,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(91,169,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.25)',
    marginRight: 8,
  },

  heroEyebrow: {
    color: '#A8D1FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
  },

  heroTitle: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.9,
    lineHeight: 35,
  },

  heroTitleAccent: {
    color: '#8BC5FF',
  },

  heroSub: {
    color: 'rgba(233,243,255,0.82)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    marginTop: 12,
    maxWidth: 255,
  },

  heroFeatures: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 19,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(4,18,42,0.30)',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(132,195,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  heroFeature: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroFeatureText: {
    color: 'rgba(237,246,255,0.9)',
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },

  heroFeatureDivider: {
    height: 13,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 8,
  },

  heroLogo: {
    position: 'absolute',
    right: -18,
    top: 31,
    width: 148,
    height: 148,
    opacity: 0.23,
    borderRadius: 34,
    zIndex: 2,
  },

  compassRingOuter: {
    position: 'absolute',
    width: 205,
    height: 205,
    borderRadius: 103,
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.10)',
    right: -38,
    top: -31,
  },

  compassRingInner: {
    position: 'absolute',
    width: 147,
    height: 147,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.08)',
    right: -9,
    top: -2,
  },

  compassTop: {
    position: 'absolute',
    right: 69,
    top: 8,
    transform: [{ rotate: '-4deg' }],
  },

  compassRight: {
    position: 'absolute',
    right: 5,
    top: 80,
    transform: [{ rotate: '90deg' }],
  },

  heroGlowTop: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(39,145,255,0.15)',
    right: -60,
    top: -80,
  },

  heroGlowBottom: {
    position: 'absolute',
    width: 260,
    height: 95,
    borderRadius: 130,
    backgroundColor: 'rgba(0,120,255,0.12)',
    left: 25,
    bottom: -65,
  },

  heroAccent: {
    position: 'absolute',
    left: 30,
    right: 30,
    bottom: 0,
    height: 2,
    borderRadius: 2,
  },

  /* ---------------- SECTIONS ---------------- */

  section: {
    paddingHorizontal: 18,
    marginTop: 27,
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },

  sectionIcon: {
    width: 29,
    height: 29,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: 9,
  },

  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.35,
  },

  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 12,
    opacity: 0.7,
  },

  /* ---------------- TOOL CARDS ---------------- */

  grid: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },

  tool: {
    flex: 1,
    minHeight: 176,
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingTop: 17,
    paddingBottom: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(123,153,196,0.20)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },

  toolIcon: {
    width: 49,
    height: 49,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 12,
  },

  toolTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 17,
    minHeight: 34,
  },

  toolDescription: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 7,
  },

  toolFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 11,
  },

  openText: {
    fontSize: 10,
    fontWeight: '800',
    marginRight: 4,
  },

  /* ---------------- TRUST CARD ---------------- */

  trustCard: {
    marginHorizontal: 18,
    marginTop: 26,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(99,167,240,0.16)',
  },

  trustGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    paddingVertical: 15,
  },

  trustIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(80,160,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(101,179,255,0.20)',
    marginRight: 13,
  },

  trustContent: {
    flex: 1,
  },

  trustTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },

  trustText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },

  /* ---------------- FOOTER ---------------- */

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 25,
    paddingHorizontal: 27,
  },

  footerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
    opacity: 0.6,
  },

  footerText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 12,
  },
});
