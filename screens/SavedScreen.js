import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import GradientHeader from '../components/GradientHeader';
import { COLORS, fmtMoney } from '../theme';
import { readSavedScenarios, SCENARIO_TYPES, writeSavedScenarios } from '../savedScenarios';

const TYPE_META = {
  [SCENARIO_TYPES.HOME_PURCHASE]: {
    label: 'Home Purchase',
    icon: 'home',
    color: COLORS.accent,
    tab: 'Estimate',
  },
  [SCENARIO_TYPES.MORTGAGE_PAYOFF]: {
    label: 'Mortgage Payoff',
    icon: 'trending-down',
    color: COLORS.green,
    tab: 'Payoff',
  },
  [SCENARIO_TYPES.HOME_REFINANCE]: {
    label: 'Home Refinance',
    icon: 'swap-horizontal',
    color: COLORS.purple,
    tab: 'Refinance',
  },
  [SCENARIO_TYPES.AUTO_PURCHASE]: {
    label: 'Car Purchase',
    icon: 'car-sport',
    color: COLORS.teal,
    tab: 'Auto',
  },
  [SCENARIO_TYPES.AUTO_PAYOFF]: {
    label: 'Car Payoff',
    icon: 'trending-down',
    color: COLORS.green,
    tab: 'Auto',
  },
  [SCENARIO_TYPES.AUTO_REFINANCE]: {
    label: 'Car Refinance',
    icon: 'car',
    color: COLORS.pink,
    tab: 'Auto',
  },
};

