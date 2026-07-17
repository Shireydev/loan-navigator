import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import DonutChart from '../components/DonutChart';
import { COLORS, STORAGE_KEYS, amortize, monthlyPI, fmtMoney } from '../theme';

function Row({ label, value, color = COLORS.textPrimary, bold }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }, bold && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

// Build a per-year breakdown of how each month's payment splits between
// principal and interest. Values are the AVERAGE monthly principal/interest
// during that loan year. Also tracks the ending balance so we can compute the
// loan-to-value ratio for PMI cancellation.
function buildYearBreakdown(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const basePayment = monthlyPI(principal, annualRatePct, years);
  let balance = principal;
  const totalMonths = years * 12;
  const perYear = [];
  let yearInterest = 0;
  let yearPrincipal = 0;
  let monthsInYear = 0;

  for (let m = 1; m <= totalMonths && balance > 0.01; m++) {
    const interest = balance * r;
    let principalPaid = basePayment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    yearInterest += interest;
    yearPrincipal += principalPaid;
    monthsInYear++;
    if (m % 12 === 0 || balance <= 0.01 || m === totalMonths) {
      perYear.push({
        year: Math.ceil(m / 12),
        principal: yearPrincipal / monthsInYear,
        interest: yearInterest / monthsInYear,
        balance: Math.max(balance, 0),
      });
      yearInterest = 0;
      yearPrincipal = 0;
      monthsInYear = 0;
    }
  }
  return perYear;
}

// Find the exact month PMI is removed — when the remaining balance first
// reaches 78% of the original home price (loan-to-value <= 78%).
function pmiRemovalMonth(principal, annualRatePct, years, homePrice) {
  if (homePrice <= 0) return null;
  const target = homePrice * 0.78;
  const r = annualRatePct / 100 / 12;
  const basePayment = monthlyPI(principal, annualRatePct, years);
  let balance = principal;
  const totalMonths = years * 12;
  for (let m = 1; m <= totalMonths && balance > 0.01; m++) {
    const interest = balance * r;
    let principalPaid = basePayment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    if (balance <= target) return m;
  }
  return null;
}

const SLIDER_H = 44;

