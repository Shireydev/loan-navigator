import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import DonutChart from '../components/DonutChart';
import { COLORS, amortize, monthlyPI, fmtMoney } from '../theme';
import { addSavedScenario, SCENARIO_TYPES } from '../savedScenarios';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
const HEADER_COLLAPSE_DISTANCE = 96;
const HEADER_DETAILS_HEIGHT = 112;

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

export default function ResultScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const resultsScrollRef = useRef(null);
  const [saved, setSaved] = useState(false);
  const p = route.params;
  const [name, setName] = useState(p.presetName || '');

  const am = useMemo(
    () => amortize(p.loanAmount, p.rate, p.term, 0),
    [p.loanAmount, p.rate, p.term],
  );
  const yearData = useMemo(
    () => buildYearBreakdown(p.loanAmount, p.rate, p.term),
    [p.loanAmount, p.rate, p.term],
  );

  // When PMI applies, figure out exactly when it will be removed.
  const pmiRemovalMo = useMemo(
    () => (p.pmi > 0 ? pmiRemovalMonth(p.loanAmount, p.rate, p.term, p.price) : null),
    [p.pmi, p.loanAmount, p.rate, p.term, p.price],
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
  const maxIdx = Math.max(yearData.length - 1, 0);
  const cur = yearData[Math.min(yearIdx, maxIdx)] || {
    principal: p.monthlyPI,
    interest: 0,
    year: 1,
    balance: p.loanAmount,
  };

  const changeYear = useCallback(
    (change) => {
      setYearIdx((current) => Math.max(0, Math.min(maxIdx, current + change)));
      Haptics.selectionAsync();
    },
    [maxIdx],
  );
  const collapseProgress = scrollY.interpolate({
    inputRange: [0, HEADER_COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const headerDetailsHeight = scrollY.interpolate({
    inputRange: [0, HEADER_COLLAPSE_DISTANCE],
    outputRange: [HEADER_DETAILS_HEIGHT, 0],
    extrapolate: 'clamp',
  });
  const headerDetailsOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_COLLAPSE_DISTANCE * 0.7],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const paymentFontSize = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [44, 30],
  });
  const headerBottomPadding = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 10],
  });
  const headerBarMargin = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 5],
  });

  // PMI automatically cancels once the loan-to-value ratio reaches 78% —
  // i.e. once the remaining balance drops to 78% of the original home price.
  // As the selected year reaches that point, PMI goes to 0%.
  const ltv = p.price > 0 ? (cur.balance / p.price) * 100 : 0;
  const pmiActive = p.pmi > 0 && ltv > 78;
  const curPmi = pmiActive ? p.pmi : 0;

  // The donut chart shows the FULL monthly payment breakdown, with Principal
  // and Interest as two SEPARATE slices. Their split changes with the year
  // selected in the year navigator below. Ordered/colored to match the reference.
  const donutSegments = [
    { label: 'Interest', value: cur.interest, color: COLORS.amber },
    { label: 'Principal', value: cur.principal, color: COLORS.accent },
    { label: 'Property Tax', value: p.tax, color: COLORS.green },
    { label: 'Home Insurance', value: p.insurance, color: '#178A3D' },
    ...(p.hoa > 0 ? [{ label: 'HOA Dues', value: p.hoa, color: COLORS.purple }] : []),
    // Keep this row mounted after PMI is removed so the breakdown card does
    // not change height while the user cycles through loan years.
    ...(p.pmi > 0
      ? [{ label: 'Private Mortgage Insurance (PMI)', value: curPmi, color: COLORS.red }]
      : []),
  ];

  // Total for THIS year's payment breakdown.
  const pieTotal = donutSegments.reduce((s, seg) => s + seg.value, 0);
  const maxSeg = Math.max(...donutSegments.map((s) => s.value), 1);

  const saveEstimate = async () => {
    try {
      await addSavedScenario({
        type: SCENARIO_TYPES.HOME_PURCHASE,
        name: name.trim() || 'Home Purchase',
        inputs: p.inputs,
        results: {
          price: p.price,
          loanAmount: p.loanAmount,
          rate: p.rate,
          term: p.term,
          monthly: p.total,
          totalInterest: am.totalInterest,
          closingCosts: p.closingCosts,
        },
      });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Unable to save mortgage estimate:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Unable to Save', 'Your mortgage estimate could not be saved. Please try again.');
    }
  };

  const revealNameInput = useCallback(() => {
    const scrollToName = () => resultsScrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(scrollToName);
    setTimeout(scrollToName, 280);
  }, []);

  return (
    <View style={styles.container}>
      <AnimatedLinearGradient
        colors={['#07162F', '#0A2D61']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12, paddingBottom: headerBottomPadding }]}
      >
        <Animated.View style={[styles.headerBar, { marginBottom: headerBarMargin }]}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to mortgage estimate"
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Mortgage Plan</Text>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate('Home')}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Return to home"
          >
            <Ionicons name="home-outline" size={21} color="#8CC5FF" />
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.estimateLabel}>ESTIMATED MONTHLY PAYMENT</Text>
        <Animated.Text style={[styles.bigValue, { fontSize: paymentFontSize }]}>
          {fmtMoney(p.total)}
        </Animated.Text>
        <Animated.View
          style={[
            styles.headerDetails,
            { height: headerDetailsHeight, opacity: headerDetailsOpacity },
          ]}
        >
          <Text style={styles.bigLabel}>per month · based on your inputs</Text>
          <View style={styles.headerFacts}>
            <View style={styles.headerFact}>
              <Text style={styles.headerFactLabel}>Loan amount</Text>
              <Text style={styles.headerFactValue}>{fmtMoney(p.loanAmount)}</Text>
            </View>
            <View style={styles.headerFactDivider} />
            <View style={styles.headerFact}>
              <Text style={styles.headerFactLabel}>Rate & term</Text>
              <Text style={styles.headerFactValue}>
                {p.rate.toFixed(2)}% · {p.term} years
              </Text>
            </View>
          </View>
          <Text style={styles.headerDisclosure}>Planning estimate — not a lender quote.</Text>
        </Animated.View>
      </AnimatedLinearGradient>

      <KeyboardAvoidingView
        style={styles.resultsBody}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.ScrollView
          ref={resultsScrollRef}
          contentContainerStyle={styles.scroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: false,
          })}
        >
          <Text style={styles.sectionTitle}>Payment Over Time</Text>
          <View style={styles.card}>
            <DonutChart
              segments={donutSegments}
              centerValue={fmtMoney(pieTotal)}
              centerLabel="/ MONTH"
              animateChanges={false}
            />
            <View style={styles.yearNavigatorPanel}>
              <Text style={styles.yearNavigatorHint}>Review your payment year by year</Text>
              <View style={styles.yearNavigator}>
                <TouchableOpacity
                  style={[styles.yearStepBtn, yearIdx === 0 && styles.yearStepBtnDisabled]}
                  onPress={() => changeYear(-1)}
                  disabled={yearIdx === 0}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Previous loan year"
                >
                  <Ionicons name="chevron-back" size={24} color={COLORS.accent} />
                </TouchableOpacity>

                <View
                  style={styles.yearReadout}
                  accessible
                  accessibilityLabel={`Loan year ${cur.year} of ${p.term}`}
                >
                  <Text style={styles.yearEyebrow}>LOAN YEAR</Text>
                  <View style={styles.yearValueRow}>
                    <Text style={styles.yearNumber}>{cur.year}</Text>
                    <Text style={styles.yearTotal}>of {p.term}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.yearStepBtn, yearIdx === maxIdx && styles.yearStepBtnDisabled]}
                  onPress={() => changeYear(1)}
                  disabled={yearIdx === maxIdx}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Next loan year"
                >
                  <Ionicons name="chevron-forward" size={24} color={COLORS.accent} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.legend}>
              {donutSegments.map((b) => (
                <View key={b.label} style={styles.legendRow}>
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

            {p.pmi > 0 ? (
              <View
                style={[
                  styles.pmiNote,
                  { backgroundColor: (pmiActive ? COLORS.red : COLORS.green) + '14' },
                ]}
              >
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

          <Text style={styles.sectionTitle}>Loan Snapshot</Text>
          <View style={styles.card}>
            <Row label="Home Price" value={fmtMoney(p.price)} />
            <Row
              label="Down Payment"
              value={`${fmtMoney(p.down)} (${p.downPct.toFixed(0)}%)`}
              color={COLORS.green}
            />
            <Row label="Loan Amount" value={fmtMoney(p.loanAmount)} />
            <Row label="Interest Rate" value={`${p.rate.toFixed(2)}%`} color={COLORS.purple} />
            <Row label="Term" value={`${p.term} years`} />
            {p.closingCosts > 0 ? (
              <Row
                label={
                  p.closingState ? `Est. Closing Costs (${p.closingState})` : 'Est. Closing Costs'
                }
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
            <>
              <Text style={styles.sectionTitle}>Closing Costs</Text>
              <View style={styles.card}>
                <Text style={styles.closingBig}>{fmtMoney(p.closingCosts)}</Text>
                <View style={styles.closingRow}>
                  <Ionicons name="document-text" size={18} color={COLORS.purple} />
                  <Text style={styles.closingText}>
                    Approximate one-time closing costs
                    {p.closingState ? ` for ${p.closingState}` : ''}, estimated from your home
                    price, {p.term}-year term, and {p.downPct.toFixed(0)}% down payment. Includes
                    lender, title, and typical government fees. Actual costs vary by lender.
                  </Text>
                </View>
                <View style={styles.closingBreak}>
                  <Row
                    label="Cash to Close (est.)"
                    value={fmtMoney(p.down + p.closingCosts)}
                    color={COLORS.accent}
                    bold
                  />
                </View>
              </View>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Over the Life of the Loan</Text>
          <View style={styles.card}>
            <Row
              label="Total Interest Paid"
              value={fmtMoney(am.totalInterest)}
              color={COLORS.red}
              bold
            />
            <Row label="Total Principal + Interest" value={fmtMoney(am.totalPaid)} bold />
            <View style={styles.interestBanner}>
              <Ionicons name="alert-circle" size={18} color={COLORS.amber} />
              <Text style={styles.interestText}>
                You'll pay {fmtMoney(am.totalInterest)} in interest — that's{' '}
                {((am.totalInterest / p.loanAmount) * 100).toFixed(0)}% of your loan amount.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>
            {saved ? 'Estimate Saved' : 'Save This Estimate for Later'}
          </Text>
          <View style={styles.actionCard}>
            {!saved ? (
              <View>
                <Text style={styles.nameLabel}>Estimate name</Text>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  onFocus={revealNameInput}
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
              accessibilityRole="button"
            >
              <Ionicons name={saved ? 'checkmark-circle' : 'bookmark'} size={20} color="#fff" />
              <Text style={styles.saveText}>{saved ? 'Saved to your list' : 'Save Estimate'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.tipBtn}
            activeOpacity={0.8}
            onPress={() => navigation.getParent()?.navigate('Payoff')}
          >
            <Ionicons name="trending-down" size={20} color={COLORS.teal} />
            <View style={styles.tipCopy}>
              <Text style={styles.tipTitle}>Explore a faster payoff</Text>
              <Text style={styles.tipText}>See the impact of additional principal payments.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <View style={{ height: 30 }} />
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  resultsBody: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(121,184,255,0.24)',
    alignItems: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 14,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(91,169,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  estimateLabel: {
    color: '#9EC9F5',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
    marginBottom: 5,
  },
  bigValue: { color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  bigLabel: { color: 'rgba(222,237,255,0.76)', fontSize: 13, fontWeight: '600' },
  headerDetails: { alignSelf: 'stretch', alignItems: 'center', overflow: 'hidden' },
  headerFacts: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    backgroundColor: 'rgba(2,15,36,0.26)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.16)',
    paddingVertical: 12,
    marginTop: 16,
  },
  headerFact: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  headerFactDivider: { width: 1, backgroundColor: 'rgba(122,190,255,0.18)' },
  headerFactLabel: { color: 'rgba(222,237,255,0.62)', fontSize: 11, fontWeight: '600' },
  headerFactValue: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 3 },
  headerDisclosure: {
    color: 'rgba(222,237,255,0.56)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 10,
  },
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
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 7,
    marginBottom: 11,
  },
  legend: { marginTop: 20 },
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
  yearNavigatorPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginTop: 14,
  },
  yearNavigatorHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 10,
  },
  yearNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  yearStepBtn: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: COLORS.accent + '18',
    borderWidth: 1,
    borderColor: COLORS.accent + '45',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 2,
  },
  yearStepBtnDisabled: { opacity: 0.35 },
  yearReadout: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.accent + '38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearEyebrow: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.25,
  },
  yearValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 1 },
  yearNumber: { color: COLORS.textPrimary, fontSize: 29, fontWeight: '900', letterSpacing: -0.5 },
  yearTotal: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  pmiNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    minHeight: 62,
  },
  pmiNoteText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
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
  rowLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  rowValue: { fontSize: 15, fontWeight: '700' },
  closingBig: {
    color: COLORS.purple,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  closingRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  closingText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
    lineHeight: 19,
  },
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
  interestText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    flex: 1,
    fontWeight: '500',
    lineHeight: 19,
  },
  actionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.accent + '55',
    marginBottom: 16,
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
    marginTop: 16,
  },
  savedBtn: { backgroundColor: COLORS.green, marginTop: 0 },
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
  tipCopy: { flex: 1 },
  tipTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '700' },
  tipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 3 },
});
