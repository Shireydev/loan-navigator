import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
  getLoanTimeline,
  loanStartFromRemainingMonths,
  parseLoanNumber,
  remainingBalanceFromOriginal,
  validateAutoPurchase,
  validatePayoffScenario,
  validateRefinanceScenario,
} from '../theme';
import { SCENARIO_TYPES } from '../savedScenarios';
import { getStateBaseSalesTaxRate, lookupTaxByZip } from '../taxApi';
import useScrollToTopOnFocus from '../components/useScrollToTopOnFocus';

const MODES = [
  { key: 'purchase', label: 'Purchase', icon: 'car-sport' },
  { key: 'payoff', label: 'Payoff', icon: 'trending-down' },
  { key: 'refinance', label: 'Refinance', icon: 'swap-horizontal' },
];

const PRESETS = [50, 100, 150, 250];
const LUMP_PRESETS = [1000, 2500, 5000, 10000];
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
const AUTO_HEADER_COLLAPSE_DISTANCE = 96;
const AUTO_HEADER_DETAILS_HEIGHT = 112;
const AUTO_HEADER_COLLAPSES = Platform.OS === 'ios';
const DEFAULT_AUTO_PAYOFF_START = loanStartFromRemainingMonths(60, 42);
const DEFAULT_AUTO_REFINANCE_START = loanStartFromRemainingMonths(84, 42);