export default function ResultScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(false);
  const p = route.params;
  const [name, setName] = useState(p.presetName || '');

  const am = useMemo(() => amortize(p.loanAmount, p.rate, p.term, 0), [p.loanAmount, p.rate, p.term]);
  const yearData = useMemo(
    () => buildYearBreakdown(p.loanAmount, p.rate, p.term),
    [p.loanAmount, p.rate, p.term]
  );

  // When PMI applies, figure out exactly when it will be removed.
  const pmiRemovalMo = useMemo(
    () => (p.pmi > 0 ? pmiRemovalMonth(p.loanAmount, p.rate, p.term, p.price) : null),
    [p.pmi, p.loanAmount, p.rate, p.term, p.price]
  );
  const pmiRemovalText = useMemo(() => {
    if (pmiRemovalMo == null) return null;
    const yrs = Math.floor(pmiRemovalMo / 12);
    const mos = pmiRemovalMo % 12;
    const parts = [];
    if (yrs > 0) parts.push(`${yrs} yr`);
    if (mos > 0) parts.push(`${mos} mo`);
    return parts.join(' ') || '0 mo';
  }, [pmiRemovalMo]);

  const [yearIdx, setYearIdx] = useState(0);
  const [trackW, setTrackW] = useState(0);
  const maxIdx = Math.max(yearData.length - 1, 0);
  const cur = yearData[Math.min(yearIdx, maxIdx)] || {
    principal: p.monthlyPI, interest: 0, year: 1, balance: p.loanAmount,
  };

  const setIdxFromX = (x) => {
    if (trackW <= 0 || maxIdx === 0) return;
    const ratio = Math.max(0, Math.min(1, x / trackW));
    const idx = Math.round(ratio * maxIdx);
    setYearIdx((prev) => {
      if (prev !== idx) Haptics.selectionAsync();
      return idx;
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setIdxFromX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => setIdxFromX(e.nativeEvent.locationX),
      }),
    [trackW, maxIdx]
  );

  const thumbLeft = maxIdx > 0 ? (yearIdx / maxIdx) * trackW : 0;

  // PMI automatically cancels once the loan-to-value ratio reaches 78% —
  // i.e. once the remaining balance drops to 78% of the original home price.
  // As the slider progresses to the year that happens, PMI goes to 0%.
  const ltv = p.price > 0 ? (cur.balance / p.price) * 100 : 0;
  const pmiActive = p.pmi > 0 && ltv > 78;
  const curPmi = pmiActive ? p.pmi : 0;

  // The donut chart shows the FULL monthly payment breakdown, with Principal
  // and Interest as two SEPARATE slices. Their split changes with the year
  // selected on the slider below. Ordered/colored to match the reference.
  const donutSegments = [
    { label: 'Interest', value: cur.interest, color: COLORS.amber },
    { label: 'Principal', value: cur.principal, color: COLORS.accent },
    { label: 'Property Tax', value: p.tax, color: COLORS.green },
    ...(curPmi > 0 ? [{ label: 'Mortgage Insurance', value: curPmi, color: COLORS.red }] : []),
    { label: 'Home Insurance', value: p.insurance, color: '#178A3D' },
    ...(p.hoa > 0 ? [{ label: 'HOA Dues', value: p.hoa, color: COLORS.purple }] : []),
  ];

  // Total for THIS year's payment breakdown.
  const pieTotal = donutSegments.reduce((s, seg) => s + seg.value, 0);
  const maxSeg = Math.max(...donutSegments.map((s) => s.value), 1);

  const saveEstimate = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.SAVED);
      const list = raw ? JSON.parse(raw) : [];
      const entry = {
        id: Date.now().toString(),
        type: 'purchase',
        name: name.trim() || 'Home Purchase',
        date: new Date().toISOString(),
        price: p.price,
        loanAmount: p.loanAmount,
        rate: p.rate,
        term: p.term,
        monthly: p.total,
        totalInterest: am.totalInterest,
        closingCosts: p.closingCosts,
        inputs: p.inputs,
      };
      list.unshift(entry);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify(list));
      setSaved(true);
    } catch (e) {}
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.gradientA, COLORS.gradientB]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Breakdown</Text>
          <View style={{ width: 40 }} />
        </View>
        <Text style={styles.bigValue}>{fmtMoney(p.total)}</Text>
        <Text style={styles.bigLabel}>per month</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Donut chart — slider below drives the P&I split */}
        <View style={styles.card}>
          <DonutChart
            segments={donutSegments}
            centerValue={fmtMoney(pieTotal)}
            centerLabel="PER MONTH"
          />

          {/* Reference-style legend: colored progress bar + label + amount */}
          <View style={styles.legend}>
            {donutSegments.map((b, i) => (
              <View key={i} style={styles.legendRow}>
                <View style={styles.legendMain}>
                  <Text style={styles.bdLabel}>{b.label}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${(b.value / maxSeg) * 100}%`, backgroundColor: b.color },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.bdValue}>{fmtMoney(b.value)}</Text>
              </View>
            ))}
          </View>

          {/* Year slider — controls the donut's Principal vs Interest split */}
          <View style={styles.sliderHeader}>
            <Text style={styles.sliderLabel}>Loan Year</Text>
            <View style={styles.yearBadge}>
              <Text style={styles.yearBadgeText}>Year {cur.year} of {p.term}</Text>
            </View>
          </View>
          <View
            style={styles.sliderTrackWrap}
            onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
            {...panResponder.panHandlers}
          >
            <View style={styles.sliderTrackBg} />
            <View style={[styles.sliderTrackFill, { width: thumbLeft }]} />
            <View style={[styles.sliderThumb, { left: Math.max(0, thumbLeft - 12) }]}>
              <Ionicons name="ellipse" size={12} color="#fff" />
            </View>
          </View>
          <View style={styles.sliderScale}>
            <Text style={styles.scaleText}>Yr 1</Text>
            <Text style={styles.scaleText}>Yr {p.term}</Text>
          </View>

          {p.pmi > 0 ? (
            <View style={[styles.pmiNote, { backgroundColor: (pmiActive ? COLORS.red : COLORS.green) + '14' }]}>
              <Ionicons
                name={pmiActive ? 'shield' : 'shield-checkmark'}
                size={16}
                color={pmiActive ? COLORS.red : COLORS.green}
              />
              <Text style={styles.pmiNoteText}>
                {pmiActive
                  ? `PMI still applies — loan-to-value is ${ltv.toFixed(0)}%.${pmiRemovalText ? ` Removed after ${pmiRemovalText} of payments.` : ''}`
                  : `PMI removed — loan-to-value reached ${ltv.toFixed(0)}%.`}
              </Text>
            </View>
          ) : null}

          <View style={styles.balanceNote}>
            <Ionicons name="wallet" size={16} color={COLORS.accent} />
            <Text style={styles.balanceNoteText}>
              Remaining balance after year {cur.year}: {fmtMoney(cur.balance)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Loan Summary</Text>
          <Row label="Home Price" value={fmtMoney(p.price)} />
          <Row label="Down Payment" value={`${fmtMoney(p.down)} (${p.downPct.toFixed(0)}%)`} color={COLORS.green} />
          <Row label="Loan Amount" value={fmtMoney(p.loanAmount)} />
          <Row label="Interest Rate" value={`${p.rate.toFixed(2)}%`} color={COLORS.purple} />
          <Row label="Term" value={`${p.term} years`} />
          {p.closingCosts > 0 ? (
            <Row
              label={p.closingState ? `Est. Closing Costs (${p.closingState})` : 'Est. Closing Costs'}
              value={fmtMoney(p.closingCosts)}
              color={COLORS.purple}
            />
          ) : null}
          {p.pmi > 0 ? (
            <Row
              label={pmiRemovalText ? `PMI (removed after ${pmiRemovalText})` : 'PMI'}
              value={`${fmtMoney(p.pmi)}/mo`}
              color={COLORS.pink}
            />
          ) : p.downPct < 20 ? (
            <Row label="PMI" value="Excluded" color={COLORS.textMuted} />
          ) : null}
        </View>

        {p.closingCosts > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Closing Costs</Text>
            <Text style={styles.closingBig}>{fmtMoney(p.closingCosts)}</Text>
            <View style={styles.closingRow}>
              <Ionicons name="document-text" size={18} color={COLORS.purple} />
              <Text style={styles.closingText}>
                Approximate one-time closing costs{p.closingState ? ` for ${p.closingState}` : ''}, estimated
                from your home price, {p.term}-year term, and {p.downPct.toFixed(0)}% down payment. Includes
                lender, title, and typical government fees. Actual costs vary by lender.
              </Text>
            </View>
            <View style={styles.closingBreak}>
              <Row label="Cash to Close (est.)" value={fmtMoney(p.down + p.closingCosts)} color={COLORS.accent} bold />
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Over the Life of the Loan</Text>
          <Row label="Total Interest Paid" value={fmtMoney(am.totalInterest)} color={COLORS.red} bold />
          <Row label="Total of Payments" value={fmtMoney(am.totalPaid)} bold />
          <View style={styles.interestBanner}>
            <Ionicons name="alert-circle" size={18} color={COLORS.amber} />
            <Text style={styles.interestText}>
              You'll pay {fmtMoney(am.totalInterest)} in interest — that's{' '}
              {((am.totalInterest / p.loanAmount) * 100).toFixed(0)}% of your loan amount.
            </Text>
          </View>
        </View>

        {!saved ? (
          <View style={styles.nameCard}>
            <Text style={styles.nameLabel}>Name this estimate</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Maple St. Home"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, saved && styles.savedBtn]}
          activeOpacity={0.9}
          onPress={saveEstimate}
          disabled={saved}
        >
          <Ionicons name={saved ? 'checkmark-circle' : 'bookmark'} size={20} color="#fff" />
          <Text style={styles.saveText}>{saved ? 'Saved to your list' : 'Save this Estimate'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tipBtn}
          activeOpacity={0.8}
          onPress={() => navigation.getParent()?.navigate('Payoff')}
        >
          <Ionicons name="trending-down" size={20} color={COLORS.teal} />
          <Text style={styles.tipText}>See how extra payments save you thousands</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    alignItems: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  bigValue: { color: '#fff', fontSize: 46, fontWeight: '900', letterSpacing: -1 },
  bigLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  scroll: { padding: 20 },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 16 },
  legend: { marginTop: 26 },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  legendMain: { flex: 1, marginRight: 16 },
  bdLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  barTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceElevated,
    overflow: 'hidden',
  },
  barFill: { height: 5, borderRadius: 3 },
  bdValue: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '900' },
  sliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
  },
  sliderLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },
  yearBadge: {
    backgroundColor: COLORS.accent + '22',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  yearBadgeText: { color: COLORS.accent, fontSize: 13, fontWeight: '800' },
  sliderTrackWrap: {
    height: SLIDER_H,
    justifyContent: 'center',
  },
  sliderTrackBg: {
    position: 'absolute',
    left: 0, right: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.surfaceElevated,
  },
  sliderTrackFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  sliderScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  scaleText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  pmiNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  pmiNoteText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
  balanceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent + '14',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  balanceNoteText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  rowLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 12 },
  rowValue: { fontSize: 15, fontWeight: '700' },
  closingBig: { color: COLORS.purple, fontSize: 32, fontWeight: '900', letterSpacing: -0.5, marginBottom: 14 },
  closingRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  closingText: { color: COLORS.textSecondary, fontSize: 13, flex: 1, fontWeight: '500', lineHeight: 19 },
  closingBreak: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  interestBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.amber + '18',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  interestText: { color: COLORS.textSecondary, fontSize: 13, flex: 1, fontWeight: '500', lineHeight: 19 },
  nameCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 14,
  },
  nameLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  nameInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 50,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  savedBtn: { backgroundColor: COLORS.green },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  tipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tipText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', flex: 1 },
});