export default function SavedScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await readSavedScenarios());
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = (item) => {
    Haptics.selectionAsync();
    const meta = TYPE_META[item.type] || TYPE_META[SCENARIO_TYPES.HOME_PURCHASE];
    if (item.type === SCENARIO_TYPES.HOME_PURCHASE) {
      navigation.navigate('Estimate', {
        screen: 'EstimatorHome',
        params: { restore: item, ts: Date.now() },
      });
    } else {
      navigation.navigate(meta.tab, { restore: item, ts: Date.now() });
    }
  };

  const remove = (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Delete', 'Remove this saved item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const next = items.filter((i) => i.id !== id);
          try {
            await writeSavedScenarios(next);
            setItems(next);
          } catch (error) {
            console.error('Unable to delete saved estimate:', error);
            Alert.alert(
              'Unable to Delete',
              'The saved estimate could not be deleted. Please try again.',
            );
          }
        },
      },
    ]);
  };

  const clearAll = () => {
    if (items.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Clear All', 'Delete all saved items?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All',
        style: 'destructive',
        onPress: async () => {
          try {
            await writeSavedScenarios([]);
            setItems([]);
          } catch (error) {
            console.error('Unable to clear saved estimates:', error);
            Alert.alert(
              'Unable to Clear',
              'Saved estimates could not be cleared. Please try again.',
            );
          }
        },
      },
    ]);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatRate = (value) => (Number.isFinite(value) ? `${value.toFixed(2)}%` : '—');

  const renderItem = ({ item }) => {
    const meta = TYPE_META[item.type] || TYPE_META[SCENARIO_TYPES.HOME_PURCHASE];
    const color = meta.color;
    const isRefi = item.type === SCENARIO_TYPES.HOME_REFINANCE;
    const isMortgagePayoff = item.type === SCENARIO_TYPES.MORTGAGE_PAYOFF;
    const isCarRefi = item.type === SCENARIO_TYPES.AUTO_REFINANCE;
    const isCarPayoff = item.type === SCENARIO_TYPES.AUTO_PAYOFF;
    const isCarPurchase = item.type === SCENARIO_TYPES.AUTO_PURCHASE;
    const displayName = item.name || meta.label;
    const result = item.results || {};

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => open(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${displayName}`}
      >
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: color + '22' }]}>
            <Ionicons name={meta.icon} size={16} color={color} />
            <Text style={[styles.badgeText, { color }]}>{meta.label}</Text>
          </View>
          <TouchableOpacity
            onPress={() => remove(item.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${displayName}`}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.savedName} numberOfLines={1}>
          {displayName}
        </Text>

        {isRefi ? (
          <>
            <Text style={styles.mainValue}>
              {result.monthlySavings > 0
                ? fmtMoney(result.monthlySavings)
                : `-${fmtMoney(Math.abs(result.monthlySavings))}`}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Balance" value={fmtMoney(result.balance)} />
              <Meta
                label="Rate"
                value={`${formatRate(result.curRate)} → ${formatRate(result.newRate)}`}
              />
            </View>
            {typeof result.lifetimeSavings === 'number' ? (
              <View style={styles.metaRow}>
                <Meta
                  label="Lifetime Savings"
                  value={
                    result.lifetimeSavings >= 0
                      ? fmtMoney(result.lifetimeSavings)
                      : `-${fmtMoney(Math.abs(result.lifetimeSavings))}`
                  }
                  color={result.lifetimeSavings >= 0 ? COLORS.green : COLORS.red}
                />
                <Meta
                  label="Break-even"
                  value={
                    Number.isFinite(result.breakEven)
                      ? `${result.breakEven.toFixed(0)} mo`
                      : 'Never'
                  }
                />
              </View>
            ) : null}
            <View
              style={[
                styles.verdictPill,
                { backgroundColor: (result.worthIt ? COLORS.green : COLORS.red) + '20' },
              ]}
            >
              <Ionicons
                name={result.worthIt ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={result.worthIt ? COLORS.green : COLORS.red}
              />
              <Text
                style={[
                  styles.verdictPillText,
                  { color: result.worthIt ? COLORS.green : COLORS.red },
                ]}
              >
                {result.worthIt ? 'Worth refinancing' : 'Not worth it'}
                {typeof result.lifetimeSavings === 'number'
                  ? ` · ${result.lifetimeSavings >= 0 ? 'saves' : 'loses'} ${fmtMoney(Math.abs(result.lifetimeSavings))} lifetime`
                  : ''}
              </Text>
            </View>
          </>
        ) : isMortgagePayoff ? (
          <>
            <Text style={styles.mainValue}>
              {fmtMoney(result.interestSaved)}
              <Text style={styles.mainUnit}> interest saved</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Balance" value={fmtMoney(result.balance)} />
              <Meta label="Rate" value={formatRate(result.rate)} />
              <Meta label="Payoff" value={`${(result.payoffMonths / 12).toFixed(1)} yr`} />
            </View>
            <View style={styles.metaRow}>
              <Meta label="Time Saved" value={`${result.monthsSaved} mo`} color={COLORS.green} />
              <Meta label="Extra / mo" value={fmtMoney(result.extra)} />
              <Meta label="Lump Sum" value={fmtMoney(result.lump)} />
            </View>
          </>
        ) : isCarRefi ? (
          <>
            <Text style={styles.mainValue}>
              {result.monthlySavings >= 0
                ? fmtMoney(result.monthlySavings)
                : `-${fmtMoney(Math.abs(result.monthlySavings))}`}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Balance" value={fmtMoney(result.balance)} />
              <Meta
                label="Rate"
                value={`${formatRate(result.curRate)} → ${formatRate(result.newRate)}`}
              />
              <Meta
                label="Net"
                value={fmtMoney(result.netSavings)}
                color={result.netSavings >= 0 ? COLORS.green : COLORS.red}
              />
            </View>
            <View
              style={[
                styles.verdictPill,
                { backgroundColor: (result.worthIt ? COLORS.green : COLORS.red) + '20' },
              ]}
            >
              <Ionicons
                name={result.worthIt ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={result.worthIt ? COLORS.green : COLORS.red}
              />
              <Text
                style={[
                  styles.verdictPillText,
                  { color: result.worthIt ? COLORS.green : COLORS.red },
                ]}
              >
                {result.worthIt ? 'Saves money' : 'Not worth it'}
              </Text>
            </View>
          </>
        ) : isCarPayoff ? (
          <>
            <Text style={styles.mainValue}>
              {fmtMoney(result.interestSaved)}
              <Text style={styles.mainUnit}> interest saved</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Balance" value={fmtMoney(result.balance)} />
              <Meta label="Rate" value={formatRate(result.rate)} />
              <Meta label="Payoff" value={`${result.payoffMonths} mo`} />
            </View>
            <View style={styles.metaRow}>
              <Meta label="Time Saved" value={`${result.monthsSaved} mo`} color={COLORS.green} />
              <Meta label="Extra / mo" value={fmtMoney(result.extra)} />
              <Meta label="Lump Sum" value={fmtMoney(result.lump)} />
            </View>
          </>
        ) : isCarPurchase ? (
          <>
            <Text style={styles.mainValue}>
              {fmtMoney(result.monthly)}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Price" value={fmtMoney(result.price)} />
              <Meta label="Financed" value={fmtMoney(result.financed)} />
              <Meta label="Rate" value={formatRate(result.rate)} />
            </View>
            <View style={styles.metaRow}>
              <Meta label="Term" value={`${result.term} mo`} />
              <Meta
                label="Total Interest"
                value={fmtMoney(result.totalInterest)}
                color={COLORS.red}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.mainValue}>
              {fmtMoney(result.monthly)}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Price" value={fmtMoney(result.price)} />
              <Meta label="Loan" value={fmtMoney(result.loanAmount)} />
              <Meta label="Rate" value={formatRate(result.rate)} />
            </View>
            <View style={styles.metaRow}>
              <Meta label="Term" value={`${result.term} yr`} />
              <Meta
                label="Total Interest"
                value={fmtMoney(result.totalInterest)}
                color={COLORS.red}
              />
            </View>
          </>
        )}
        <View style={styles.cardFooter}>
          <Text style={styles.date}>Saved {formatDate(item.createdAt)}</Text>
          <View style={styles.openHint}>
            <Ionicons name="chevron-forward" size={18} color={COLORS.accent} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Saved Plans"
        subtitle="Review and compare your scenarios"
        icon="home-outline"
        variant="financial"
        onIconPress={() => navigation.navigate('Home')}
        iconAccessibilityLabel="Return to home"
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="bookmark-outline" size={44} color={COLORS.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No saved estimates yet</Text>
          <Text style={styles.emptySub}>
            Save mortgage and auto loan estimates, payoffs and refinances to compare them here.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.emptyBtnText}>Explore Calculators</Text>
            <Ionicons name="arrow-forward" size={17} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <View>
                <Text style={styles.sectionTitle}>Your Saved Scenarios</Text>
                <Text style={styles.itemCount}>
                  {items.length} {items.length === 1 ? 'scenario' : 'scenarios'}
                </Text>
              </View>
              <TouchableOpacity style={styles.clearBtn} onPress={clearAll} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={15} color={COLORS.red} />
                <Text style={styles.clearText}>Clear all</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
}

function Meta({ label, value, color = COLORS.textPrimary }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  emptySub: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingHorizontal: 18,
    height: 48,
    marginTop: 20,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  list: { padding: 20, paddingBottom: 40 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800' },
  itemCount: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 3 },
  clearBtn: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: COLORS.red + '12',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.red + '30',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  clearText: { color: COLORS.red, fontSize: 13, fontWeight: '700' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  savedName: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  mainValue: { color: COLORS.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  mainUnit: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  meta: { flex: 1 },
  metaLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  metaValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  verdictPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginTop: 14,
  },
  verdictPillText: { fontSize: 12, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  date: { color: COLORS.textMuted, fontSize: 12, fontWeight: '500' },
  openHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
