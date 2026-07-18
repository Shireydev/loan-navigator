import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import GradientHeader from '../components/GradientHeader';
import InputField, { ValidationBanner } from '../components/InputField';
import {
  COLORS,
  monthlyPI,
  amortize,
  amortizeWithPayment,
  fmtMoney,
  formatInputWithCommas,
  parseLoanNumber,
  originalLoanFromRemainingBalance,
  remainingBalanceFromOriginal,
  validateRefinanceScenario,
} from '../theme';
import { lookupTaxByZip } from '../taxApi';
import { SCENARIO_TYPES } from '../savedScenarios';
import useScrollToTopOnFocus from '../components/useScrollToTopOnFocus';
import { getLatestPayoffLoan } from '../components/mortgageLoanHandoff';

// Given an original loan (balance implied) at a rate, original term, and how many
// years are left, recover the ORIGINAL loan amount so we can build an accurate
// amortization schedule that matches the borrower's true remaining trajectory.
export default function RefinanceScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const appliedPayoffRevision = useRef(0);
  useScrollToTopOnFocus(scrollRef, undefined, 'Refinance');
  const [balance, setBalance] = useState(formatInputWithCommas('500000'));
  const [curRate, setCurRate] = useState('7.25');
  const [origYears, setOrigYears] = useState('30');
  const [curYears, setCurYears] = useState('27');
  const [manualBalance, setManualBalance] = useState(null);
  const [newRate, setNewRate] = useState('6.00');
  const [newTerm, setNewTerm] = useState('30');
  const [costs, setCosts] = useState(formatInputWithCommas('10000'));
  const [name, setName] = useState('');

  // ZIP-based closing cost estimator for the NEW loan.
  const [zip, setZip] = useState('');
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState('');
  const [zipInfo, setZipInfo] = useState(null);
  const [accuracyExpanded, setAccuracyExpanded] = useState(false);

  // Selecting the bottom Refinance tab after editing Payoff should begin with
  // that current loan. Each published payoff revision is applied only once so
  // returning from results or another tab does not wipe refinance edits.
  useFocusEffect(
    useCallback(() => {
      const handoff = getLatestPayoffLoan();
      if (!handoff || handoff.revision <= appliedPayoffRevision.current) return;

      // Explicit navigation payloads (saved scenarios and the handoff card)
      // take precedence over the passive bottom-tab handoff.
      if (route.params?.restore || route.params?.prefill) {
        appliedPayoffRevision.current = handoff.revision;
        return;
      }

      const i = handoff.details;
      setBalance(i.originalLoan ?? formatInputWithCommas('500000'));
      setCurRate(i.curRate ?? '7.25');
      setOrigYears(i.origYears ?? '30');
      setCurYears(i.curYears ?? '27');
      setManualBalance(null);
      setNewTerm(i.curYears ?? '30');
      setZip(i.zip ?? '');
      setZipError('');
      setZipInfo(null);
      setAccuracyExpanded(false);
      setName(i.name ? `${i.name} Refinance` : '');
      appliedPayoffRevision.current = handoff.revision;
    }, [route.params?.prefill, route.params?.restore]),
  );

  // Restore a saved refinance analysis from the Saved tab.
  useEffect(() => {
    const rItem = route.params?.restore;
    if (rItem && rItem.type === SCENARIO_TYPES.HOME_REFINANCE && rItem.inputs) {
      const i = rItem.inputs;
      let restoredOriginalLoan = i.originalLoan;
      setManualBalance(null);

      // Older saved refinance scenarios stored the current remaining balance.
      // Recover the original principal before loading those scenarios into the
      // updated original-loan workflow.
      if (restoredOriginalLoan == null && i.balance != null) {
        const legacyBalance = parseLoanNumber(i.balance);
        const legacyRate = parseLoanNumber(i.curRate);
        const legacyOriginalYears = parseLoanNumber(i.origYears);
        const legacyYearsLeft = parseLoanNumber(i.curYears);
        if (
          Number.isFinite(legacyBalance) &&
          Number.isFinite(legacyRate) &&
          Number.isFinite(legacyOriginalYears) &&
          Number.isFinite(legacyYearsLeft)
        ) {
          restoredOriginalLoan = originalLoanFromRemainingBalance(
            legacyBalance,
            legacyRate,
            legacyOriginalYears * 12,
            legacyYearsLeft * 12,
          ).originalPrincipal;
          setManualBalance(formatInputWithCommas(String(Math.round(legacyBalance))));
        }
      } else if (i.balanceAdjusted && i.currentBalance != null) {
        const restoredCurrentBalance = parseLoanNumber(i.currentBalance);
        setManualBalance(
          Number.isFinite(restoredCurrentBalance)
            ? formatInputWithCommas(String(Math.round(restoredCurrentBalance)))
            : null,
        );
      }

      const restoredOriginalN = parseLoanNumber(restoredOriginalLoan);
      setBalance(
        Number.isFinite(restoredOriginalN)
          ? formatInputWithCommas(String(Math.round(restoredOriginalN)))
          : formatInputWithCommas('500000'),
      );
      setCurRate(i.curRate ?? '7.25');
      setOrigYears(i.origYears ?? '30');
      setCurYears(i.curYears ?? '27');
      setNewRate(i.newRate ?? '6.00');
      setNewTerm(i.newTerm ?? '30');
      const restoredCostsN = parseLoanNumber(i.costs);
      setCosts(
        Number.isFinite(restoredCostsN)
          ? formatInputWithCommas(String(Math.round(restoredCostsN)))
          : formatInputWithCommas('10000'),
      );
      if (i.zip) setZip(i.zip);
      setName(rItem.name || '');
      navigation.setParams({ restore: undefined });
    }
  }, [navigation, route.params?.restore, route.params?.ts]);

  // Start a refinance comparison from the payoff calculator's current loan
  // details while keeping the new-loan offer editable.
  useEffect(() => {
    const i = route.params?.prefill;
    if (!i) return;

    setBalance(i.originalLoan ?? formatInputWithCommas('500000'));
    setCurRate(i.curRate ?? '7.25');
    setOrigYears(i.origYears ?? '30');
    setCurYears(i.curYears ?? '27');
    setManualBalance(null);
    setNewRate(i.newRate ?? '6.00');
    setNewTerm(i.newTerm ?? i.curYears ?? '30');
    setCosts(i.costs ?? formatInputWithCommas('10000'));
    setZip(i.zip ?? '');
    setZipError('');
    setZipInfo(null);
    setAccuracyExpanded(false);
    setName(i.name ?? '');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    navigation.setParams({ prefill: undefined });
  }, [navigation, route.params?.prefill, route.params?.ts]);

  const num = parseLoanNumber;
  const originalLoanN = num(balance);
  const origYearsN = num(origYears);
  const yearsLeftN = num(curYears);
  const newTermN = num(newTerm);
  const baseValidationError = validateRefinanceScenario({
    balance: originalLoanN,
    balanceLabel: 'Original loan amount',
    currentRate: num(curRate),
    originalTerm: origYearsN,
    remainingTerm: yearsLeftN,
    newRate: num(newRate),
    newTerm: newTermN,
    costs: num(costs),
    termLabel: 'term',
    maxTerm: 50,
  });

  const estimatedBalance = !baseValidationError
    ? remainingBalanceFromOriginal(originalLoanN, num(curRate), origYearsN * 12, yearsLeftN * 12)
    : 0;
  const manualBalanceN = manualBalance == null ? NaN : num(manualBalance);
  const currentBalance = manualBalance == null ? estimatedBalance : manualBalanceN;
  const balanceValidationError =
    manualBalance != null && (!Number.isFinite(manualBalanceN) || manualBalanceN <= 0)
      ? 'Estimated balance remaining must be a valid amount greater than 0.'
      : manualBalance != null && manualBalanceN > estimatedBalance
        ? 'Estimated balance remaining cannot exceed the calculated estimate.'
        : null;
  const validationError = baseValidationError || balanceValidationError;
  const displayedBalance =
    manualBalance ??
    (estimatedBalance > 0 ? formatInputWithCommas(String(Math.round(estimatedBalance))) : '');
  const curPay = !validationError ? monthlyPI(originalLoanN, num(curRate), origYearsN) : 0;

  const newPay =
    !validationError && currentBalance > 0 ? monthlyPI(currentBalance, num(newRate), newTermN) : 0;
  const monthlySavings = curPay - newPay;
  const closingCosts = validationError ? 0 : num(costs);
  const breakEven = monthlySavings > 0 ? closingCosts / monthlySavings : Infinity;

  const curAm =
    !validationError && currentBalance > 0
      ? amortizeWithPayment(currentBalance, num(curRate), curPay)
      : null;
  const newAm =
    !validationError && currentBalance > 0
      ? amortize(currentBalance, num(newRate), newTermN, 0)
      : null;
  const lifetimeSavings =
    curAm && newAm ? curAm.totalInterest - newAm.totalInterest - closingCosts : 0;

  const savesLifetime = lifetimeSavings > 0;
  const worthIt = savesLifetime;
  const currentPayoffMonths = curAm?.months ?? Math.round(yearsLeftN * 12);
  const newPayoffMonths = newAm?.months ?? Math.round(newTermN * 12);

  // ---- ZIP-based closing cost estimate for the NEW refinance loan ----
  // Refinances have lower closing costs than a purchase (no transfer tax /
  // owner's title in most cases), so we apply a ~65% factor to the state
  // purchase closing rate, then scale by the refinanced balance.
  const refiClosingRate = zipInfo ? zipInfo.closingRate * 0.65 : null;
  // Longer new terms mean slightly higher origination as a share; short terms
  // carry a bump too. Baseline at 30yr.
  const refiTermAdj = newTermN <= 15 ? 1.06 : newTermN <= 20 ? 1.03 : 1.0;
  const estRefiClosing =
    !validationError && zipInfo && currentBalance > 0
      ? currentBalance * (refiClosingRate / 100) * refiTermAdj
      : 0;

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
    setCosts(formatInputWithCommas(String(Math.round(estRefiClosing))));
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
    navigation.navigate('RefinanceResult', {
      currentBalance,
      originalLoan: originalLoanN,
      currentRate: num(curRate),
      newRate: num(newRate),
      originalTerm: origYearsN,
      yearsLeft: yearsLeftN,
      newTerm: newTermN,
      currentPayment: curPay,
      newPayment: newPay,
      monthlySavings,
      breakEven,
      currentInterest: curAm?.totalInterest ?? 0,
      newInterest: newAm?.totalInterest ?? 0,
      closingCosts,
      lifetimeSavings,
      currentPayoffMonths,
      newPayoffMonths,
      inputs: {
        originalLoan: balance,
        currentBalance: formatInputWithCommas(String(Math.round(currentBalance))),
        balanceAdjusted: manualBalance != null,
        curRate,
        origYears,
        curYears,
        newRate,
        newTerm,
        costs,
        zip,
      },
      presetName: name,
    });
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Refinance Analyzer"
        subtitle="Compare the cost of a new mortgage"
        icon="home-outline"
        variant="financial"
        onIconPress={() => navigation.getParent()?.navigate('Home')}
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
            <View style={styles.rowInputs}>
              <View style={styles.loanAmountInput}>
                <InputField
                  label="Original Loan Amount"
                  value={balance}
                  onChangeText={(value) => {
                    setBalance(value);
                    setManualBalance(null);
                  }}
                  prefix="$"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={styles.currentRateInput}>
                <InputField
                  label="Current Rate"
                  value={curRate}
                  onChangeText={(value) => {
                    setCurRate(value);
                    setManualBalance(null);
                  }}
                  suffix="%"
                  accentColor={COLORS.red}
                />
              </View>
            </View>
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Original Term"
                  value={origYears}
                  onChangeText={(value) => {
                    setOrigYears(value);
                    setManualBalance(null);
                  }}
                  suffix="yr"
                  accentColor={COLORS.pink}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <InputField
                  label="Years Remaining"
                  value={curYears}
                  onChangeText={(value) => {
                    setCurYears(value);
                    setManualBalance(null);
                  }}
                  suffix="yr"
                  accentColor={COLORS.teal}
                />
              </View>
            </View>
            <InputField
              label="Estimated Balance Remaining"
              value={displayedBalance}
              onChangeText={setManualBalance}
              prefix="$"
              accentColor={COLORS.accent}
            />
            <View style={styles.hintRow}>
              <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
              <Text style={styles.hintText}>
                This estimate assumes only the minimum scheduled payments were made. Change it only
                if you made additional payments toward principal.
              </Text>
            </View>
            {manualBalance != null ? (
              <TouchableOpacity
                style={styles.resetEstimateBtn}
                onPress={() => setManualBalance(null)}
                accessibilityRole="button"
                accessibilityLabel="Use calculated balance estimate"
              >
                <Ionicons name="refresh" size={15} color={COLORS.accent} />
                <Text style={styles.resetEstimateText}>Use calculated estimate</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Improve Accuracy</Text>
          <View style={styles.zipCard}>
            <TouchableOpacity
              style={styles.accuracyHead}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={{ expanded: accuracyExpanded }}
              onPress={() => {
                Haptics.selectionAsync();
                setAccuracyExpanded((current) => !current);
              }}
            >
              <View style={[styles.zipIcon, { backgroundColor: COLORS.teal + '22' }]}>
                <Ionicons name="location" size={18} color={COLORS.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.zipTitle}>
                  {zipInfo ? 'Closing-cost estimate ready' : 'Use ZIP for a closing-cost estimate'}
                </Text>
                <Text style={styles.zipSub}>
                  {zipInfo
                    ? `${zipInfo.city}, ${zipInfo.stateCode} · estimated ${fmtMoney(estRefiClosing)}`
                    : zip
                      ? `ZIP ${zip} saved · tap to refresh the estimate.`
                      : 'Estimate costs using the refinance balance, new term, and location.'}
                </Text>
              </View>
              <Ionicons
                name={accuracyExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            {accuracyExpanded ? (
              <View style={styles.accuracyBody}>
                <View style={styles.zipInputRow}>
                  <View style={styles.zipInputWrap}>
                    <Ionicons name="pin" size={16} color={COLORS.textMuted} />
                    <TextInput
                      style={styles.zipInput}
                      value={zip}
                      onChangeText={(value) => {
                        setZip(value.replace(/[^0-9]/g, '').slice(0, 5));
                        setZipError('');
                        setZipInfo(null);
                      }}
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
                        <View
                          style={[styles.closingIcon, { backgroundColor: COLORS.purple + '22' }]}
                        >
                          <Ionicons name="document-text" size={16} color={COLORS.purple} />
                        </View>
                        <Text style={styles.closingLabel}>Est. Refinance Closing Costs</Text>
                        <Text style={[styles.closingValue, { color: COLORS.purple }]}>
                          {fmtMoney(estRefiClosing)}
                        </Text>
                      </View>
                      <Text style={styles.closingNote}>
                        ~{(refiClosingRate * refiTermAdj).toFixed(1)}% of your{' '}
                        {fmtMoney(currentBalance)} balance · based on {zipInfo.state} refinance fees
                        and a {newTermN}-year new term.
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.applyBtn}
                      activeOpacity={0.9}
                      onPress={applyEstimatedClosing}
                    >
                      <Ionicons name="download" size={16} color="#fff" />
                      <Text style={styles.applyText}>Apply to New Loan Offer</Text>
                    </TouchableOpacity>
                    <Text style={styles.zipDisclaimer}>
                      This is a planning estimate. Apply it to the offer below, then replace it with
                      your lender quote whenever available.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
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
          </View>

          <TouchableOpacity style={styles.analyzeBtn} activeOpacity={0.9} onPress={analyze}>
            <Ionicons name="analytics" size={20} color="#fff" />
            <Text style={styles.analyzeText}>Analyze Refinance</Text>
          </TouchableOpacity>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  rowInputs: { flexDirection: 'row' },
  loanAmountInput: { flex: 1.7 },
  currentRateInput: { flex: 0.8 },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 0,
    paddingHorizontal: 2,
  },
  hintText: { color: COLORS.textMuted, fontSize: 12, flex: 1, fontWeight: '500', lineHeight: 17 },
  resetEstimateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  resetEstimateText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  zipCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  accuracyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accuracyBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 14,
    paddingTop: 14,
  },
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
    gap: 8,
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
});
