import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import GradientHeader from '../components/GradientHeader';
import { COLORS, STORAGE_KEYS, fmtMoney } from '../theme';

const TYPE_META = {
  purchase: { label: 'Home Purchase', icon: 'home', color: COLORS.accent, tab: 'Estimate' },
  refinance: { label: 'Home Refinance', icon: 'swap-horizontal', color: COLORS.purple, tab: 'Refinance' },
  car_purchase: { label: 'Car Purchase', icon: 'car-sport', color: COLORS.teal, tab: 'Auto' },
  car_refinance: { label: 'Car Refinance', icon: 'car', color: COLORS.pink, tab: 'Auto' },
};

export default function SavedScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.SAVED);
      setItems(raw ? JSON.parse(raw) : []);
    } catch (e) {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = (item) => {
    Haptics.selectionAsync();
    const meta = TYPE_META[item.type] || TYPE_META.purchase;
    if (item.type === 'purchase') {
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
          setItems(next);
          await AsyncStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify(next));
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
          setItems([]);
          await AsyncStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify([]));
        },
      },
    ]);
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderItem = ({ item }) => {
    const meta = TYPE_META[item.type] || TYPE_META.purchase;
    const color = meta.color;
    const isRefi = item.type === 'refinance';
    const isCarRefi = item.type === 'car_refinance';
    const isCarPurchase = item.type === 'car_purchase';
    const displayName = item.name || meta.label;

    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => open(item)}>
        <View style={styles.cardTop}>
          <View style={[styles.badge, { backgroundColor: color + '22' }]}>
            <Ionicons name={meta.icon} size={16} color={color} />
            <Text style={[styles.badgeText, { color }]}>{meta.label}</Text>
          </View>
          <TouchableOpacity onPress={() => remove(item.id)} hitSlop={10}>
            <Ionicons name="trash-outline" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.savedName} numberOfLines={1}>{displayName}</Text>

        {isRefi ? (
          <>
            <Text style={styles.mainValue}>
              {item.monthlySavings > 0 ? fmtMoney(item.monthlySavings) : `-${fmtMoney(Math.abs(item.monthlySavings))}`}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Balance" value={fmtMoney(item.balance)} />
              <Meta label="Rate" value={`${item.curRate.toFixed(2)}% → ${item.newRate.toFixed(2)}%`} />
            </View>
            {typeof item.lifetimeSavings === 'number' ? (
              <View style={styles.metaRow}>
                <Meta
                  label="Lifetime Savings"
                  value={item.lifetimeSavings >= 0 ? fmtMoney(item.lifetimeSavings) : `-${fmtMoney(Math.abs(item.lifetimeSavings))}`}
                  color={item.lifetimeSavings >= 0 ? COLORS.green : COLORS.red}
                />
                <Meta label="Break-even" value={isFinite(item.breakEven) ? `${item.breakEven.toFixed(0)} mo` : 'Never'} />
              </View>
            ) : null}
            <View style={[styles.verdictPill, { backgroundColor: (item.worthIt ? COLORS.green : COLORS.red) + '20' }]}>
              <Ionicons
                name={item.worthIt ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={item.worthIt ? COLORS.green : COLORS.red}
              />
              <Text style={[styles.verdictPillText, { color: item.worthIt ? COLORS.green : COLORS.red }]}>
                {item.worthIt ? 'Worth refinancing' : 'Not worth it'}
                {typeof item.lifetimeSavings === 'number'
                  ? ` · ${item.lifetimeSavings >= 0 ? 'saves' : 'loses'} ${fmtMoney(Math.abs(item.lifetimeSavings))} lifetime`
                  : ''}
              </Text>
            </View>
          </>
        ) : isCarRefi ? (
          <>
            <Text style={styles.mainValue}>
              {item.monthlySavings >= 0 ? fmtMoney(item.monthlySavings) : `-${fmtMoney(Math.abs(item.monthlySavings))}`}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Balance" value={fmtMoney(item.balance)} />
              <Meta label="Rate" value={`${item.curRate.toFixed(2)}% → ${item.newRate.toFixed(2)}%`} />
              <Meta label="Net" value={fmtMoney(item.netSavings)} color={item.netSavings >= 0 ? COLORS.green : COLORS.red} />
            </View>
            <View style={[styles.verdictPill, { backgroundColor: (item.worthIt ? COLORS.green : COLORS.red) + '20' }]}>
              <Ionicons
                name={item.worthIt ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={item.worthIt ? COLORS.green : COLORS.red}
              />
              <Text style={[styles.verdictPillText, { color: item.worthIt ? COLORS.green : COLORS.red }]}>
                {item.worthIt ? 'Saves money' : 'Not worth it'}
              </Text>
            </View>
          </>
        ) : isCarPurchase ? (
          <>
            <Text style={styles.mainValue}>
              {fmtMoney(item.monthly)}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Price" value={fmtMoney(item.price)} />
              <Meta label="Financed" value={fmtMoney(item.financed)} />
              <Meta label="Rate" value={`${item.rate.toFixed(2)}%`} />
            </View>
            <View style={styles.metaRow}>
              <Meta label="Term" value={`${item.term} mo`} />
              <Meta label="Total Interest" value={fmtMoney(item.totalInterest)} color={COLORS.red} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.mainValue}>
              {fmtMoney(item.monthly)}
              <Text style={styles.mainUnit}> /mo</Text>
            </Text>
            <View style={styles.metaRow}>
              <Meta label="Price" value={fmtMoney(item.price)} />
              <Meta label="Loan" value={fmtMoney(item.loanAmount)} />
              <Meta label="Rate" value={`${item.rate.toFixed(2)}%`} />
            </View>
            <View style={styles.metaRow}>
              <Meta label="Term" value={`${item.term} yr`} />
              <Meta label="Total Interest" value={fmtMoney(item.totalInterest)} color={COLORS.red} />
            </View>
          </>
        )}
        <View style={styles.cardFooter}>
          <Text style={styles.date}>Saved {formatDate(item.date)}</Text>
          <View style={styles.openHint}>
            <Text style={styles.openHintText}>Open</Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.accent} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <GradientHeader title="Saved Estimates" subtitle="Your comparisons" icon="bookmark" />

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
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <TouchableOpacity style={styles.clearBtn} onPress={clearAll} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={15} color={COLORS.red} />
              <Text style={styles.clearText}>Clear all ({items.length})</Text>
            </TouchableOpacity>
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
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800' },
  emptySub: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  list: { padding: 20, paddingBottom: 40 },
  clearBtn: { flexDirection: 'row', gap: 6, alignSelf: 'flex-end', alignItems: 'center', marginBottom: 14, paddingVertical: 4 },
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
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  savedName: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 8 },
  mainValue: { color: COLORS.textPrimary, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  mainUnit: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  metaRow: { flexDirection: 'row', gap: 20, marginTop: 12 },
  meta: {},
  metaLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  metaValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  verdictPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginTop: 14 },
  verdictPillText: { fontSize: 12, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  date: { color: COLORS.textMuted, fontSize: 12, fontWeight: '500' },
  openHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  openHintText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
});
