import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import GradientHeader from '../components/GradientHeader';
import InputField, { ValidationBanner } from '../components/InputField';
import StatCard from '../components/StatCard';
import BalanceLineChart from '../components/BalanceLineChart';
import {
  COLORS,
  monthlyPI,
  amortize,
  amortizeWithPayment,
  fmtMoney,
  parseLoanNumber,
  remainingBalanceFromOriginal,
  validateAutoPurchase,
  validatePayoffScenario,
  validateRefinanceScenario,
} from '../theme';
import { addSavedScenario, SCENARIO_TYPES } from '../savedScenarios';

const MODES = [
  { key: 'purchase', label: 'Purchase', icon: 'car-sport' },
  { key: 'payoff', label: 'Payoff', icon: 'trending-down' },
  { key: 'refinance', label: 'Refinance', icon: 'swap-horizontal' },
];

const TERMS = [36, 48, 60, 72, 84];
const PRESETS = [50, 100, 150, 250];
const LUMP_PRESETS = [1000, 2500, 5000, 10000];

export default function CarScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const scrollRef = useRef(null);
  const [mode, setMode] = useState('purchase');
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('');

  // Purchase state
  const [price, setPrice] = useState('50,000');
  const [down, setDown] = useState('5,000');
  const [trade, setTrade] = useState('0');
  const [salesTax, setSalesTax] = useState('7');
  const [rate, setRate] = useState('6.90');
  const [term, setTerm] = useState(60);

  // Payoff state
  const [pBalance, setPBalance] = useState('25,000');
  const [pRate, setPRate] = useState('6.90');
  const [pOriginalTerm, setPOriginalTerm] = useState('60');
  const [pMonths, setPMonths] = useState('42');
  const [pExtra, setPExtra] = useState('100');
  const [pLump, setPLump] = useState('0');

  // Refinance state
  const [rBalance, setRBalance] = useState('22,000');
  const [rCurRate, setRCurRate] = useState('9.50');
  const [rOriginalTerm, setROriginalTerm] = useState('84');
  const [rMonths, setRMonths] = useState('42');
  const [rNewRate, setRNewRate] = useState('6.00');
  const [rNewTerm, setRNewTerm] = useState('48');
  const [rFees, setRFees] = useState('300');

  const num = parseLoanNumber;

  // Jump to a specific mode when arriving from the landing page.
  useEffect(() => {
    const lm = route.params?.landingMode;
    if (lm && ['purchase', 'payoff', 'refinance'].includes(lm)) {
      setMode(lm);
      setSaved(false);
      setName('');
      navigation.setParams({ landingMode: undefined });
    }
  }, [navigation, route.params?.landingMode, route.params?.ts]);

  // Restore a saved car estimate from the Saved tab.
  useEffect(() => {
    const item = route.params?.restore;
    if (!item || !item.inputs) return;
    if (item.type === SCENARIO_TYPES.AUTO_PURCHASE) {
      const i = item.inputs;
      setMode('purchase');
      setPrice(i.price ?? '38,000');
      setDown(i.down ?? '5,000');
      setTrade(i.trade ?? '0');
      setSalesTax(i.salesTax ?? '7');
      setRate(i.rate ?? '6.90');
      setTerm(i.term ?? 60);
      setName(item.name || '');
      setSaved(false);
    } else if (item.type === SCENARIO_TYPES.AUTO_PAYOFF) {
      const i = item.inputs;
      setMode('payoff');
      setPBalance(i.pBalance ?? '25,000');
      setPRate(i.pRate ?? '6.90');
      setPOriginalTerm(i.pOriginalTerm ?? '60');
      setPMonths(i.pMonths ?? '42');
      setPExtra(i.pExtra ?? '100');
      setPLump(i.pLump ?? '0');
      setName(item.name || '');
      setSaved(false);
    } else if (item.type === SCENARIO_TYPES.AUTO_REFINANCE) {
      const i = item.inputs;
      setMode('refinance');
      setRBalance(i.rBalance ?? '22,000');
      setRCurRate(i.rCurRate ?? '9.50');
      setROriginalTerm(i.rOriginalTerm ?? '84');
      setRMonths(i.rMonths ?? '42');
      setRNewRate(i.rNewRate ?? '6.00');
      setRNewTerm(i.rNewTerm ?? '48');
      setRFees(i.rFees ?? '300');
      setName(item.name || '');
      setSaved(false);
    }
    navigation.setParams({ restore: undefined });
  }, [navigation, route.params?.restore, route.params?.ts]);

  const setModeHaptic = (m) => {
    Haptics.selectionAsync();
    setMode(m);
    setSaved(false);
    setName('');
  };

  // Allow each changed combination to be saved as a separate scenario.
  useEffect(() => {
    setSaved(false);
  }, [
    mode,
    price,
    down,
    trade,
    salesTax,
    rate,
    term,
    pBalance,
    pRate,
    pOriginalTerm,
    pMonths,
    pExtra,
    pLump,
    rBalance,
    rCurRate,
    rOriginalTerm,
    rMonths,
    rNewRate,
    rNewTerm,
    rFees,
  ]);

  // ---- Purchase calcs ----
  // Trade-in value is subtracted from the vehicle price BEFORE sales tax is
  // applied (most states tax the net price after trade-in credit).
  const priceN = num(price);
  const downN = num(down);
  const tradeN = num(trade);
  const salesTaxN = num(salesTax);
  const rateN = num(rate);
  const purchaseValidationError = validateAutoPurchase({
    price: priceN,
    down: downN,
    trade: tradeN,
    salesTax: salesTaxN,
    rate: rateN,
    termMonths: term,
  });
  const taxableAmount = purchaseValidationError ? 0 : Math.max(priceN - tradeN, 0);
  const taxAmt = purchaseValidationError ? 0 : taxableAmount * (salesTaxN / 100);
  const amountFinanced = purchaseValidationError ? 0 : Math.max(taxableAmount + taxAmt - downN, 0);
  const carPay = amountFinanced > 0 ? monthlyPI(amountFinanced, rateN, term / 12) : 0;
  const purAm = amountFinanced > 0 ? amortize(amountFinanced, rateN, term / 12, 0) : null;
  const totalCost = purAm ? downN + tradeN + amountFinanced + purAm.totalInterest : 0;

  // ---- Payoff calcs ----
  const pOriginalLoanN = num(pBalance);
  const pOriginalTermN = num(pOriginalTerm);
  const pMonthsN = num(pMonths);
  const pRateN = num(pRate);
  const pExtraN = num(pExtra);
  const pLumpN = num(pLump);

  const pBaseValidationError = validatePayoffScenario({
    originalLoan: pOriginalLoanN,
    rate: pRateN,
    originalTerm: pOriginalTermN,
    remainingTerm: pMonthsN,
    extra: pExtraN,
    lump: pLumpN,
    termLabel: 'months',
    maxTerm: 120,
    wholeTerms: true,
  });
  const pScheduledPay = pBaseValidationError
    ? 0
    : monthlyPI(pOriginalLoanN, pRateN, pOriginalTermN / 12);
  const pBalN = pBaseValidationError
    ? 0
    : remainingBalanceFromOriginal(pOriginalLoanN, pRateN, pOriginalTermN, pMonthsN);
  const pValidationError =
    pBaseValidationError ||
    validatePayoffScenario({
      originalLoan: pOriginalLoanN,
      rate: pRateN,
      originalTerm: pOriginalTermN,
      remainingTerm: pMonthsN,
      extra: pExtraN,
      lump: pLumpN,
      currentBalance: pBalN,
      termLabel: 'months',
      maxTerm: 120,
      wholeTerms: true,
    });

  const pYears = pMonthsN > 0 ? pMonthsN / 12 : 0;

  // Apply the lump sum immediately against the current balance.
  const pBalAfterLump = pValidationError ? 0 : Math.max(pBalN - pLumpN, 0);

  // Normal payoff schedule without extra payments.
  const pBase = pBalN > 0 && pYears > 0 ? amortize(pBalN, pRateN, pYears, 0) : null;

  // Accelerated payoff using the regular scheduled payment,
  // plus the user's extra monthly payment.
  const pWith =
    pBalN > 0
      ? pBalAfterLump <= 0
        ? {
            months: 0,
            totalInterest: 0,
            monthlyPayment: 0,
            schedule: [{ year: 0, balance: 0 }],
          }
        : amortizeWithPayment(pBalAfterLump, pRateN, pScheduledPay + pExtraN)
      : null;

  const pHasAccel = (pExtraN > 0 || pLumpN > 0) && pBalN > 0;

  const pMonthsSaved = pBase && pWith ? Math.max(0, pBase.months - pWith.months) : 0;

  const pInterestSaved =
    pBase && pWith ? Math.max(0, pBase.totalInterest - pWith.totalInterest) : 0;

  // ---- Refinance calcs ----
  const rOriginalLoanN = num(rBalance);
  const rOriginalTermN = num(rOriginalTerm);
  const rMonthsN = num(rMonths);
  const rCurRateN = num(rCurRate);
  const rNewRateN = num(rNewRate);
  const rNewTermN = num(rNewTerm);
  const rFeesN = num(rFees);
  const rValidationError = validateRefinanceScenario({
    balance: rOriginalLoanN,
    currentRate: rCurRateN,
    originalTerm: rOriginalTermN,
    remainingTerm: rMonthsN,
    newRate: rNewRateN,
    newTerm: rNewTermN,
    costs: rFeesN,
    termLabel: 'months',
    maxTerm: 120,
    wholeTerms: true,
  });
  const rBalN = rValidationError
    ? 0
    : remainingBalanceFromOriginal(rOriginalLoanN, rCurRateN, rOriginalTermN, rMonthsN);

  const rCurYears = rMonthsN > 0 ? rMonthsN / 12 : 0;
  const rNewYears = rNewTermN > 0 ? rNewTermN / 12 : 0;

  const rCurPay = rBalN > 0 && rCurYears > 0 ? monthlyPI(rBalN, rCurRateN, rCurYears) : 0;

  const rNewPay = rBalN > 0 && rNewYears > 0 ? monthlyPI(rBalN, rNewRateN, rNewYears) : 0;

  const rMonthlySavings = rCurPay - rNewPay;

  const rCurAm = rBalN > 0 && rCurYears > 0 ? amortize(rBalN, rCurRateN, rCurYears, 0) : null;

  const rNewAm = rBalN > 0 && rNewYears > 0 ? amortize(rBalN, rNewRateN, rNewYears, 0) : null;

  const rLifetime = rCurAm && rNewAm ? rCurAm.totalInterest - rNewAm.totalInterest - rFeesN : 0;

  const rWorthIt = rLifetime > 0;

  const modeValidationError =
    mode === 'purchase'
      ? purchaseValidationError
      : mode === 'payoff'
        ? pValidationError
        : rValidationError;

  const save = async (entry, validationError) => {
    if (validationError) {
      Alert.alert('Check Your Inputs', validationError);
      return;
    }

    try {
      const { type, name: scenarioName, inputs, ...results } = entry;
      await addSavedScenario({ type, name: scenarioName, inputs, results });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Unable to save auto-loan scenario:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Unable to Save',
        'Your auto-loan scenario could not be saved. Please try again.',
      );
    }
  };

  const defaultName =
    mode === 'purchase' ? 'Car Purchase' : mode === 'refinance' ? 'Car Refinance' : 'Car Payoff';

  const revealSaveField = useCallback(() => {
    const scrollToSave = () => scrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(scrollToSave);
    setTimeout(scrollToSave, 280);
  }, []);

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Auto Loan Center"
        subtitle="Plan every stage of your auto loan"
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
          <View style={styles.modeRow}>
            {MODES.map((m) => {
              const active = mode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  activeOpacity={0.85}
                  style={[styles.modeBtn, active && styles.modeBtnActive]}
                  onPress={() => setModeHaptic(m.key)}
                >
                  <Ionicons
                    name={m.icon}
                    size={18}
                    color={active ? '#fff' : COLORS.textSecondary}
                  />
                  <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ValidationBanner message={modeValidationError} />

          {/* ---------------- PURCHASE ---------------- */}
          {mode === 'purchase' ? (
            <>
              <View style={styles.previewCard}>
                <Text style={styles.previewLabel}>Estimated Monthly Payment</Text>
                <Text style={styles.previewValue}>{fmtMoney(carPay)}</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewSub}>Financed: {fmtMoney(amountFinanced)}</Text>
                  <Text style={styles.previewSub}>{term} mo</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Vehicle</Text>
              <View style={styles.sectionCard}>
                <InputField
                  label="Vehicle Price"
                  value={price}
                  onChangeText={setPrice}
                  prefix="$"
                />
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Down Payment"
                      value={down}
                      onChangeText={setDown}
                      prefix="$"
                      accentColor={COLORS.green}
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Trade-in Value"
                      value={trade}
                      onChangeText={setTrade}
                      prefix="$"
                      accentColor={COLORS.teal}
                    />
                  </View>
                </View>
                <InputField
                  label="Sales Tax"
                  value={salesTax}
                  onChangeText={setSalesTax}
                  suffix="%"
                  accentColor={COLORS.amber}
                />
                <View style={styles.hintRow}>
                  <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
                  <Text style={styles.hintText}>
                    Trade-in value is subtracted before sales tax is applied.
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Loan</Text>
              <View style={styles.sectionCard}>
                <InputField
                  label="Interest Rate (APR)"
                  value={rate}
                  onChangeText={setRate}
                  suffix="%"
                  accentColor={COLORS.purple}
                />
                <Text style={styles.label}>Loan Term</Text>
                <View style={styles.termRow}>
                  {TERMS.map((t) => (
                    <TouchableOpacity
                      key={t}
                      activeOpacity={0.8}
                      style={[styles.termBtn, term === t && styles.termBtnActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setTerm(t);
                      }}
                    >
                      <Text style={[styles.termText, term === t && styles.termTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {amountFinanced > 0 && purAm ? (
                <>
                  <Text style={styles.sectionTitle}>Purchase Summary</Text>
                  <View style={styles.statRow}>
                    <StatCard
                      label="Total Interest"
                      value={fmtMoney(purAm.totalInterest)}
                      icon="cash"
                      color={COLORS.red}
                    />
                    <View style={{ width: 12 }} />
                    <StatCard
                      label="Total Cost"
                      value={fmtMoney(totalCost)}
                      icon="pricetag"
                      color={COLORS.accent}
                    />
                  </View>
                  <View style={styles.metricsCard}>
                    <MetricRow
                      label="Taxable Amount"
                      value={fmtMoney(taxableAmount)}
                      color={COLORS.teal}
                    />
                    <MetricRow label="Sales Tax" value={fmtMoney(taxAmt)} color={COLORS.amber} />
                    <MetricRow
                      label="Amount Financed"
                      value={fmtMoney(amountFinanced)}
                      color={COLORS.textPrimary}
                    />
                    <MetricRow
                      label="Total of Payments"
                      value={fmtMoney(purAm.totalPaid)}
                      color={COLORS.textPrimary}
                      last
                    />
                  </View>
                  <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>
                    {saved ? 'Estimate Saved' : 'Save This Estimate for Later'}
                  </Text>
                  <View style={styles.actionCard}>
                    {!saved ? (
                      <NameField
                        value={name}
                        onChangeText={setName}
                        onFocus={revealSaveField}
                        placeholder="e.g. Honda CR-V"
                      />
                    ) : null}
                    <TouchableOpacity
                      style={[styles.saveBtn, saved && styles.savedBtn]}
                      activeOpacity={0.9}
                      onPress={() =>
                        save(
                          {
                            type: SCENARIO_TYPES.AUTO_PURCHASE,
                            name: name.trim() || defaultName,
                            price: priceN,
                            financed: amountFinanced,
                            rate: rateN,
                            term,
                            monthly: carPay,
                            totalInterest: purAm.totalInterest,
                            inputs: { price, down, trade, salesTax, rate, term },
                          },
                          purchaseValidationError,
                        )
                      }
                      disabled={saved}
                    >
                      <Ionicons
                        name={saved ? 'checkmark-circle' : 'bookmark'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.saveText}>
                        {saved ? 'Saved to your list' : 'Save Estimate'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          {/* ---------------- PAYOFF ---------------- */}
          {mode === 'payoff' ? (
            <>
              <Text style={styles.sectionTitle}>Current Auto Loan</Text>
              <View style={styles.sectionCard}>
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Original Loan Amount"
                      value={pBalance}
                      onChangeText={setPBalance}
                      prefix="$"
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Interest Rate"
                      value={pRate}
                      onChangeText={setPRate}
                      suffix="%"
                      accentColor={COLORS.purple}
                    />
                  </View>
                </View>

                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Original Term"
                      value={pOriginalTerm}
                      onChangeText={setPOriginalTerm}
                      suffix="mo"
                      accentColor={COLORS.purple}
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Months Remaining"
                      value={pMonths}
                      onChangeText={setPMonths}
                      suffix="mo"
                      accentColor={COLORS.teal}
                    />
                  </View>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Acceleration Plan</Text>
              <View style={styles.sectionCard}>
                <Text style={styles.planLabel}>Extra Each Month</Text>
                <InputField
                  label="Additional Principal per Month"
                  value={pExtra}
                  onChangeText={setPExtra}
                  prefix="$"
                  accentColor={COLORS.green}
                />
                <View style={styles.presetRow}>
                  {PRESETS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.preset, num(pExtra) === amt && styles.presetActive]}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPExtra(String(amt));
                      }}
                    >
                      <Text
                        style={[styles.presetText, num(pExtra) === amt && styles.presetTextActive]}
                      >
                        +${amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.planDivider} />
                <Text style={styles.planLabel}>One-Time Payment</Text>
                <InputField
                  label="Lump Sum Payment"
                  value={pLump}
                  onChangeText={setPLump}
                  prefix="$"
                  accentColor={COLORS.amber}
                />
                <View style={styles.presetRow}>
                  {LUMP_PRESETS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[styles.presetLump, num(pLump) === amt && styles.presetLumpActive]}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPLump(String(amt));
                      }}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          num(pLump) === amt && styles.presetLumpTextActive,
                        ]}
                      >
                        +${amt >= 1000 ? `${amt / 1000}k` : amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.hintRow}>
                  <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
                  <Text style={styles.hintText}>
                    Use either strategy—or combine both—to compare a faster payoff.
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Projected Impact</Text>
              {pHasAccel && pWith && pBase ? (
                <>
                  <View style={styles.highlightCard}>
                    <Ionicons name="flash" size={26} color={COLORS.green} />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={styles.highlightLabel}>You could save</Text>
                      <Text style={styles.highlightValue}>{fmtMoney(pInterestSaved)}</Text>
                      <Text style={styles.highlightSub}>
                        and be paid off {pMonthsSaved} mo sooner
                      </Text>
                    </View>
                  </View>

                  {pLumpN > 0 ? (
                    <View style={styles.lumpBanner}>
                      <Ionicons name="flash" size={18} color={COLORS.amber} />
                      <Text style={styles.lumpBannerText}>
                        Your {fmtMoney(pLumpN)} lump sum drops the balance to{' '}
                        {fmtMoney(pBalAfterLump)} right away.
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.impactMetrics}>
                    <View style={styles.impactMetric}>
                      <View style={[styles.metricIcon, { backgroundColor: COLORS.teal + '22' }]}>
                        <Ionicons name="time" size={20} color={COLORS.teal} />
                      </View>
                      <Text style={styles.impactValue}>{pWith.months} mo</Text>
                      <Text style={styles.impactLabel}>New Payoff Time</Text>
                      <Text style={[styles.impactSub, { color: COLORS.teal }]}>
                        was {pBase.months} mo
                      </Text>
                    </View>
                    <View style={styles.impactDivider} />
                    <View style={styles.impactMetric}>
                      <View style={[styles.metricIcon, { backgroundColor: COLORS.accent + '22' }]}>
                        <Ionicons name="cash" size={20} color={COLORS.accent} />
                      </View>
                      <Text style={styles.impactValue}>{fmtMoney(pWith.monthlyPayment)}</Text>
                      <Text style={styles.impactLabel}>New Monthly Payment</Text>
                      <Text style={[styles.impactSub, { color: COLORS.accent }]}>
                        {pExtraN > 0 ? `+${fmtMoney(pExtraN)}/mo` : 'same payment'}
                      </Text>
                    </View>
                  </View>
                  {pWith.schedule && pWith.schedule.length > 0 ? (
                    <>
                      <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>
                        Balance Projection
                      </Text>
                      <View style={styles.chartCard}>
                        <Text style={styles.chartSub}>
                          Compare the scheduled balance with your accelerated plan.
                        </Text>
                        <BalanceLineChart
                          schedule={pBase.schedule}
                          compareSchedule={pWith.schedule}
                          color={COLORS.accent}
                          compareColor={COLORS.green}
                        />
                      </View>
                    </>
                  ) : null}
                </>
              ) : !pValidationError ? (
                <View style={styles.emptyHint}>
                  <Ionicons name="bulb" size={22} color={COLORS.amber} />
                  <Text style={styles.emptyText}>
                    Add an extra monthly amount or a one-time lump sum to see how much interest and
                    time you'll save.
                  </Text>
                </View>
              ) : null}

              {pBase && pWith ? (
                <>
                  <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>
                    {saved ? 'Scenario Saved' : 'Save This Scenario for Later'}
                  </Text>
                  <View style={styles.actionCard}>
                    {!saved ? (
                      <NameField
                        value={name}
                        onChangeText={setName}
                        onFocus={revealSaveField}
                        placeholder="e.g. Pay Off Sedan Early"
                      />
                    ) : null}
                    <TouchableOpacity
                      style={[styles.saveBtn, saved && styles.savedBtn]}
                      activeOpacity={0.9}
                      onPress={() =>
                        save(
                          {
                            type: SCENARIO_TYPES.AUTO_PAYOFF,
                            name: name.trim() || defaultName,
                            balance: pBalN,
                            originalLoan: pOriginalLoanN,
                            rate: pRateN,
                            originalTerm: pOriginalTermN,
                            monthsRemaining: pMonthsN,
                            extra: pExtraN,
                            lump: pLumpN,
                            monthlyPayment: pWith.monthlyPayment,
                            payoffMonths: pWith.months,
                            monthsSaved: pMonthsSaved,
                            interestSaved: pInterestSaved,
                            inputs: { pBalance, pRate, pOriginalTerm, pMonths, pExtra, pLump },
                          },
                          pValidationError,
                        )
                      }
                      disabled={saved}
                    >
                      <Ionicons
                        name={saved ? 'checkmark-circle' : 'bookmark'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.saveText}>
                        {saved ? 'Saved to your list' : 'Save Scenario'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          {/* ---------------- REFINANCE ---------------- */}
          {mode === 'refinance' ? (
            <>
              <Text style={styles.sectionTitle}>Current Auto Loan</Text>
              <View style={styles.sectionCard}>
                <InputField
                  label="Original Loan Amount"
                  value={rBalance}
                  onChangeText={setRBalance}
                  prefix="$"
                />

                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Current Rate"
                      value={rCurRate}
                      onChangeText={setRCurRate}
                      suffix="%"
                      accentColor={COLORS.red}
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Original Term"
                      value={rOriginalTerm}
                      onChangeText={setROriginalTerm}
                      suffix="mo"
                      accentColor={COLORS.purple}
                    />
                  </View>
                </View>

                <InputField
                  label="Months Remaining"
                  value={rMonths}
                  onChangeText={setRMonths}
                  suffix="mo"
                  accentColor={COLORS.teal}
                />
              </View>

              <Text style={styles.sectionTitle}>New Loan Offer</Text>
              <View style={styles.sectionCard}>
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="New Rate"
                      value={rNewRate}
                      onChangeText={setRNewRate}
                      suffix="%"
                      accentColor={COLORS.green}
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={{ flex: 1 }}>
                    <InputField
                      label="New Term"
                      value={rNewTerm}
                      onChangeText={setRNewTerm}
                      suffix="mo"
                      accentColor={COLORS.purple}
                    />
                  </View>
                </View>

                <InputField
                  label="Refinance Fees"
                  value={rFees}
                  onChangeText={setRFees}
                  prefix="$"
                  accentColor={COLORS.amber}
                />
              </View>

              {rBalN > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Refinance Analysis</Text>
                  <View
                    style={[
                      styles.verdict,
                      {
                        backgroundColor: (rWorthIt ? COLORS.green : COLORS.red) + '18',
                        borderColor: (rWorthIt ? COLORS.green : COLORS.red) + '44',
                      },
                    ]}
                  >
                    <Ionicons
                      name={rWorthIt ? 'checkmark-circle' : 'close-circle'}
                      size={34}
                      color={rWorthIt ? COLORS.green : COLORS.red}
                    />

                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text
                        style={[
                          styles.verdictTitle,
                          { color: rWorthIt ? COLORS.green : COLORS.red },
                        ]}
                      >
                        {rWorthIt ? 'Refinancing Saves You Money' : 'Not Worth Refinancing'}
                      </Text>

                      <Text style={styles.verdictSub}>
                        {rWorthIt
                          ? `Net savings of ${fmtMoney(rLifetime)} after fees.`
                          : 'Fees or added interest outweigh the savings.'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.compareCard}>
                    <View style={styles.compareCol}>
                      <Text style={styles.compareHead}>Current</Text>
                      <Text style={[styles.comparePay, { color: COLORS.red }]}>
                        {fmtMoney(rCurPay)}
                      </Text>
                      <Text style={styles.compareRate}>{rCurRateN.toFixed(2)}% APR</Text>
                    </View>

                    <Ionicons name="arrow-forward" size={22} color={COLORS.textMuted} />

                    <View style={styles.compareCol}>
                      <Text style={styles.compareHead}>New</Text>
                      <Text style={[styles.comparePay, { color: COLORS.green }]}>
                        {fmtMoney(rNewPay)}
                      </Text>
                      <Text style={styles.compareRate}>{rNewRateN.toFixed(2)}% APR</Text>
                    </View>
                  </View>

                  <View style={styles.metricsCard}>
                    <MetricRow
                      label="Monthly Difference"
                      value={
                        rMonthlySavings >= 0
                          ? fmtMoney(rMonthlySavings)
                          : `-${fmtMoney(Math.abs(rMonthlySavings))}`
                      }
                      color={rMonthlySavings >= 0 ? COLORS.green : COLORS.red}
                    />

                    <MetricRow
                      label="Interest Left (Current)"
                      value={rCurAm ? fmtMoney(rCurAm.totalInterest) : '—'}
                      color={COLORS.red}
                    />

                    <MetricRow
                      label="Interest (New Loan)"
                      value={rNewAm ? fmtMoney(rNewAm.totalInterest) : '—'}
                      color={COLORS.teal}
                    />

                    <MetricRow
                      label="Refinance Fees"
                      value={fmtMoney(rFeesN)}
                      color={COLORS.textPrimary}
                    />

                    <MetricRow
                      label="Net Savings"
                      value={
                        rLifetime >= 0 ? fmtMoney(rLifetime) : `-${fmtMoney(Math.abs(rLifetime))}`
                      }
                      color={rLifetime >= 0 ? COLORS.green : COLORS.red}
                      last
                    />
                  </View>

                  <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>
                    {saved ? 'Analysis Saved' : 'Save This Analysis for Later'}
                  </Text>
                  <View style={styles.actionCard}>
                    {!saved ? (
                      <NameField
                        value={name}
                        onChangeText={setName}
                        onFocus={revealSaveField}
                        placeholder="e.g. Truck Refi"
                      />
                    ) : null}

                    <TouchableOpacity
                      style={[styles.saveBtn, saved && styles.savedBtn]}
                      activeOpacity={0.9}
                      onPress={() =>
                        save(
                          {
                            type: SCENARIO_TYPES.AUTO_REFINANCE,
                            name: name.trim() || defaultName,
                            balance: rBalN,
                            curRate: rCurRateN,
                            newRate: rNewRateN,
                            monthlySavings: rMonthlySavings,
                            netSavings: rLifetime,
                            worthIt: rWorthIt,
                            inputs: {
                              rBalance,
                              rCurRate,
                              rOriginalTerm,
                              rMonths,
                              rNewRate,
                              rNewTerm,
                              rFees,
                            },
                          },
                          rValidationError,
                        )
                      }
                      disabled={saved}
                    >
                      <Ionicons
                        name={saved ? 'checkmark-circle' : 'bookmark'}
                        size={18}
                        color="#fff"
                      />
                      <Text style={styles.saveText}>
                        {saved ? 'Saved to your list' : 'Save Analysis'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function NameField({ value, onChangeText, onFocus, placeholder }) {
  return (
    <View style={styles.nameField}>
      <Text style={styles.nameLabel}>Name</Text>
      <TextInput
        style={styles.nameInput}
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
      />
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
  modeRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 20,
    backgroundColor: COLORS.card,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    borderRadius: 11,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  modeText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 13 },
  modeTextActive: { color: '#fff' },
  previewCard: {
    backgroundColor: '#17243A',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.accent + '55',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  previewLabel: { color: '#9EC9F5', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  previewValue: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '900',
    marginVertical: 6,
    letterSpacing: -1,
  },
  previewRow: { flexDirection: 'row', gap: 20 },
  previewSub: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 7,
    marginBottom: 11,
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
  planLabel: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800', marginBottom: 12 },
  planDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  label: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    marginLeft: 2,
  },
  rowInputs: { flexDirection: 'row' },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: -2,
    paddingHorizontal: 2,
  },
  hintText: { color: COLORS.textMuted, fontSize: 12, flex: 1, fontWeight: '500', lineHeight: 17 },
  termRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  termBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  termText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  termTextActive: { color: '#fff' },
  presetRow: { flexDirection: 'row', gap: 10, marginTop: 2, marginBottom: 8 },
  preset: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  presetLump: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetLumpActive: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  presetText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 14 },
  presetTextActive: { color: '#062' },
  presetLumpTextActive: { color: '#4a3200' },
  statRow: { flexDirection: 'row', marginTop: 16 },
  impactMetrics: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginTop: 16,
  },
  impactMetric: { flex: 1 },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 11,
  },
  impactDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  impactValue: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800' },
  impactLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  impactSub: { fontSize: 12, fontWeight: '700', marginTop: 6 },
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
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.green + '18',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.green + '44',
  },
  highlightLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  highlightValue: { color: COLORS.green, fontSize: 30, fontWeight: '900', marginVertical: 2 },
  highlightSub: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },
  lumpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.amber + '18',
    borderWidth: 1,
    borderColor: COLORS.amber + '44',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  lumpBannerText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    marginBottom: 14,
  },
  emptyHint: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.amber + '15',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
  },
  verdictTitle: { fontSize: 16, fontWeight: '800' },
  verdictSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, fontWeight: '500' },
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
  actionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.accent + '55',
    marginBottom: 16,
  },
  nameField: {},
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