export default function CarScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  useScrollToTopOnFocus(scrollRef, () => scrollY.setValue(0), 'Auto');
  const [mode, setMode] = useState('purchase');
  const [name, setName] = useState('');

  // Purchase state
  const [price, setPrice] = useState('50,000');
  const [down, setDown] = useState('5,000');
  const [trade, setTrade] = useState('0');
  const [salesTax, setSalesTax] = useState('7');
  const [rate, setRate] = useState('6.90');
  const [term, setTerm] = useState('60');
  const [taxZip, setTaxZip] = useState('');
  const [taxLookupLoading, setTaxLookupLoading] = useState(false);
  const [taxLookupError, setTaxLookupError] = useState('');
  const [taxLookupResult, setTaxLookupResult] = useState(null);

  // Payoff state
  const [pBalance, setPBalance] = useState('25,000');
  const [pRate, setPRate] = useState('6.90');
  const [pOriginalTerm, setPOriginalTerm] = useState('60');
  const [pStartMonth, setPStartMonth] = useState(String(DEFAULT_AUTO_PAYOFF_START.startMonth));
  const [pStartYear, setPStartYear] = useState(String(DEFAULT_AUTO_PAYOFF_START.startYear));
  const [pExtra, setPExtra] = useState('100');
  const [pLump, setPLump] = useState('0');
  const [payoffFromPurchase, setPayoffFromPurchase] = useState(false);

  // Refinance state
  const [rBalance, setRBalance] = useState('22,000');
  const [rCurRate, setRCurRate] = useState('9.50');
  const [rOriginalTerm, setROriginalTerm] = useState('84');
  const [rStartMonth, setRStartMonth] = useState(String(DEFAULT_AUTO_REFINANCE_START.startMonth));
  const [rStartYear, setRStartYear] = useState(String(DEFAULT_AUTO_REFINANCE_START.startYear));
  const [rManualBalance, setRManualBalance] = useState(null);
  const [rNewRate, setRNewRate] = useState('6.00');
  const [rNewTerm, setRNewTerm] = useState('48');
  const [rFees, setRFees] = useState('300');
  const [refinanceFromPurchase, setRefinanceFromPurchase] = useState(false);

  const num = parseLoanNumber;

  // Jump to a specific mode when arriving from the landing page.
  useEffect(() => {
    const lm = route.params?.landingMode;
    if (lm && ['purchase', 'payoff', 'refinance'].includes(lm)) {
      setMode(lm);
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
      setTerm(String(i.term ?? 60));
      setTaxZip(i.taxZip ?? '');
      setTaxLookupError('');
      setTaxLookupResult(null);
      setName(item.name || '');
    } else if (item.type === SCENARIO_TYPES.AUTO_PAYOFF) {
      const i = item.inputs;
      setMode('payoff');
      setPBalance(i.pBalance ?? '25,000');
      setPRate(i.pRate ?? '6.90');
      const restoredTerm = parseLoanNumber(i.pOriginalTerm ?? '60');
      const restoredRemaining = parseLoanNumber(i.pMonths ?? '42');
      const restoredStart = loanStartFromRemainingMonths(restoredTerm, restoredRemaining);
      setPOriginalTerm(i.pOriginalTerm ?? '60');
      setPStartMonth(String(i.pStartMonth ?? restoredStart.startMonth));
      setPStartYear(String(i.pStartYear ?? restoredStart.startYear));
      setPExtra(i.pExtra ?? '100');
      setPLump(i.pLump ?? '0');
      setPayoffFromPurchase(false);
      setName(item.name || '');
    } else if (item.type === SCENARIO_TYPES.AUTO_REFINANCE) {
      const i = item.inputs;
      setMode('refinance');
      setRBalance(i.rBalance ?? '22,000');
      setRCurRate(i.rCurRate ?? '9.50');
      const restoredTerm = parseLoanNumber(i.rOriginalTerm ?? '84');
      const restoredRemaining = parseLoanNumber(i.rMonths ?? '42');
      const restoredStart = loanStartFromRemainingMonths(restoredTerm, restoredRemaining);
      setROriginalTerm(i.rOriginalTerm ?? '84');
      setRStartMonth(String(i.rStartMonth ?? restoredStart.startMonth));
      setRStartYear(String(i.rStartYear ?? restoredStart.startYear));
      const restoredCurrentBalance = parseLoanNumber(i.rCurrentBalance);
      setRManualBalance(
        i.rBalanceAdjusted && Number.isFinite(restoredCurrentBalance)
          ? formatInputWithCommas(String(Math.round(restoredCurrentBalance)))
          : null,
      );
      setRNewRate(i.rNewRate ?? '6.00');
      setRNewTerm(i.rNewTerm ?? '48');
      setRFees(i.rFees ?? '300');
      setRefinanceFromPurchase(false);
      setName(item.name || '');
    }
    navigation.setParams({ restore: undefined });
  }, [navigation, route.params?.restore, route.params?.ts]);

  const setModeHaptic = (m) => {
    Haptics.selectionAsync();

    if (!purchaseValidationError && amountFinanced > 0 && m === 'payoff') {
      const purchaseLoan = formatInputWithCommas(String(Math.round(amountFinanced)));
      setPBalance(purchaseLoan);
      setPRate(rate);
      setPOriginalTerm(String(termN));
      const purchaseStart = loanStartFromRemainingMonths(termN, termN);
      setPStartMonth(String(purchaseStart.startMonth));
      setPStartYear(String(purchaseStart.startYear));
      setPExtra('100');
      setPLump('0');
      setPayoffFromPurchase(true);
    }

    if (!purchaseValidationError && amountFinanced > 0 && m === 'refinance') {
      const purchaseLoan = formatInputWithCommas(String(Math.round(amountFinanced)));
      setRBalance(purchaseLoan);
      setRCurRate(rate);
      setROriginalTerm(String(termN));
      const purchaseStart = loanStartFromRemainingMonths(termN, termN);
      setRStartMonth(String(purchaseStart.startMonth));
      setRStartYear(String(purchaseStart.startYear));
      setRManualBalance(null);
      setRNewTerm(String(termN));
      setRefinanceFromPurchase(true);
    }

    setMode(m);
    setName('');
  };

  // ---- Purchase calcs ----
  // Trade-in value is subtracted from the vehicle price BEFORE sales tax is
  // applied (most states tax the net price after trade-in credit).
  const optionalAmount = (value) => (String(value ?? '').trim() === '' ? 0 : num(value));
  const priceN = num(price);
  const downN = optionalAmount(down);
  const tradeN = optionalAmount(trade);
  const salesTaxN = num(salesTax);
  const rateN = num(rate);
  const termN = num(term);
  const purchaseValidationError = validateAutoPurchase({
    price: priceN,
    down: downN,
    trade: tradeN,
    salesTax: salesTaxN,
    rate: rateN,
    termMonths: termN,
  });
  const taxableAmount = purchaseValidationError ? 0 : Math.max(priceN - tradeN, 0);
  const taxAmt = purchaseValidationError ? 0 : taxableAmount * (salesTaxN / 100);
  const amountFinanced = purchaseValidationError ? 0 : Math.max(taxableAmount + taxAmt - downN, 0);
  const carPay = amountFinanced > 0 ? monthlyPI(amountFinanced, rateN, termN / 12) : 0;
  const purAm = amountFinanced > 0 ? amortize(amountFinanced, rateN, termN / 12, 0) : null;
  const totalCost = purAm ? downN + tradeN + amountFinanced + purAm.totalInterest : 0;

  const lookupPurchaseTax = async () => {
    const clean = taxZip.replace(/[^0-9]/g, '');
    if (clean.length !== 5) {
      setTaxLookupError('Enter a valid 5-digit ZIP code.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    Haptics.selectionAsync();
    setTaxLookupLoading(true);
    setTaxLookupError('');
    setTaxLookupResult(null);

    try {
      const location = await lookupTaxByZip(clean);
      const stateRate = getStateBaseSalesTaxRate(location.stateCode);
      if (stateRate == null) {
        throw new Error('No statewide sales-tax estimate is available.');
      }
      setTaxLookupResult({ ...location, stateRate });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn('Unable to estimate auto sales tax:', error);
      setTaxLookupError("Couldn't estimate tax for that ZIP code. Check it and try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setTaxLookupLoading(false);
    }
  };

  const applyPurchaseTax = () => {
    if (!taxLookupResult) return;
    setSalesTax(String(taxLookupResult.stateRate));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  // ---- Payoff calcs ----
  const pOriginalLoanN = num(pBalance);
  const pOriginalTermN = num(pOriginalTerm);
  const pTimeline = getLoanTimeline(num(pStartMonth), num(pStartYear), pOriginalTermN);
  const pMonthsN = pTimeline.remainingMonths;
  const pRateN = num(pRate);
  const pExtraN = num(pExtra);
  const pLumpN = num(pLump);

  const pBaseValidationError =
    pTimeline.error ||
    validatePayoffScenario({
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
  const rTimeline = getLoanTimeline(num(rStartMonth), num(rStartYear), rOriginalTermN);
  const rMonthsN = rTimeline.remainingMonths;
  const rCurRateN = num(rCurRate);
  const rNewRateN = num(rNewRate);
  const rNewTermN = num(rNewTerm);
  const rFeesN = num(rFees);
  const rBaseValidationError =
    rTimeline.error ||
    validateRefinanceScenario({
      balance: rOriginalLoanN,
      balanceLabel: 'Original loan amount',
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
  const rEstimatedBalance = rBaseValidationError
    ? 0
    : remainingBalanceFromOriginal(rOriginalLoanN, rCurRateN, rOriginalTermN, rMonthsN);
  const rManualBalanceN = rManualBalance == null ? NaN : num(rManualBalance);
  const rBalN = rManualBalance == null ? rEstimatedBalance : rManualBalanceN;
  const rBalanceValidationError =
    rManualBalance != null && (!Number.isFinite(rManualBalanceN) || rManualBalanceN <= 0)
      ? 'Estimated balance remaining must be a valid amount greater than 0.'
      : rManualBalance != null && rManualBalanceN > rEstimatedBalance
        ? 'Estimated balance remaining cannot exceed the calculated estimate.'
        : null;
  const rValidationError = rBaseValidationError || rBalanceValidationError;
  const rDisplayedBalance =
    rManualBalance ??
    (rEstimatedBalance > 0 ? formatInputWithCommas(String(Math.round(rEstimatedBalance))) : '');

  const rNewYears = rNewTermN > 0 ? rNewTermN / 12 : 0;

  const rCurPay =
    !rValidationError && rBalN > 0 ? monthlyPI(rOriginalLoanN, rCurRateN, rOriginalTermN / 12) : 0;

  const rNewPay =
    !rValidationError && rBalN > 0 && rNewYears > 0 ? monthlyPI(rBalN, rNewRateN, rNewYears) : 0;

  const rMonthlySavings = rCurPay - rNewPay;

  const rCurAm = rBalN > 0 && rCurPay > 0 ? amortizeWithPayment(rBalN, rCurRateN, rCurPay) : null;

  const rNewAm =
    !rValidationError && rBalN > 0 && rNewYears > 0
      ? amortize(rBalN, rNewRateN, rNewYears, 0)
      : null;

  const rLifetime = rCurAm && rNewAm ? rCurAm.totalInterest - rNewAm.totalInterest - rFeesN : 0;

  const rWorthIt = rLifetime > 0;

  const modeValidationError =
    mode === 'purchase'
      ? purchaseValidationError
      : mode === 'payoff'
        ? pValidationError
        : rValidationError;

  const openPurchaseResult = () => {
    if (purchaseValidationError || !purAm || amountFinanced <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Check Your Inputs',
        purchaseValidationError || 'Enter a purchase that includes an amount to finance.',
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.navigate('AutoResult', {
      resultType: 'purchase',
      price: priceN,
      downPayment: downN,
      tradeIn: tradeN,
      salesTaxRate: salesTaxN,
      taxableAmount,
      salesTaxAmount: taxAmt,
      amountFinanced,
      rate: rateN,
      term: termN,
      monthlyPayment: carPay,
      totalInterest: purAm.totalInterest,
      totalLoanPayments: purAm.totalPaid,
      totalCost,
      inputs: { price, down, trade, salesTax, rate, term, taxZip },
      presetName: name,
    });
  };

  const openPayoffResult = () => {
    if (pValidationError || !pBase || !pWith || !pHasAccel) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Check Your Plan',
        pValidationError || 'Add an extra monthly amount, a one-time payment, or both.',
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.navigate('AutoResult', {
      resultType: 'payoff',
      currentBalance: pBalN,
      balanceAfterLump: pBalAfterLump,
      originalLoan: pOriginalLoanN,
      rate: pRateN,
      originalTerm: pOriginalTermN,
      monthsRemaining: pMonthsN,
      extra: pExtraN,
      lump: pLumpN,
      currentPayment: pScheduledPay,
      newPayment: pWith.monthlyPayment,
      currentPayoffMonths: pBase.months,
      newPayoffMonths: pWith.months,
      currentInterest: pBase.totalInterest,
      newInterest: pWith.totalInterest,
      monthsSaved: pMonthsSaved,
      interestSaved: pInterestSaved,
      currentSchedule: pBase.schedule,
      newSchedule: pWith.schedule,
      inputs: { pBalance, pRate, pOriginalTerm, pStartMonth, pStartYear, pExtra, pLump },
      presetName: name,
    });
  };

  const openRefinanceResult = () => {
    if (rValidationError || !rCurAm || !rNewAm) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Check Your Inputs', rValidationError || 'Enter a valid refinance offer.');
      return;
    }

    Haptics.notificationAsync(
      rWorthIt
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    );
    navigation.navigate('AutoResult', {
      resultType: 'refinance',
      currentBalance: rBalN,
      currentRate: rCurRateN,
      newRate: rNewRateN,
      currentPayment: rCurPay,
      newPayment: rNewPay,
      monthlySavings: rMonthlySavings,
      currentInterest: rCurAm.totalInterest,
      newInterest: rNewAm.totalInterest,
      refinanceFees: rFeesN,
      lifetimeSavings: rLifetime,
      currentPayoffMonths: rCurAm.months,
      newPayoffMonths: rNewAm.months,
      breakEven: rMonthlySavings > 0 ? rFeesN / rMonthlySavings : null,
      inputs: {
        rBalance,
        rCurRate,
        rOriginalTerm,
        rStartMonth,
        rStartYear,
        rCurrentBalance: formatInputWithCommas(String(Math.round(rBalN))),
        rBalanceAdjusted: rManualBalance != null,
        rNewRate,
        rNewTerm,
        rFees,
      },
      presetName: name,
    });
  };

  const collapseProgress = scrollY.interpolate({
    inputRange: [0, AUTO_HEADER_COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Animating the height of a header outside the ScrollView changes the
  // Android viewport, which changes the scroll offset again and creates a
  // feedback-loop jitter near the top. Keep its layout stable on Android;
  // iOS retains the existing collapsing treatment.
  const headerDetailsHeight = AUTO_HEADER_COLLAPSES
    ? scrollY.interpolate({
        inputRange: [0, AUTO_HEADER_COLLAPSE_DISTANCE],
        outputRange: [AUTO_HEADER_DETAILS_HEIGHT, 0],
        extrapolate: 'clamp',
      })
    : undefined;
  const headerDetailsOpacity = AUTO_HEADER_COLLAPSES
    ? scrollY.interpolate({
        inputRange: [0, AUTO_HEADER_COLLAPSE_DISTANCE * 0.7],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      })
    : 1;
  const paymentFontSize = AUTO_HEADER_COLLAPSES
    ? collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [44, 30] })
    : 44;
  const headerBottomPadding = AUTO_HEADER_COLLAPSES
    ? collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [20, 10] })
    : 20;
  const headerBarMargin = AUTO_HEADER_COLLAPSES
    ? collapseProgress.interpolate({ inputRange: [0, 1], outputRange: [14, 5] })
    : 14;

  return (
    <View style={styles.container}>
      {mode === 'purchase' ? (
        <AnimatedLinearGradient
          colors={['#07162F', '#0A2D61']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.purchaseHeader,
            { paddingTop: insets.top + 12, paddingBottom: headerBottomPadding },
          ]}
        >
          <Animated.View style={[styles.purchaseHeaderBar, { marginBottom: headerBarMargin }]}>
            <View style={styles.purchaseHeaderBtn} accessibilityRole="image">
              <Ionicons name="car-sport-outline" size={22} color="#8CC5FF" />
            </View>
            <Text style={styles.purchaseHeaderTitle}>Your Auto Purchase</Text>
            <TouchableOpacity
              onPress={() => navigation.getParent()?.navigate('Home')}
              style={styles.purchaseHeaderBtn}
              accessibilityRole="button"
              accessibilityLabel="Return to home"
            >
              <Ionicons name="home-outline" size={21} color="#8CC5FF" />
            </TouchableOpacity>
          </Animated.View>
          <Text style={styles.purchaseEstimateLabel}>ESTIMATED MONTHLY PAYMENT</Text>
          <Animated.Text style={[styles.purchaseBigValue, { fontSize: paymentFontSize }]}>
            {fmtMoney(carPay)}
          </Animated.Text>
          <Animated.View
            style={[
              styles.purchaseHeaderDetails,
              {
                height: headerDetailsHeight,
                opacity: headerDetailsOpacity,
                overflow: AUTO_HEADER_COLLAPSES ? 'hidden' : 'visible',
              },
            ]}
          >
            <Text style={styles.purchaseBigLabel}>per month · based on your inputs</Text>
            <View style={styles.purchaseHeaderFacts}>
              <View style={styles.purchaseHeaderFact}>
                <Text style={styles.purchaseHeaderFactLabel}>Amount financed</Text>
                <Text style={styles.purchaseHeaderFactValue}>{fmtMoney(amountFinanced)}</Text>
              </View>
              <View style={styles.purchaseHeaderFactDivider} />
              <View style={styles.purchaseHeaderFact}>
                <Text style={styles.purchaseHeaderFactLabel}>Rate & term</Text>
                <Text style={styles.purchaseHeaderFactValue}>
                  {Number.isFinite(rateN) ? rateN.toFixed(2) : '—'}% ·{' '}
                  {Number.isFinite(termN) ? termN : '—'} months
                </Text>
              </View>
            </View>
            <Text style={styles.purchaseHeaderDisclosure}>
              Planning estimate — not a lender quote.
            </Text>
          </Animated.View>
        </AnimatedLinearGradient>
      ) : (
        <GradientHeader
          title="Auto Loan Center"
          subtitle="Plan every stage of your auto loan"
          icon="home-outline"
          variant="financial"
          onIconPress={() => navigation.getParent()?.navigate('Home')}
          iconAccessibilityLabel="Return to home"
        />
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Animated.ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={
            AUTO_HEADER_COLLAPSES
              ? Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
                  useNativeDriver: false,
                })
              : undefined
          }
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
              <Text style={styles.sectionTitle}>Vehicle</Text>
              <View style={styles.sectionCard}>
                <View style={styles.rowInputs}>
                  <View style={styles.autoAmountInput}>
                    <InputField
                      label="Vehicle Price"
                      value={price}
                      onChangeText={setPrice}
                      prefix="$"
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={styles.autoRateInput}>
                    <InputField
                      label="Interest Rate"
                      value={rate}
                      onChangeText={setRate}
                      suffix="%"
                      accentColor={COLORS.purple}
                    />
                  </View>
                </View>
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
                  label="Loan Term"
                  value={term}
                  onChangeText={setTerm}
                  suffix="mo"
                  accentColor={COLORS.accent}
                />
              </View>

              <Text style={styles.sectionTitle}>Sales Tax</Text>
              <View style={styles.sectionCard}>
                <InputField
                  label="Sales Tax Rate"
                  value={salesTax}
                  onChangeText={setSalesTax}
                  suffix="%"
                  accentColor={COLORS.amber}
                />
                <View style={styles.taxLookupCard}>
                  <View style={styles.taxLookupHead}>
                    <View style={styles.taxLookupIcon}>
                      <Ionicons name="location" size={18} color={COLORS.teal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taxLookupTitle}>
                        Estimate state tax by ZIP <Text style={styles.optional}>(optional)</Text>
                      </Text>
                      <Text style={styles.taxLookupSub}>
                        Identify the state and get a starting rate you can review before applying.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.taxZipRow}>
                    <View style={styles.taxZipInputWrap}>
                      <Ionicons name="pin" size={16} color={COLORS.textMuted} />
                      <TextInput
                        style={styles.taxZipInput}
                        value={taxZip}
                        onChangeText={(value) => {
                          setTaxZip(value.replace(/[^0-9]/g, '').slice(0, 5));
                          setTaxLookupError('');
                          setTaxLookupResult(null);
                        }}
                        placeholder="e.g. 48226"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="number-pad"
                        maxLength={5}
                      />
                    </View>
                    <TouchableOpacity
                      style={[styles.taxLookupBtn, taxLookupLoading && { opacity: 0.7 }]}
                      activeOpacity={0.9}
                      onPress={lookupPurchaseTax}
                      disabled={taxLookupLoading}
                    >
                      {taxLookupLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="search" size={16} color="#fff" />
                          <Text style={styles.taxLookupBtnText}>Look up</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {taxLookupError ? (
                    <View style={styles.taxLookupErrorRow}>
                      <Ionicons name="alert-circle" size={15} color={COLORS.red} />
                      <Text style={styles.taxLookupErrorText}>{taxLookupError}</Text>
                    </View>
                  ) : null}

                  {taxLookupResult ? (
                    <View style={styles.taxLookupResult}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taxLookupPlace}>{taxLookupResult.place}</Text>
                        <Text style={styles.taxLookupRateLabel}>State base estimate</Text>
                        <Text style={styles.taxLookupRateValue}>{taxLookupResult.stateRate}%</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.applyTaxBtn}
                        activeOpacity={0.9}
                        onPress={applyPurchaseTax}
                      >
                        <Ionicons name="download" size={15} color="#fff" />
                        <Text style={styles.applyTaxText}>Apply rate</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <Text style={styles.taxLookupDisclaimer}>
                    Vehicle and local tax rules, caps, title fees, and excise taxes may differ. Use
                    your dealer or DMV quote when available and adjust the tax field above.
                  </Text>
                </View>
                <View style={styles.hintRow}>
                  <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
                  <Text style={styles.hintText}>
                    Trade-in value is subtracted before sales tax is applied.
                  </Text>
                </View>
              </View>

              {amountFinanced > 0 && purAm ? (
                <View style={styles.resultsActionWrap}>
                  <Text style={styles.sectionTitle}>Purchase Results</Text>
                  <ResultsButton label="View Purchase Breakdown" onPress={openPurchaseResult} />
                </View>
              ) : null}
            </>
          ) : null}

          {/* ---------------- PAYOFF ---------------- */}
          {mode === 'payoff' ? (
            <>
              {payoffFromPurchase ? (
                <View style={styles.handoffBanner}>
                  <View style={styles.handoffBannerIcon}>
                    <Ionicons name="car-sport" size={18} color={COLORS.teal} />
                  </View>
                  <Text style={styles.handoffBannerText}>
                    Started from your purchase estimate. The start date defaults to this month;
                    adjust it if payments have already been made.
                  </Text>
                </View>
              ) : null}
              <Text style={styles.sectionTitle}>Current Auto Loan</Text>
              <View style={styles.sectionCard}>
                <View style={styles.rowInputs}>
                  <View style={styles.autoAmountInput}>
                    <InputField
                      label="Original Loan Amount"
                      value={pBalance}
                      onChangeText={setPBalance}
                      prefix="$"
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={styles.autoRateInput}>
                    <InputField
                      label="Interest Rate"
                      value={pRate}
                      onChangeText={setPRate}
                      suffix="%"
                      accentColor={COLORS.purple}
                    />
                  </View>
                </View>

                <InputField
                  label="Loan Term"
                  value={pOriginalTerm}
                  onChangeText={setPOriginalTerm}
                  suffix="mo"
                  accentColor={COLORS.purple}
                />
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Start Month"
                      value={pStartMonth}
                      onChangeText={setPStartMonth}
                      placeholder="1–12"
                      accentColor={COLORS.teal}
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Start Year"
                      value={pStartYear}
                      onChangeText={setPStartYear}
                      placeholder="YYYY"
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
                <ResultsButton label="View Projected Impact" onPress={openPayoffResult} />
              ) : !pValidationError ? (
                <View style={styles.emptyHint}>
                  <Ionicons name="bulb" size={22} color={COLORS.amber} />
                  <Text style={styles.emptyText}>
                    Add an extra monthly amount or a one-time lump sum to see how much interest and
                    time you'll save.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}

          {/* ---------------- REFINANCE ---------------- */}
          {mode === 'refinance' ? (
            <>
              {refinanceFromPurchase ? (
                <View style={styles.handoffBanner}>
                  <View style={styles.handoffBannerIcon}>
                    <Ionicons name="car-sport" size={18} color={COLORS.teal} />
                  </View>
                  <Text style={styles.handoffBannerText}>
                    Started from your purchase estimate. Review the start date, then enter the rate
                    and fees from the refinance offer you want to compare.
                  </Text>
                </View>
              ) : null}
              <Text style={styles.sectionTitle}>Current Auto Loan</Text>
              <View style={styles.sectionCard}>
                <View style={styles.rowInputs}>
                  <View style={styles.autoAmountInput}>
                    <InputField
                      label="Original Loan Amount"
                      value={rBalance}
                      onChangeText={(value) => {
                        setRBalance(value);
                        setRManualBalance(null);
                      }}
                      prefix="$"
                    />
                  </View>

                  <View style={{ width: 12 }} />

                  <View style={styles.autoRateInput}>
                    <InputField
                      label="Current Rate"
                      value={rCurRate}
                      onChangeText={(value) => {
                        setRCurRate(value);
                        setRManualBalance(null);
                      }}
                      suffix="%"
                      accentColor={COLORS.red}
                    />
                  </View>
                </View>

                <InputField
                  label="Loan Term"
                  value={rOriginalTerm}
                  onChangeText={(value) => {
                    setROriginalTerm(value);
                    setRManualBalance(null);
                  }}
                  suffix="mo"
                  accentColor={COLORS.purple}
                />
                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Start Month"
                      value={rStartMonth}
                      onChangeText={(value) => {
                        setRStartMonth(value);
                        setRManualBalance(null);
                      }}
                      placeholder="1–12"
                      accentColor={COLORS.teal}
                    />
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Start Year"
                      value={rStartYear}
                      onChangeText={(value) => {
                        setRStartYear(value);
                        setRManualBalance(null);
                      }}
                      placeholder="YYYY"
                      accentColor={COLORS.teal}
                    />
                  </View>
                </View>
                <InputField
                  label="Estimated Balance Remaining"
                  value={rDisplayedBalance}
                  onChangeText={setRManualBalance}
                  prefix="$"
                  accentColor={COLORS.accent}
                />
                <View style={styles.hintRow}>
                  <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
                  <Text style={styles.hintText}>
                    This estimate assumes only the minimum scheduled payments were made. Change it
                    only if you made additional payments toward principal.
                  </Text>
                </View>
                {rManualBalance != null ? (
                  <TouchableOpacity
                    style={styles.resetEstimateBtn}
                    onPress={() => setRManualBalance(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Use calculated balance estimate"
                  >
                    <Ionicons name="refresh" size={15} color={COLORS.accent} />
                    <Text style={styles.resetEstimateText}>Use calculated estimate</Text>
                  </TouchableOpacity>
                ) : null}
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
                <View style={styles.resultsActionWrap}>
                  <Text style={styles.sectionTitle}>Refinance Results</Text>
                  <ResultsButton label="Analyze Refinance" onPress={openRefinanceResult} />
                </View>
              ) : null}
            </>
          ) : null}
          <View style={{ height: 24 }} />
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ResultsButton({ label, onPress }) {
  return (
    <TouchableOpacity
      style={styles.resultsBtn}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.resultsBtnIcon}>
        <Ionicons name="analytics" size={21} color="#fff" />
      </View>
      <Text style={styles.resultsBtnText}>{label}</Text>
      <Ionicons name="chevron-forward" size={21} color="#fff" />
    </TouchableOpacity>
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
  purchaseHeader: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(121,184,255,0.24)',
    alignItems: 'center',
  },
  purchaseHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 14,
  },
  purchaseHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(91,169,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseHeaderTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  purchaseEstimateLabel: {
    color: '#9EC9F5',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.25,
    marginBottom: 5,
  },
  purchaseBigValue: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1,
  },
  purchaseBigLabel: {
    color: 'rgba(222,237,255,0.76)',
    fontSize: 13,
    fontWeight: '600',
  },
  purchaseHeaderDetails: { alignSelf: 'stretch', alignItems: 'center', overflow: 'hidden' },
  purchaseHeaderFacts: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    backgroundColor: 'rgba(2,15,36,0.26)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(122,190,255,0.16)',
    paddingVertical: 12,
    marginTop: 16,
  },
  purchaseHeaderFact: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  purchaseHeaderFactDivider: { width: 1, backgroundColor: 'rgba(122,190,255,0.18)' },
  purchaseHeaderFactLabel: {
    color: 'rgba(222,237,255,0.62)',
    fontSize: 11,
    fontWeight: '600',
  },
  purchaseHeaderFactValue: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 3 },
  purchaseHeaderDisclosure: {
    color: 'rgba(222,237,255,0.56)',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 10,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 7,
    marginBottom: 11,
  },
  laterSectionTitle: { marginTop: 24 },
  resultsActionWrap: { marginTop: 2 },
  resultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  resultsBtnIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsBtnText: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 },
  handoffBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.teal + '12',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.teal + '35',
    padding: 13,
    marginBottom: 14,
  },
  handoffBannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.teal + '1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handoffBannerText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
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
  autoAmountInput: { flex: 1.7 },
  autoRateInput: { flex: 0.8 },
  optional: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  taxLookupCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 16,
  },
  taxLookupHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  taxLookupIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.teal + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  taxLookupTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  taxLookupSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    marginTop: 4,
  },
  taxZipRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  taxZipInputWrap: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
  },
  taxZipInput: {
    flex: 1,
    height: 46,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  taxLookupBtn: {
    minWidth: 104,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.teal,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
  },
  taxLookupBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  taxLookupErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  taxLookupErrorText: { flex: 1, color: COLORS.red, fontSize: 12, fontWeight: '600' },
  taxLookupResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.green + '55',
    padding: 13,
    marginTop: 12,
  },
  taxLookupPlace: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800' },
  taxLookupRateLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 4 },
  taxLookupRateValue: { color: COLORS.green, fontSize: 20, fontWeight: '900', marginTop: 1 },
  applyTaxBtn: {
    height: 40,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  applyTaxText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  taxLookupDisclaimer: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 15,
    marginTop: 12,
  },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: -2,
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
