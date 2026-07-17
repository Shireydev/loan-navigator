import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { COLORS } from '../theme';

// Landing page modeled on the reference: a bold hero, then grouped
// calculator cards for Home Loans and Auto Loans.

const HOME_TOOLS = [
  {
    key: 'estimate',
    title: 'Estimate Your\nMortgage',
    icon: 'home',
    color: COLORS.accent,
    target: { tab: 'Estimate', screen: 'EstimatorHome' },
  },
  {
    key: 'payoff',
    title: 'Pay Off\nFaster',
    icon: 'rocket',
    color: COLORS.green,
    target: { tab: 'Payoff' },
  },
  {
    key: 'refi',
    title: 'Refinance\n& Save',
    icon: 'refresh-circle',
    color: COLORS.purple,
    target: { tab: 'Refinance' },
  },
];

const AUTO_TOOLS = [
  {
    key: 'buy',
    title: 'Buy with\nConfidence',
    icon: 'car-sport',
    color: COLORS.teal,
    target: { tab: 'Auto', mode: 'purchase' },
  },
  {
    key: 'auto_payoff',
    title: 'Pay Off\nFaster',
    icon: 'speedometer',
    color: COLORS.amber,
    target: { tab: 'Auto', mode: 'payoff' },
  },
  {
    key: 'auto_refi',
    title: 'Refinance\n& Save',
    icon: 'swap-horizontal',
    color: COLORS.pink,
    target: { tab: 'Auto', mode: 'refinance' },
  },
];

function ToolCard({ tool, onPress }) {
  return (
    <TouchableOpacity
      style={styles.tool}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={[styles.toolIcon, { backgroundColor: tool.color + '22' }]}>
        <Ionicons name={tool.icon} size={26} color={tool.color} />
      </View>
      <Text style={styles.toolTitle}>{tool.title}</Text>
    </TouchableOpacity>
  );
}

export default function LandingScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const go = (tool) => {
    Haptics.selectionAsync();
    const t = tool.target;
    if (t.screen) {
      navigation.navigate(t.tab, { screen: t.screen });
    } else if (t.mode) {
      navigation.navigate(t.tab, { landingMode: t.mode, ts: Date.now() });
    } else {
      navigation.navigate(t.tab);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top }]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[COLORS.gradientA, COLORS.gradientB]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroBadge}>
            <Ionicons name="calculator" size={22} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Your Goals.</Text>
          <Text style={styles.heroTitle}>Our Calculators.</Text>
          <Text style={styles.heroSub}>
            Powerful tools to help you finance what matters.
          </Text>
        </LinearGradient>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="home" size={16} color={COLORS.accent} />
            <Text style={styles.sectionTitle}>HOME LOANS</Text>
          </View>
          <View style={styles.grid}>
            {HOME_TOOLS.map((t) => (
              <ToolCard key={t.key} tool={t} onPress={() => go(t)} />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="car-sport" size={16} color={COLORS.teal} />
            <Text style={styles.sectionTitle}>AUTO LOANS</Text>
          </View>
          <View style={styles.grid}>
            {AUTO_TOOLS.map((t) => (
              <ToolCard key={t.key} tool={t} onPress={() => go(t)} />
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Ionicons name="bulb" size={16} color={COLORS.amber} />
          <Text style={styles.footerText}>
            Smart decisions today. More freedom tomorrow.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const CARD_GAP = 12;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: 20 },
  hero: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroBadge: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.8, lineHeight: 36 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 15, fontWeight: '500', marginTop: 12, lineHeight: 21 },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  grid: { flexDirection: 'row', gap: CARD_GAP },
  tool: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  toolIcon: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  toolTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 17 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    marginTop: 28,
    paddingHorizontal: 20,
  },
  footerText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
});
