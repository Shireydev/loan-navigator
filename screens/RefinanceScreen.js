import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import GradientHeader from '../components/GradientHeader';
import InputField, { ValidationBanner } from '../components/InputField';
import {
  COLORS,
  monthlyPI,
  amortize,
  fmtMoney,
  parseLoanNumber,
  originalLoanFromRemainingBalance,
  validateRefinanceScenario,
} from '../theme';
import { lookupTaxByZip } from '../taxApi';
import { addSavedScenario, SCENARIO_TYPES } from '../savedScenarios';

// Given an original loan (balance implied) at a rate, original term, and how many
// years are left, recover the ORIGINAL loan amount so we can build an accurate
// amortization schedule that matches the borrower's true remaining trajectory.
export default function RefinanceScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const [balance, setBalance] = useState('360000');
  const [curRate, setCurRate] = useState('7.25');
  const [origYears, setOrigYears] = useState('30');
  const [curYears, setCurYears] = useState('27');
  const [newRate, setNewRate] = useState('6.00');
  const [newTerm, setNewTerm] = useState('30');
  const [costs, setCosts] = useState('6500');
  const [analyzed, setAnalyzed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('');

  // ZIP-based closing cost estimator for the NEW loan.
  const [zip, setZip] = useState('');
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState('');
  const [zipInfo, setZipInfo] = useState(null);

  // Restore a saved refinance analysis from the Saved tab.
  useEffect(() => {
    const rItem = route.params?.restore;
    if (rItem && rItem.type === SCENARIO_TYPES.HOME_REFINANCE && rItem.inputs) {
      const i = rItem.inputs;
      setBalance(i.balance ?? '360000');
      setCurRate(i.curRate ?? '7.25');
      setOrigYears(i.origYears ?? '30');
      setCurYears(i.curYears ?? '27');
      setNewRate(i.newRate ?? '6.00');
      setNewTerm(i.newTerm ?? '30');
      setCosts(i.costs ?? '6500');
      if (i.zip) setZip(i.zip);
      setName(rItem.name || '');
      setAnalyzed(true);
      setSaved(false);
      navigation.setParams({ restore: undefined });
    }
  }, [navigation, route.params?.restore, route.params?.ts]);

  const num = parseLoanNumber;
  const balN = num(balance);
  const origYearsN = num(origYears);
  const yearsLeftN = num(curYears);
  const newTermN = num(newTerm);
  const validationError = validateRefinanceScenario({
    balance: balN,
    currentRate: num(curRate),
    originalTerm: origYearsN,
    remainingTerm: yearsLeftN,
    newRate: num(newRate),
    newTerm: newTermN,
    costs: num(costs),
    termLabel: 'term',
    maxTerm: 50,
  });

  const cur = !validationError
    ? originalLoanFromRemainingBalance(balN, num(curRate), origYearsN * 12, yearsLeftN * 12)
    : null;
  const curPay = cur ? cur.payment : 0;

  const newPay = !validationError && balN > 0 ? monthlyPI(balN, num(newRate), newTermN) : 0;
  const monthlySavings = curPay - newPay;
  const closingCosts = validationError ? 0 : num(costs);
  const breakEven = monthlySavings > 0 ? closingCosts / monthlySavings : Infinity;

  const curAm =
    !validationError && balN > 0
      ? (() => {
          const monthsLeft = yearsLeftN;
          const stdPay = monthlyPI(balN, num(curRate), monthsLeft);
          const extra = curPay - stdPay;
          return amortize(balN, num(curRate), monthsLeft, extra);
        })()
      : null;
  const newAm = !validationError && balN > 0 ? amortize(balN, num(newRate), newTermN, 0) : null;
  const lifetimeSavings =
    curAm && newAm ? curAm.totalInterest - newAm.totalInterest - closingCosts : 0;

  const savesLifetime = lifetimeSavings > 0;
  const reasonableBreakEven = isFinite(breakEven) && breakEven <= 60;
  const worthIt = savesLifetime && monthlySavings > 0;
  const strongYes = worthIt && reasonableBreakEven;

  // ---- ZIP-based closing cost estimate for the NEW refinance loan ----
  // Refinances have lower closing costs than a purchase (no transfer tax /
  // owner's title in most cases), so we apply a ~65% factor to the state
  // purchase closing rate, then scale by the refinanced balance.
  const refiClosingRate = zipInfo ? zipInfo.closingRate * 0.65 : null;
  // Longer new terms mean slightly higher origination as a share; short terms
  // carry a bump too. Baseline at 30yr.
  const refiTermAdj = newTermN <= 15 ? 1.06 : newTermN <= 20 ? 1.03 : 1.0;
  const estRefiClosing =
    !validationError && zipInfo && balN > 0 ? balN * (refiClosingRate / 100) * refiTermAdj : 0;

  const lookupZip = async () => {
    const clean = zip.replace(/[^0-9]/g, '');
    if (clean.length !== 5) {
      setZipError('Enter a valid 5-digit ZIP code.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.selectionAsync();
    setZipLoading(true);
    setZipError('');
    setZipInfo(null);
    try {
      const info = await lookupTaxByZip(clean);
      setZipInfo(info);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setZipError("Couldn't find that ZIP code. Check it and try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setZipLoading(false);
  };

  const applyEstimatedClosing = () => {
    if (estRefiClosing <= 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCosts(String(Math.round(estRefiClosing)));
  };

  const analyze = () => {
    if (validationError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Check Your Inputs', validationError);
      return;
    }

    Haptics.notificationAsync(
      worthIt ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    );
    setAnalyzed(true);
    setSaved(false);
  };

  const verdictTitle =
    monthlySavings <= 0
      ? 'Not Worth It'
      : !savesLifetime
        ? 'Not Worth It Long-Term'
        : strongYes
          ? 'Refinancing Is Worth It'
          : 'Worth It — But Slow to Pay Off';

  const verdictSub =
    monthlySavings <= 0
      ? 'The new loan raises your monthly payment.'
      : !savesLifetime
        ? `Over the life of the loan you'd lose ${fmtMoney(Math.abs(lifetimeSavings))} after closing costs.`
        : strongYes
          ? `You save ${fmtMoney(lifetimeSavings)} over the loan and break even in ${breakEven.toFixed(1)} months.`
          : `You save ${fmtMoney(lifetimeSavings)} lifetime, but it takes ${breakEven.toFixed(1)} months to break even.`;

  const saveAnalysis = async () => {
    if (validationError) {
      Alert.alert('Check Your Inputs', validationError);
      return;
    }

    try {
      await addSavedScenario({
        type: SCENARIO_TYPES.HOME_REFINANCE,
        name: name.trim() || 'Home Refinance',
        inputs: { balance, curRate, origYears, curYears, newRate, newTerm, costs, zip },
        results: {
          balance: balN,
          curRate: num(curRate),
          newRate: num(newRate),
          origYears: origYearsN,
          yearsLeft: yearsLeftN,
          monthlySavings,
          breakEven,
          lifetimeSavings,
          worthIt,
        },
      });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Unable to save refinance analysis:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Unable to Save',
        'Your refinance analysis could not be saved. Please try again.',
      );
    }
  };

  const revealSaveField = useCallback(() => {
    const scrollToSave = () => scrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(scrollToSave);
    setTimeout(scrollToSave, 280);
  }, []);

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Refinance Analyzer"
        subtitle="Compare the cost of a new mortgage"
        icon="home-outline"
        variant="financial"
        onIconPress={() => navigation.navigate('Home')}
        iconAccessibilityLabel="Return to home"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <ValidationBanner message={validationError} />
          <Text style={styles.sectionTitle}>Current Mortgage</Text>
          <View style={styles.sectionCard}>
            <InputField
              label="Remaining Balance"
              value={balance}
              onChangeText={setBalance}
              prefix="$"
            />
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Current Rate"
                  value={curRate}
                  onChangeText={setCurRate}
                  suffix="%"
                  accentColor={COLORS.red}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <InputField
                  label="Original Term"
                  value={origYears}
                  onChangeText={setOrigYears}
                  suffix="yr"
                  accentColor={COLORS.pink}
                />
              </View>
            </View>
            <InputField
              label="Years Left"
              value={curYears}
              onChangeText={setCurYears}
              suffix="yr"
              accentColor={COLORS.teal}
            />
            <View style={styles.hintRow}>
              <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
              <Text style={styles.hintText}>
                We rebuild the remaining amortization schedule from your original loan terms.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>New Loan Offer</Text>
          <View style={styles.sectionCard}>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="New Rate"
                  value={newRate}
                  onChangeText={setNewRate}
                  suffix="%"
                  accentColor={COLORS.green}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <InputField
                  label="New Term"
                  value={newTerm}
                  onChangeText={setNewTerm}
                  suffix="yr"
                  accentColor={COLORS.purple}
                />
              </View>
            </View>
            <InputField
              label="Closing Costs"
              value={costs}
              onChangeText={setCosts}
              prefix="$"
              accentColor={COLORS.amber}
            />

            {/* ---------------- OPTIONAL: ZIP CLOSING COST ESTIMATOR ---------------- */}
            <View style={styles.zipCard}>
              <View style={styles.zipHead}>
                <View style={[styles.zipIcon, { backgroundColor: COLORS.teal + '22' }]}>
                  <Ionicons name="location" size={18} color={COLORS.teal} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.zipTitle}>
                    Estimate closing costs by ZIP <Text style={styles.optional}>(optional)</Text>
                  </Text>
                  <Text style={styles.zipSub}>
                    Enter your ZIP and we'll estimate the closing costs for your new refinance loan
                    using local, county and state fee data.
                  </Text>
                </View>
              </View>

              <View style={styles.zipInputRow}>
                <View style={styles.zipInputWrap}>
                  <Ionicons
                    name="pin"
                    size={16}
                    color={COLORS.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={styles.zipInput}
                    value={zip}
                    onChangeText={(t) => setZip(t.replace(/[^0-9]/g, '').slice(0, 5))}
                    placeholder="e.g. 78701"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.zipBtn, zipLoading && { opacity: 0.7 }]}
                  activeOpacity={0.9}
                  onPress={lookupZip}
                  disabled={zipLoading}
                >
                  {zipLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="search" size={16} color="#fff" />
                      <Text style={styles.zipBtnText}>Look up</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {zipError ? (
                <View style={styles.zipErrorRow}>
                  <Ionicons name="alert-circle" size={15} color={COLORS.red} />
                  <Text style={styles.zipErrorText}>{zipError}</Text>
                </View>
              ) : null}

              {zipInfo ? (
                <View style={styles.zipResult}>
                  <View style={styles.zipResultHead}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
                    <Text style={styles.zipResultPlace}>
                      {zipInfo.city}
                      {zipInfo.countyDisplay ? ` · ${zipInfo.countyDisplay}` : ''}
                      {`, ${zipInfo.stateCode}`}
                    </Text>
                  </View>

                  <View style={styles.closingCard}>
                    <View style={styles.closingHead}>
                      <View style={[styles.closingIcon, { backgroundColor: COLORS.purple + '22' }]}>
                        <Ionicons name="document-text" size={16} color={COLORS.purple} />
                      </View>
                      <Text style={styles.closingLabel}>Est. Refinance Closing Costs</Text>
                      <Text style={[styles.closingValue, { color: COLORS.purple }]}>
                        {fmtMoney(estRefiClosing)}
                      </Text>
                    </View>
                    <Text style={styles.closingNote}>
                      ~{(refiClosingRate * refiTermAdj).toFixed(1)}% of your {fmtMoney(balN)}{' '}
                      balance · based on {zipInfo.state} refinance fees, {newTermN}yr new term.
                      Refinances typically avoid transfer taxes, so costs run lower than a purchase.
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.applyBtn}
                    activeOpacity={0.9}
                    onPress={applyEstimatedClosing}
                  >
                    <Ionicons name="download" size={16} color="#fff" />
                    <Text style={styles.applyText}>Use this as my closing costs</Text>
                  </TouchableOpacity>
                  <Text style={styles.zipDisclaimer}>
                    Estimate blends local, county and {zipInfo.state} state fee data. Actual lender
                    quotes vary — you can override the value above.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <TouchableOpacity style={styles.analyzeBtn} activeOpacity={0.9} onPress={analyze}>
            <Ionicons name="analytics" size={20} color="#fff" />
            <Text style={styles.analyzeText}>Analyze Refinance</Text>
          </TouchableOpacity>

          {analyzed && !validationError ? (
            <>
              <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>
                Refinance Analysis
              </Text>
              <View
                style={[
                  styles.verdict,
                  {
                    backgroundColor: (worthIt ? COLORS.green : COLORS.red) + '18',
                    borderColor: (worthIt ? COLORS.green : COLORS.red) + '44',
                  },
                ]}
              >
                <Ionicons
                  name={worthIt ? 'checkmark-circle' : 'close-circle'}
                  size={34}
                  color={worthIt ? COLORS.green : COLORS.red}
                />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text
                    style={[styles.verdictTitle, { color: worthIt ? COLORS.green : COLORS.red }]}
                  >
                    {verdictTitle}
                  </Text>
                  <Text style={styles.verdictSub}>{verdictSub}</Text>
                </View>
              </View>

              {/* Lifetime savings highlight — the primary decision factor */}
              <View
                style={[
                  styles.lifetimeCard,
                  {
                    borderColor: (savesLifetime ? COLORS.green : COLORS.red) + '44',
                    backgroundColor: (savesLifetime ? COLORS.green : COLORS.red) + '12',
                  },
                ]}
              >
                <View style={styles.lifetimeHead}>
                  <View
                    style={[
                      styles.lifetimeIcon,
                      { backgroundColor: (savesLifetime ? COLORS.green : COLORS.red) + '22' },
                    ]}
                  >
                    <Ionicons
                      name={savesLifetime ? 'trending-up' : 'trending-down'}
                      size={22}
                      color={savesLifetime ? COLORS.green : COLORS.red}
                    />
                  </View>
                  <Text style={styles.lifetimeLabel}>Lifetime Savings (after costs)</Text>
                </View>
                <Text
                  style={[
                    styles.lifetimeValue,
                    { color: savesLifetime ? COLORS.green : COLORS.red },
                  ]}
                >
                  {lifetimeSavings >= 0
                    ? fmtMoney(lifetimeSavings)
                    : `-${fmtMoney(Math.abs(lifetimeSavings))}`}
                </Text>
                <Text style={styles.lifetimeSub}>
                  Total interest saved over the loan minus your {fmtMoney(closingCosts)} in closing
                  costs.
                </Text>
              </View>

              <View style={styles.compareCard}>
                <View style={styles.compareCol}>
                  <Text style={styles.compareHead}>Current</Text>
                  <Text style={[styles.comparePay, { color: COLORS.red }]}>{fmtMoney(curPay)}</Text>
                  <Text style={styles.compareRate}>{num(curRate).toFixed(2)}% / mo P&I</Text>
                </View>
                <Ionicons name="arrow-forward" size={22} color={COLORS.textMuted} />
                <View style={styles.compareCol}>
                  <Text style={styles.compareHead}>New</Text>
                  <Text style={[styles.comparePay, { color: COLORS.green }]}>
                    {fmtMoney(newPay)}
                  </Text>
                  <Text style={styles.compareRate}>{num(newRate).toFixed(2)}% / mo P&I</Text>
                </View>
              </View>

              <View style={styles.metricsCard}>
                <MetricRow
                  label="Monthly Savings"
                  value={
                    monthlySavings > 0
                      ? fmtMoney(monthlySavings)
                      : `-${fmtMoney(Math.abs(monthlySavings))}`
                  }
                  color={monthlySavings > 0 ? COLORS.green : COLORS.red}
                />
                <MetricRow
                  label="Break-even Point"
                  value={isFinite(breakEven) ? `${breakEven.toFixed(1)} months` : 'Never'}
                  color={COLORS.amber}
                />
                <MetricRow
                  label="Interest Left (Current)"
                  value={curAm ? fmtMoney(curAm.totalInterest) : '—'}
                  color={COLORS.red}
                />
                <MetricRow
                  label="Interest (New Loan)"
                  value={newAm ? fmtMoney(newAm.totalInterest) : '—'}
                  color={COLORS.teal}
                />
                <MetricRow
                  label="Closing Costs"
                  value={fmtMoney(closingCosts)}
                  color={COLORS.textPrimary}
                />
                <MetricRow
                  label="Lifetime Savings"
                  value={
                    lifetimeSavings >= 0
                      ? fmtMoney(lifetimeSavings)
                      : `-${fmtMoney(Math.abs(lifetimeSavings))}`
                  }
                  color={lifetimeSavings >= 0 ? COLORS.green : COLORS.red}
                  last
                />
              </View>

              <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>
                {saved ? 'Analysis Saved' : 'Save This Analysis for Later'}
              </Text>
              <View style={styles.actionCard}>
                {!saved ? (
                  <View>
                    <Text style={styles.nameLabel}>Analysis name</Text>
                    <TextInput
                      style={styles.nameInput}
                      value={name}
                      onChangeText={setName}
                      onFocus={revealSaveField}
                      placeholder="e.g. Oak Ave Refi"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.saveBtn, saved && styles.savedBtn]}
                  activeOpacity={0.9}
                  onPress={saveAnalysis}
                  disabled={saved}
                  accessibilityRole="button"
                >
                  <Ionicons name={saved ? 'checkmark-circle' : 'bookmark'} size={18} color="#fff" />
                  <Text style={styles.saveText}>
                    {saved ? 'Saved to your list' : 'Save Analysis'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function MetricRow({ label, value, color, last }) {
  return (
    <View style={[styles.metricRow, !last && styles.metricBorder]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 11,
    marginTop: 7,
  },
  laterSectionTitle: { marginTop: 24 },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  optional: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  rowInputs: { flexDirection: 'row' },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: -2,
    paddingHorizontal: 2,
  },
  hintText: { color: COLORS.textMuted, fontSize: 12, flex: 1, fontWeight: '500', lineHeight: 17 },
  zipCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
  },
  zipHead: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  zipIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zipTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  zipSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 17,
  },
  zipInputRow: { flexDirection: 'row', gap: 10 },
  zipInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    height: 50,
  },
  zipInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  zipBtn: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: COLORS.teal,
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 108,
  },
  zipBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  zipErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  zipErrorText: { color: COLORS.red, fontSize: 12, fontWeight: '600', flex: 1 },
  zipResult: {
    marginTop: 16,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  zipResultHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  zipResultPlace: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800', flex: 1 },
  closingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  closingHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  closingIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closingLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', flex: 1 },
  closingValue: { fontSize: 18, fontWeight: '900' },
  closingNote: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 15,
  },
  applyBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  applyText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  zipDisclaimer: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 10,
    lineHeight: 15,
  },
  analyzeBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  analyzeText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
  },
  verdictTitle: { fontSize: 17, fontWeight: '800' },
  verdictSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 4,
    fontWeight: '500',
    lineHeight: 18,
  },
  lifetimeCard: {
    borderRadius: 18,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
  },
  lifetimeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lifetimeIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lifetimeLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', flex: 1 },
  lifetimeValue: { fontSize: 34, fontWeight: '900', marginTop: 12, letterSpacing: -1 },
  lifetimeSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    lineHeight: 17,
  },
  compareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  compareCol: { alignItems: 'center', flex: 1 },
  compareHead: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  comparePay: { fontSize: 24, fontWeight: '900', marginVertical: 4 },
  compareRate: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  metricsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    paddingHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16 },
  metricBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  metricLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  metricValue: { fontSize: 16, fontWeight: '800' },
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
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 50,
    paddingHorizontal: 14,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  savedBtn: { backgroundColor: COLORS.green, marginTop: 0 },
  saveBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
