import React, { useState, useEffect, useRef } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import GradientHeader from '../components/GradientHeader';
import InputField, { ValidationBanner } from '../components/InputField';
import {
  COLORS,
  monthlyPI,
  amortizeWithPayment,
  fmtMoney,
  formatInputWithCommas,
  getLoanTimeline,
  loanStartFromRemainingMonths,
  parseLoanNumber,
  remainingBalanceFromOriginal,
  validatePayoffScenario,
} from '../theme';
import { SCENARIO_TYPES } from '../savedScenarios';
import { lookupTaxByZip } from '../taxApi';
import { estimateHomeInsurance, estimatePropertyTax } from '../costEstimator';
import useScrollToTopOnFocus from '../components/useScrollToTopOnFocus';
import { publishPayoffLoan } from '../components/mortgageLoanHandoff';

const PRESETS = [50, 100, 200, 500];
const LUMP_PRESETS = [5000, 10000, 25000, 50000];
const DEFAULT_MORTGAGE_START = loanStartFromRemainingMonths(30 * 12, 27 * 12);
const FREQS = [
  { key: 'monthly', label: 'Monthly', per: 1 },
  { key: 'quarterly', label: 'Quarterly', per: 3 },
  { key: 'annual', label: 'Annual', per: 12 },
];

function ExtraField({ label, value, onChangeValue, freq, onChangeFreq, accentColor, recommended }) {
  return (
    <View style={styles.extraWrap}>
      <InputField
        label={label}
        value={value}
        onChangeText={onChangeValue}
        prefix="$"
        accentColor={accentColor}
      />
      <View style={styles.freqRow}>
        {FREQS.map((option) => {
          const active = freq === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.85}
              style={[
                styles.freqBtn,
                active && { backgroundColor: accentColor, borderColor: accentColor },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                onChangeFreq(option.key);
              }}
            >
              <Text style={[styles.freqText, active && styles.freqTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {recommended != null ? (
        <View style={styles.recRow}>
          <Ionicons name="sparkles" size={13} color={accentColor} />
          <Text style={[styles.recText, { color: accentColor }]}>
            Recommended: {fmtMoney(recommended)}/yr
          </Text>
          <TouchableOpacity
            style={[styles.recApply, { borderColor: accentColor }]}
            activeOpacity={0.8}
            onPress={() => {
              Haptics.selectionAsync();
              onChangeValue(formatInputWithCommas(String(Math.round(recommended))));
              onChangeFreq('annual');
            }}
          >
            <Text style={[styles.recApplyText, { color: accentColor }]}>Apply</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function CostSummary({ label, value, color }) {
  return (
    <View style={styles.costSummaryItem}>
      <View style={[styles.costSummaryDot, { backgroundColor: color }]} />
      <Text style={styles.costSummaryLabel}>{label}</Text>
      <Text style={[styles.costSummaryValue, { color }]}>{fmtMoney(value)}/mo</Text>
    </View>
  );
}

// Advance the original loan's amortization schedule from its calendar start
// date to derive the current balance rather than asking the borrower to guess
// how many years remain.
export default function PayoffScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const scrollRef = useRef(null);
  useScrollToTopOnFocus(scrollRef, undefined, 'Payoff');
  const [origLoan, setOrigLoan] = useState(formatInputWithCommas('400000'));
  const [rate, setRate] = useState('6.75');
  const [origYears, setOrigYears] = useState('30');
  const [startMonth, setStartMonth] = useState(String(DEFAULT_MORTGAGE_START.startMonth));
  const [startYear, setStartYear] = useState(String(DEFAULT_MORTGAGE_START.startYear));
  const [manualBalance, setManualBalance] = useState(null);
  const [extra, setExtra] = useState('200');
  const [lump, setLump] = useState('0');
  const [homeValue, setHomeValue] = useState(formatInputWithCommas('500000'));
  const [tax, setTax] = useState(formatInputWithCommas('3840'));
  const [taxFreq, setTaxFreq] = useState('annual');
  const [insurance, setInsurance] = useState(formatInputWithCommas('1560'));
  const [insuranceFreq, setInsuranceFreq] = useState('annual');
  const [pmi, setPmi] = useState('0');
  const [pmiFreq, setPmiFreq] = useState('monthly');
  const [hoa, setHoa] = useState('0');
  const [hoaFreq, setHoaFreq] = useState('monthly');
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [costsExpanded, setCostsExpanded] = useState(false);
  const [zip, setZip] = useState('');
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState('');
  const [zipInfo, setZipInfo] = useState(null);
  const [recTax, setRecTax] = useState(null);
  const [recIns, setRecIns] = useState(null);
  const [recInsDetails, setRecInsDetails] = useState(null);
  const [name, setName] = useState('');

  // Restore a saved mortgage payoff scenario from the Saved tab.
  useEffect(() => {
    const item = route.params?.restore;
    if (!item || item.type !== SCENARIO_TYPES.MORTGAGE_PAYOFF || !item.inputs) return;

    const i = item.inputs;
    setOrigLoan(i.origLoan ?? formatInputWithCommas('400000'));
    setRate(i.rate ?? '6.75');
    const restoredTerm = parseLoanNumber(i.origYears ?? '30');
    const legacyRemaining = parseLoanNumber(i.yearsLeft ?? '27');
    const restoredStart = loanStartFromRemainingMonths(restoredTerm * 12, legacyRemaining * 12);
    setOrigYears(i.origYears ?? '30');
    setStartMonth(String(i.startMonth ?? restoredStart.startMonth));
    setStartYear(String(i.startYear ?? restoredStart.startYear));
    const restoredBalance = parseLoanNumber(i.currentBalance);
    setManualBalance(
      i.balanceAdjusted && Number.isFinite(restoredBalance)
        ? formatInputWithCommas(String(Math.round(restoredBalance)))
        : null,
    );
    setExtra(i.extra ?? '200');
    setLump(i.lump ?? '0');
    setHomeValue(i.homeValue ?? formatInputWithCommas('500000'));
    setTax(i.tax ?? formatInputWithCommas('3840'));
    setTaxFreq(i.taxFreq ?? 'annual');
    setInsurance(i.insurance ?? formatInputWithCommas('1560'));
    setInsuranceFreq(i.insuranceFreq ?? 'annual');
    setPmi(i.pmi ?? '0');
    setPmiFreq(i.pmiFreq ?? 'monthly');
    setHoa(i.hoa ?? '0');
    setHoaFreq(i.hoaFreq ?? 'monthly');
    setZip(i.zip ?? '');
    setZipInfo(null);
    setRecTax(null);
    setRecIns(null);
    setName(item.name || '');
    navigation.setParams({ restore: undefined });
  }, [navigation, route.params?.restore, route.params?.ts]);

  // Start a payoff plan from a completed mortgage estimate while preserving
  // the estimate's loan and monthly housing-cost assumptions.
  useEffect(() => {
    const i = route.params?.prefill;
    if (!i) return;

    setOrigLoan(i.origLoan ?? formatInputWithCommas('400000'));
    setRate(i.rate ?? '6.75');
    const prefillTerm = parseLoanNumber(i.origYears ?? '30');
    const legacyRemaining = parseLoanNumber(i.yearsLeft ?? i.origYears ?? '30');
    const prefillStart = loanStartFromRemainingMonths(prefillTerm * 12, legacyRemaining * 12);
    setOrigYears(i.origYears ?? '30');
    setStartMonth(String(i.startMonth ?? prefillStart.startMonth));
    setStartYear(String(i.startYear ?? prefillStart.startYear));
    setManualBalance(null);
    setExtra(i.extra ?? '200');
    setLump(i.lump ?? '0');
    setHomeValue(i.homeValue ?? formatInputWithCommas('500000'));
    setTax(i.tax ?? formatInputWithCommas('3840'));
    setTaxFreq(i.taxFreq ?? 'annual');
    setInsurance(i.insurance ?? formatInputWithCommas('1560'));
    setInsuranceFreq(i.insuranceFreq ?? 'annual');
    setPmi(i.pmi ?? '0');
    setPmiFreq(i.pmiFreq ?? 'monthly');
    setHoa(i.hoa ?? '0');
    setHoaFreq(i.hoaFreq ?? 'monthly');
    setZip(i.zip ?? '');
    setZipInfo(null);
    setRecTax(null);
    setRecIns(null);
    setName(i.name ?? '');
    setLocationExpanded(false);
    setCostsExpanded(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    navigation.setParams({ prefill: undefined });
  }, [navigation, route.params?.prefill, route.params?.ts]);

  const origLoanN = parseLoanNumber(origLoan);
  const rateN = parseLoanNumber(rate);
  const origYearsN = parseLoanNumber(origYears);
  const startMonthN = parseLoanNumber(startMonth);
  const startYearN = parseLoanNumber(startYear);
  const loanTimeline = getLoanTimeline(startMonthN, startYearN, origYearsN * 12);
  const remainingMonths = loanTimeline.remainingMonths;
  const yearsLeftN = remainingMonths / 12;
  const extraN = parseLoanNumber(extra);
  const lumpN = parseLoanNumber(lump);
  const homeValueN = parseLoanNumber(homeValue);
  const taxN = parseLoanNumber(tax);
  const insuranceN = parseLoanNumber(insurance);
  const pmiN = parseLoanNumber(pmi);
  const hoaN = parseLoanNumber(hoa);
  const perOf = (freq) => FREQS.find((option) => option.key === freq)?.per || 1;
  const taxMonthly = Number.isFinite(taxN) ? taxN / perOf(taxFreq) : 0;
  const insuranceMonthly = Number.isFinite(insuranceN) ? insuranceN / perOf(insuranceFreq) : 0;
  const pmiMonthly = Number.isFinite(pmiN) ? pmiN / perOf(pmiFreq) : 0;
  const hoaMonthly = Number.isFinite(hoaN) ? hoaN / perOf(hoaFreq) : 0;
  const housingCostsMonthly = taxMonthly + insuranceMonthly + pmiMonthly + hoaMonthly;

  const baseValidationError =
    loanTimeline.error ||
    validatePayoffScenario({
      originalLoan: origLoanN,
      rate: rateN,
      originalTerm: origYearsN,
      remainingTerm: yearsLeftN,
      extra: extraN,
      lump: lumpN,
      termLabel: 'term',
      maxTerm: 50,
    });

  // Derive the current balance as a default, while allowing borrowers who know
  // the exact figure to replace it (for example, after prior extra principal).
  const estimatedBalance = !baseValidationError
    ? remainingBalanceFromOriginal(origLoanN, rateN, origYearsN * 12, remainingMonths)
    : 0;
  const manualBalanceN = manualBalance == null ? NaN : parseLoanNumber(manualBalance);
  const balN = manualBalance == null ? estimatedBalance : manualBalanceN;
  const balanceValidationError =
    manualBalance != null && (!Number.isFinite(manualBalanceN) || manualBalanceN <= 0)
      ? 'Estimated remaining balance must be a valid amount greater than 0.'
      : manualBalance != null && manualBalanceN > origLoanN
        ? 'Estimated remaining balance cannot exceed the original loan amount.'
        : null;
  const displayedBalance =
    manualBalance ??
    (estimatedBalance > 0 ? formatInputWithCommas(String(Math.round(estimatedBalance))) : '');
  const loanValidationError =
    baseValidationError ||
    balanceValidationError ||
    validatePayoffScenario({
      originalLoan: origLoanN,
      rate: rateN,
      originalTerm: origYearsN,
      remainingTerm: yearsLeftN,
      extra: extraN,
      lump: lumpN,
      currentBalance: balN,
      termLabel: 'term',
      maxTerm: 50,
    });
  const housingValidationError =
    !Number.isFinite(taxN) || taxN < 0
      ? 'Property tax must be a valid amount of 0 or more.'
      : !Number.isFinite(insuranceN) || insuranceN < 0
        ? 'Home insurance must be a valid amount of 0 or more.'
        : !Number.isFinite(pmiN) || pmiN < 0
          ? 'Mortgage insurance must be a valid amount of 0 or more.'
          : !Number.isFinite(hoaN) || hoaN < 0
            ? 'HOA dues must be a valid amount of 0 or more.'
            : null;
  const validationError = loanValidationError || housingValidationError;

  // Keep the overlapping current-loan fields ready for an automatic handoff
  // when the user selects the Refinance tab from the bottom navigation.
  useEffect(() => {
    if (loanValidationError) return;
    publishPayoffLoan({
      originalLoan: origLoan,
      curRate: rate,
      origYears,
      startMonth,
      startYear,
      curYears: String(yearsLeftN),
      currentBalance: formatInputWithCommas(String(Math.round(balN))),
      balanceAdjusted: manualBalance != null,
      zip,
      name,
    });
  }, [
    balN,
    loanValidationError,
    manualBalance,
    name,
    origLoan,
    origYears,
    rate,
    startMonth,
    startYear,
    yearsLeftN,
    zip,
  ]);

  // Keep the payment established by the original loan terms. Entering an exact
  // lower balance should shorten payoff, not recast the required payment.
  const scheduledPayment = balN > 0 ? monthlyPI(origLoanN, rateN, origYearsN) : 0;

  // Apply the one-time lump sum immediately against the balance for the
  // accelerated scenario. The lump reduces the starting principal.
  const balAfterLump = validationError ? 0 : Math.max(balN - lumpN, 0);

  // Baseline: exact current balance paid using the established loan payment.
  const base = balN > 0 ? amortizeWithPayment(balN, rateN, scheduledPayment) : null;

  // Accelerated scenario: start from the balance AFTER the lump sum, but keep
  // paying the ORIGINAL scheduled monthly payment (plus any monthly extra).
  // Because the balance is lower, the same payment kills the loan faster — so
  // the payoff time genuinely drops. This is the correct behaviour for a
  // one-time lump sum payment.
  const withExtra =
    !validationError && balN > 0
      ? balAfterLump <= 0
        ? { months: 0, totalInterest: 0, monthlyPayment: 0, schedule: [{ year: 0, balance: 0 }] }
        : amortizeWithPayment(balAfterLump, rateN, scheduledPayment + extraN)
      : null;

  const hasAccel = (extraN > 0 || lumpN > 0) && balN > 0;

  const monthsSaved = base && withExtra ? base.months - withExtra.months : 0;
  const interestSaved = base && withExtra ? base.totalInterest - withExtra.totalInterest : 0;
  const currentMonthlyHousingCost = scheduledPayment + housingCostsMonthly;
  const newMonthlyHousingCost = withExtra
    ? withExtra.monthlyPayment + housingCostsMonthly
    : housingCostsMonthly;

  const computeRecommendations = (info, estimatedHomeValue) => {
    const value = estimatedHomeValue > 0 ? estimatedHomeValue : 500000;
    const taxEstimate = estimatePropertyTax(info, value);
    const insuranceEstimate = estimateHomeInsurance(info, value);
    setRecTax(taxEstimate.annualEstimate);
    setRecIns(insuranceEstimate.annualEstimate);
    setRecInsDetails(insuranceEstimate);
  };

  useEffect(() => {
    if (zipInfo) computeRecommendations(zipInfo, homeValueN);
  }, [homeValueN, zipInfo]);

  const lookupZip = async () => {
    const clean = zip.replace(/[^0-9]/g, '');
    if (!Number.isFinite(homeValueN) || homeValueN <= 0) {
      setZipError('Enter a valid estimated home value before looking up the ZIP code.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
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
      computeRecommendations(info, homeValueN);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setZipError("Couldn't find that ZIP code. Check it and try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setZipLoading(false);
    }
  };

  const applyBothRecommendations = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (recTax != null) {
      setTax(formatInputWithCommas(String(Math.round(recTax))));
      setTaxFreq('annual');
    }
    if (recIns != null) {
      setInsurance(formatInputWithCommas(String(Math.round(recIns))));
      setInsuranceFreq('annual');
    }
  };

  const applyPreset = (amt) => {
    Haptics.selectionAsync();
    setExtra(String(amt));
  };

  const applyLumpPreset = (amt) => {
    Haptics.selectionAsync();
    setLump(String(amt));
  };

  const exploreRefinancing = () => {
    if (loanValidationError) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Check Your Loan Details', loanValidationError);
      return;
    }

    Haptics.selectionAsync();
    navigation.getParent()?.navigate('Refinance', {
      screen: 'RefinanceHome',
      params: {
        prefill: {
          originalLoan: origLoan,
          curRate: rate,
          origYears,
          startMonth,
          startYear,
          curYears: String(yearsLeftN),
          currentBalance: formatInputWithCommas(String(Math.round(balN))),
          balanceAdjusted: manualBalance != null,
          newRate: '6.00',
          newTerm: String(Math.max(1, Math.ceil(yearsLeftN))),
          costs: formatInputWithCommas('10000'),
          zip,
          name: name ? `${name} Refinance` : '',
        },
        ts: Date.now(),
      },
    });
  };

  const viewProjectedImpact = () => {
    if (validationError || !base || !withExtra || !hasAccel) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Check Your Plan',
        validationError || 'Add a monthly extra, a one-time payment, or both.',
      );
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.navigate('PayoffResult', {
      currentBalance: balN,
      balanceAfterLump: balAfterLump,
      originalLoan: origLoanN,
      rate: rateN,
      originalTerm: origYearsN,
      yearsRemaining: yearsLeftN,
      extra: extraN,
      lump: lumpN,
      currentPayment: scheduledPayment,
      newPayment: withExtra.monthlyPayment,
      currentMonthlyHousingCost,
      newMonthlyHousingCost,
      propertyTax: taxMonthly,
      insurance: insuranceMonthly,
      mortgageInsurance: pmiMonthly,
      hoa: hoaMonthly,
      currentPayoffMonths: base.months,
      newPayoffMonths: withExtra.months,
      currentInterest: base.totalInterest,
      newInterest: withExtra.totalInterest,
      monthsSaved,
      interestSaved,
      currentSchedule: base.schedule,
      newSchedule: withExtra.schedule,
      inputs: {
        origLoan,
        rate,
        origYears,
        startMonth,
        startYear,
        currentBalance: formatInputWithCommas(String(Math.round(balN))),
        balanceAdjusted: manualBalance != null,
        extra,
        lump,
        homeValue,
        tax,
        taxFreq,
        insurance,
        insuranceFreq,
        pmi,
        pmiFreq,
        hoa,
        hoaFreq,
        zip,
      },
      presetName: name,
    });
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Payoff Accelerator"
        subtitle="Plan a faster path to mortgage-free"
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
          showsVerticalScrollIndicator={false}
        >
          <ValidationBanner message={validationError} />
          <Text style={styles.sectionTitle}>Loan Details</Text>
          <View style={styles.sectionCard}>
            <View style={styles.rowInputs}>
              <View style={styles.loanAmountInput}>
                <InputField
                  label="Original Loan Amount"
                  value={origLoan}
                  onChangeText={setOrigLoan}
                  prefix="$"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={styles.interestRateInput}>
                <InputField
                  label="Interest Rate"
                  value={rate}
                  onChangeText={setRate}
                  suffix="%"
                  accentColor={COLORS.purple}
                />
              </View>
            </View>
            <InputField
              label="Loan Term"
              value={origYears}
              onChangeText={setOrigYears}
              suffix="yr"
              accentColor={COLORS.pink}
            />
            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Start Month"
                  value={startMonth}
                  onChangeText={setStartMonth}
                  placeholder="1–12"
                  accentColor={COLORS.teal}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <InputField
                  label="Start Year"
                  value={startYear}
                  onChangeText={setStartYear}
                  placeholder="YYYY"
                  accentColor={COLORS.teal}
                />
              </View>
            </View>

            <InputField
              label="Estimated Remaining Balance"
              value={displayedBalance}
              onChangeText={setManualBalance}
              prefix="$"
              accentColor={COLORS.accent}
            />

            <View style={styles.hintRow}>
              <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
              <Text style={styles.hintText}>
                We estimate this balance from the amortization schedule. Replace it with your exact
                remaining principal when available.
              </Text>
            </View>
            {manualBalance != null ? (
              <TouchableOpacity
                style={styles.resetEstimateBtn}
                onPress={() => setManualBalance(null)}
                accessibilityRole="button"
                accessibilityLabel="Use calculated remaining balance"
              >
                <Ionicons name="refresh" size={15} color={COLORS.accent} />
                <Text style={styles.resetEstimateText}>Use calculated estimate</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.refinanceHandoff}
            activeOpacity={0.85}
            onPress={exploreRefinancing}
            accessibilityRole="button"
          >
            <View style={styles.refinanceHandoffIcon}>
              <Ionicons name="swap-horizontal" size={19} color={COLORS.purple} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.refinanceHandoffTitle}>Explore Refinancing</Text>
              <Text style={styles.refinanceHandoffText}>
                Use these loan details to compare a new offer.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={COLORS.textMuted} />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Improve Accuracy</Text>
          <View style={styles.zipCard}>
            <TouchableOpacity
              style={styles.accordionHead}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={{ expanded: locationExpanded }}
              onPress={() => {
                Haptics.selectionAsync();
                setLocationExpanded((current) => !current);
              }}
            >
              <View style={[styles.zipIcon, { backgroundColor: COLORS.teal + '22' }]}>
                <Ionicons name="location" size={18} color={COLORS.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.zipTitle}>
                  {zipInfo ? 'Location estimates ready' : 'Use ZIP for local estimates'}
                </Text>
                <Text style={styles.zipSub}>
                  {zipInfo
                    ? `${zipInfo.city}, ${zipInfo.stateCode} · property tax and insurance`
                    : zip
                      ? `ZIP ${zip} saved · tap to refresh local estimates.`
                      : 'Estimate property tax and home insurance for your area.'}
                </Text>
              </View>
              <Ionicons
                name={locationExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            {locationExpanded ? (
              <View style={styles.accordionBody}>
                <InputField
                  label="Estimated Home Value"
                  value={homeValue}
                  onChangeText={setHomeValue}
                  prefix="$"
                  accentColor={COLORS.accent}
                />
                <View style={styles.valueHint}>
                  <Ionicons name="information-circle" size={14} color={COLORS.textMuted} />
                  <Text style={styles.valueHintText}>
                    Used only to estimate property tax and insurance—not your loan balance.
                  </Text>
                </View>

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
                        setRecTax(null);
                        setRecIns(null);
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
                    <View style={styles.zipRecRow}>
                      <View style={styles.zipRecCol}>
                        <Text style={styles.zipRecLabel}>Est. Property Tax</Text>
                        <Text style={[styles.zipRecValue, { color: COLORS.amber }]}>
                          {recTax != null ? `${fmtMoney(recTax)}/yr` : '—'}
                        </Text>
                        <Text style={styles.zipRecNote}>
                          {zipInfo.effectiveRate.toFixed(2)}% ·{' '}
                          {zipInfo.hasCountyData ? 'county estimate' : 'state fallback'}
                        </Text>
                      </View>
                      <View style={styles.zipRecCol}>
                        <Text style={styles.zipRecLabel}>Est. Home Insurance</Text>
                        <Text style={[styles.zipRecValue, { color: COLORS.teal }]}>
                          {recIns != null ? `${fmtMoney(recIns)}/yr` : '—'}
                        </Text>
                        <Text style={styles.zipRecNote}>
                          {recInsDetails?.isCountyEstimate
                            ? `${fmtMoney(recInsDetails.annualLow)}–${fmtMoney(
                                recInsDetails.annualHigh,
                              )} county range`
                            : `${zipInfo.stateCode} state fallback`}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.applyAllBtn}
                      activeOpacity={0.9}
                      onPress={applyBothRecommendations}
                    >
                      <Ionicons name="download" size={16} color="#fff" />
                      <Text style={styles.applyAllText}>Apply tax & insurance estimates</Text>
                    </TouchableOpacity>
                    <Text style={styles.zipDisclaimer}>
                      Estimates use {zipInfo.source}
                      {zipInfo.sourceYear ? ` ${zipInfo.sourceYear}` : ''}. Insurance reflects
                      county costs for mortgaged homes when available. Apply your current tax bill,
                      insurance premium, and HOA statement below when available.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Housing Costs & Mortgage Insurance</Text>
          <View style={styles.costsCard}>
            <TouchableOpacity
              style={styles.accordionHead}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={{ expanded: costsExpanded }}
              onPress={() => {
                Haptics.selectionAsync();
                setCostsExpanded((current) => !current);
              }}
            >
              <View style={[styles.zipIcon, { backgroundColor: COLORS.accent + '22' }]}>
                <Ionicons name="wallet" size={18} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.zipTitle}>Monthly housing costs</Text>
                <Text style={styles.zipSub}>Open to fine-tune taxes, insurance, PMI, and HOA.</Text>
              </View>
              <Ionicons
                name={costsExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>

            <View style={styles.costSummaryRow}>
              <CostSummary label="Tax" value={taxMonthly} color={COLORS.amber} />
              <CostSummary label="Insurance" value={insuranceMonthly} color={COLORS.teal} />
            </View>
            <View style={[styles.costSummaryRow, styles.secondaryCostSummaryRow]}>
              <CostSummary label="PMI" value={pmiMonthly} color={COLORS.purple} />
              <CostSummary label="HOA" value={hoaMonthly} color={COLORS.pink} />
            </View>

            {costsExpanded ? (
              <View style={styles.accordionBody}>
                <View style={styles.extrasHint}>
                  <Ionicons name="repeat" size={15} color={COLORS.textMuted} />
                  <Text style={styles.extrasHintText}>
                    Enter each amount at the cadence you are billed. We will convert it to a monthly
                    amount.
                  </Text>
                </View>
                <ExtraField
                  label="Property Tax"
                  value={tax}
                  onChangeValue={setTax}
                  freq={taxFreq}
                  onChangeFreq={setTaxFreq}
                  accentColor={COLORS.amber}
                  recommended={zipInfo ? recTax : null}
                />
                <ExtraField
                  label="Home Insurance"
                  value={insurance}
                  onChangeValue={setInsurance}
                  freq={insuranceFreq}
                  onChangeFreq={setInsuranceFreq}
                  accentColor={COLORS.teal}
                  recommended={zipInfo ? recIns : null}
                />
                <ExtraField
                  label="Private Mortgage Insurance (PMI)"
                  value={pmi}
                  onChangeValue={setPmi}
                  freq={pmiFreq}
                  onChangeFreq={setPmiFreq}
                  accentColor={COLORS.purple}
                />
                <ExtraField
                  label="HOA Dues"
                  value={hoa}
                  onChangeValue={setHoa}
                  freq={hoaFreq}
                  onChangeFreq={setHoaFreq}
                  accentColor={COLORS.pink}
                />
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Acceleration Plan</Text>
          <View style={styles.sectionCard}>
            <View style={styles.planHeading}>
              <View style={[styles.planIcon, { backgroundColor: COLORS.green + '1C' }]}>
                <Ionicons name="repeat" size={18} color={COLORS.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>Extra Each Month</Text>
                <Text style={styles.planSub}>Added directly to your principal.</Text>
              </View>
            </View>
            <InputField
              label="Additional Principal per Month"
              value={extra}
              onChangeText={setExtra}
              prefix="$"
              accentColor={COLORS.green}
            />
            <View style={styles.presetRow}>
              {PRESETS.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[styles.preset, extraN === amt && styles.presetActive]}
                  activeOpacity={0.8}
                  onPress={() => applyPreset(amt)}
                >
                  <Text style={[styles.presetText, extraN === amt && styles.presetTextActive]}>
                    +${amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.planDivider} />
            <View style={styles.planHeading}>
              <View style={[styles.planIcon, { backgroundColor: COLORS.amber + '1C' }]}>
                <Ionicons name="flash" size={18} color={COLORS.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planTitle}>One-Time Payment</Text>
                <Text style={styles.planSub}>Applied to your balance immediately.</Text>
              </View>
            </View>
            <InputField
              label="Lump Sum Payment"
              value={lump}
              onChangeText={setLump}
              prefix="$"
              accentColor={COLORS.amber}
            />
            <View style={styles.presetRow}>
              {LUMP_PRESETS.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[styles.presetLump, lumpN === amt && styles.presetLumpActive]}
                  activeOpacity={0.8}
                  onPress={() => applyLumpPreset(amt)}
                >
                  <Text style={[styles.presetText, lumpN === amt && styles.presetLumpTextActive]}>
                    +${amt >= 1000 ? `${amt / 1000}k` : amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.hintRow}>
              <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
              <Text style={styles.hintText}>
                Combine either strategy—or use both—to compare a faster payoff.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Projected Impact</Text>
          {hasAccel && withExtra ? (
            <TouchableOpacity
              style={styles.projectImpactBtn}
              activeOpacity={0.9}
              onPress={viewProjectedImpact}
              accessibilityRole="button"
            >
              <View style={styles.projectImpactIcon}>
                <Ionicons name="analytics" size={21} color="#fff" />
              </View>
              <Text style={styles.projectImpactText}>View Projected Impact</Text>
              <Ionicons name="chevron-forward" size={21} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyHint}>
              <Ionicons name="bulb" size={22} color={COLORS.amber} />
              <Text style={styles.emptyText}>
                Add a monthly extra, a one-time payment, or both to see your potential savings.
              </Text>
            </View>
          )}
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
  interestRateInput: { flex: 0.8 },
  resetEstimateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginTop: 8,
    borderRadius: 9,
    backgroundColor: COLORS.accent + '12',
  },
  resetEstimateText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  refinanceHandoff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.purple + '3D',
    padding: 14,
    marginTop: -4,
    marginBottom: 18,
  },
  refinanceHandoffIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.purple + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refinanceHandoffTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  refinanceHandoffText: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 3,
  },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  hintText: { color: COLORS.textMuted, fontSize: 12, flex: 1, fontWeight: '500', lineHeight: 17 },
  zipCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  costsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  accordionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  accordionBody: {
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
    lineHeight: 16,
  },
  valueHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: -4,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  valueHintText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 15,
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
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 104,
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
  zipRecRow: { flexDirection: 'row', gap: 12 },
  zipRecCol: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  zipRecLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  zipRecValue: { fontSize: 18, fontWeight: '900', marginTop: 4 },
  zipRecNote: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', marginTop: 3 },
  applyAllBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  applyAllText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },
  zipDisclaimer: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 10,
    lineHeight: 15,
  },
  costSummaryRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  secondaryCostSummaryRow: { marginTop: 8 },
  costSummaryItem: {
    flex: 1,
    minWidth: 0,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 11,
    paddingHorizontal: 9,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  costSummaryDot: { width: 7, height: 7, borderRadius: 4, marginBottom: 6 },
  costSummaryLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '700' },
  costSummaryValue: { fontSize: 12, fontWeight: '900', marginTop: 3 },
  extrasHint: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  extrasHintText: {
    color: COLORS.textMuted,
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
    lineHeight: 17,
  },
  extraWrap: { marginBottom: 8 },
  freqRow: { flexDirection: 'row', gap: 8, marginTop: -6, marginBottom: 4 },
  freqBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 12 },
  freqTextActive: { color: '#fff' },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 2 },
  recText: { fontSize: 12, fontWeight: '700', flex: 1 },
  recApply: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  recApplyText: { fontSize: 12, fontWeight: '800' },
  planHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  planSub: { color: COLORS.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  planDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 1 },
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
  projectImpactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  projectImpactIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectImpactText: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 },
  projectedImpactCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  projectedImpactTop: {
    backgroundColor: COLORS.green + '18',
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    padding: 20,
  },
  highlightIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.green + '1C',
    alignItems: 'center',
    justifyContent: 'center',
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
    marginHorizontal: 16,
  },
  lumpBannerText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  impactSectionDivider: {
    height: 1,
    backgroundColor: COLORS.green + '44',
    marginHorizontal: 16,
    marginTop: 14,
  },
  impactMetrics: {
    flexDirection: 'row',
    padding: 16,
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
  metricDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  metricValue: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '800' },
  metricLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 4 },
  metricSub: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  housingCostNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.teal + '12',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.teal + '35',
    padding: 13,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  housingCostNoteText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  projectedNarrative: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.accent + '28',
    padding: 16,
    marginTop: 12,
  },
  projectedNarrativeIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectedNarrativeText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent + '12',
    borderRadius: 12,
    padding: 11,
    marginBottom: 16,
  },
  chartSub: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', flex: 1 },
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.green + '18',
    borderWidth: 1,
    borderColor: COLORS.green + '44',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 18,
  },
  savingsBannerText: { color: COLORS.green, fontSize: 12, fontWeight: '700', flex: 1 },
  emptyHint: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.amber + '15',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.amber + '35',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },
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
  saveBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  savedBtn: { backgroundColor: COLORS.green, marginTop: 0 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
