import React, { useState, useEffect, useRef } from 'react';
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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import GradientHeader from '../components/GradientHeader';
import InputField, { ValidationBanner } from '../components/InputField';
import {
  COLORS,
  STORAGE_KEYS,
  monthlyPI,
  fmtMoney,
  formatInputWithCommas,
  parseLoanNumber,
  validateMortgageEstimate,
} from '../theme';
import { lookupTaxByZip } from '../taxApi';
import { estimateClosingCosts, estimateHomeInsurance, estimatePropertyTax } from '../costEstimator';
import { SCENARIO_TYPES } from '../savedScenarios';
import useScrollToTopOnFocus from '../components/useScrollToTopOnFocus';

// Frequency options for the "monthly extras". The user can enter a value at
// any cadence and we convert it to a monthly-equivalent for the payment math.
const FREQS = [
  { key: 'monthly', label: 'Monthly', per: 1 },
  { key: 'quarterly', label: 'Quarterly', per: 3 },
  { key: 'annual', label: 'Annual', per: 12 },
];

// A monthly-extra row: label + amount input + frequency toggle. The math for
// the monthly-equivalent is intentionally NOT shown (per requirements) — we
// simply convert behind the scenes.
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
        {FREQS.map((f) => {
          const active = freq === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.85}
              style={[
                styles.freqBtn,
                active && { backgroundColor: accentColor, borderColor: accentColor },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                onChangeFreq(f.key);
              }}
            >
              <Text style={[styles.freqText, active && styles.freqTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {recommended != null ? (
        <View style={styles.recRow}>
          <Ionicons name="sparkles" size={13} color={accentColor} />
          <Text style={[styles.recText, { color: accentColor }]}>
            Recommended: {fmtMoney(recommended)}/yr · tap to apply
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

export default function EstimatorScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const scrollRef = useRef(null);
  useScrollToTopOnFocus(scrollRef, undefined, 'Estimate');
  const [price, setPrice] = useState(formatInputWithCommas('450000'));
  const [down, setDown] = useState(formatInputWithCommas('90000'));
  const [rate, setRate] = useState('6.75');
  const [term, setTerm] = useState('30');
  const [tax, setTax] = useState(formatInputWithCommas('3840'));
  const [taxFreq, setTaxFreq] = useState('annual');
  const [insurance, setInsurance] = useState(formatInputWithCommas('1560'));
  const [insuranceFreq, setInsuranceFreq] = useState('annual');
  const [hoa, setHoa] = useState('0');
  const [hoaFreq, setHoaFreq] = useState('monthly');
  const [includePmi, setIncludePmi] = useState(true);
  const [presetName, setPresetName] = useState('');
  const [locationExpanded, setLocationExpanded] = useState(false);
  const [costsExpanded, setCostsExpanded] = useState(false);

  // ZIP code lookup state
  const [zip, setZip] = useState('');
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState('');
  const [zipInfo, setZipInfo] = useState(null); // full tax breakdown object
  const [recTax, setRecTax] = useState(null); // recommended annual tax
  const [recIns, setRecIns] = useState(null); // recommended annual insurance
  const [recInsDetails, setRecInsDetails] = useState(null);

  const fmt = (v) => formatInputWithCommas(String(v ?? ''));

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.DEFAULTS);
        if (raw) {
          const d = JSON.parse(raw);
          const needsAnnualCadenceMigration = (d.costCadenceVersion ?? 0) < 2;
          const storedTaxFreq = d.taxFreq ?? 'monthly';
          const storedInsuranceFreq = d.insuranceFreq ?? 'monthly';
          const storedTax = fmt(d.tax ?? '320');
          const storedInsurance = fmt(d.insurance ?? '130');
          setPrice(fmt(d.price ?? '450000'));
          setDown(fmt(d.down ?? '90000'));
          setRate(fmt(d.rate ?? '6.75'));
          setTerm(String(d.term ?? 30));
          setTax(
            needsAnnualCadenceMigration && storedTaxFreq === 'monthly'
              ? fmt(parseLoanNumber(storedTax) * 12)
              : storedTax,
          );
          setTaxFreq(
            needsAnnualCadenceMigration && storedTaxFreq === 'monthly' ? 'annual' : storedTaxFreq,
          );
          setInsurance(
            needsAnnualCadenceMigration && storedInsuranceFreq === 'monthly'
              ? fmt(parseLoanNumber(storedInsurance) * 12)
              : storedInsurance,
          );
          setInsuranceFreq(
            needsAnnualCadenceMigration && storedInsuranceFreq === 'monthly'
              ? 'annual'
              : storedInsuranceFreq,
          );
          setHoa(fmt(d.hoa ?? '0'));
          setHoaFreq(d.hoaFreq ?? 'monthly');
          if (typeof d.includePmi === 'boolean') setIncludePmi(d.includePmi);
          if (d.zip) setZip(d.zip);
        }
      } catch {}
    })();
  }, []);

  // Restore a saved estimate when navigated from the Saved tab.
  useEffect(() => {
    const r = route.params?.restore;
    if (r && r.type === SCENARIO_TYPES.HOME_PURCHASE && r.inputs) {
      const i = r.inputs;
      setPrice(fmt(i.price ?? String(r.price ?? '450000')));
      setDown(fmt(i.down ?? '90000'));
      setRate(fmt(i.rate ?? String(r.rate ?? '6.75')));
      setTerm(String(i.term ?? r.term ?? 30));
      setTax(fmt(i.tax ?? '3840'));
      setTaxFreq(i.taxFreq ?? 'annual');
      setInsurance(fmt(i.insurance ?? '1560'));
      setInsuranceFreq(i.insuranceFreq ?? 'annual');
      setHoa(fmt(i.hoa ?? '0'));
      setHoaFreq(i.hoaFreq ?? 'monthly');
      if (typeof i.includePmi === 'boolean') setIncludePmi(i.includePmi);
      if (i.zip) setZip(i.zip);
      setPresetName(r.name || '');
      navigation.setParams({ restore: undefined });
    }
  }, [navigation, route.params?.restore, route.params?.ts]);

  const num = parseLoanNumber;
  const perOf = (freq) => FREQS.find((f) => f.key === freq)?.per || 1;

  const priceN = num(price);
  const downN = num(down);
  const rateN = num(rate);
  const termN = num(term);
  const taxN = num(tax);
  const insuranceN = num(insurance);
  const hoaN = num(hoa);
  const loanAmount = Math.max(priceN - downN, 0);
  const downPct = priceN > 0 ? (downN / priceN) * 100 : 0;
  const validationError = validateMortgageEstimate({
    price: priceN,
    down: downN,
    rate: rateN,
    termYears: termN,
    propertyTax: taxN,
    insurance: insuranceN,
    hoa: hoaN,
  });
  const pi = !validationError && loanAmount > 0 ? monthlyPI(loanAmount, rateN, termN) : 0;
  const pmiEligible = downPct < 20 && loanAmount > 0;
  const pmi = pmiEligible && includePmi ? (loanAmount * 0.007) / 12 : 0;

  // Convert every "extra" to its monthly-equivalent based on its frequency.
  const taxMonthly = Number.isFinite(taxN) ? taxN / perOf(taxFreq) : 0;
  const insuranceMonthly = Number.isFinite(insuranceN) ? insuranceN / perOf(insuranceFreq) : 0;
  const hoaMonthly = Number.isFinite(hoaN) ? hoaN / perOf(hoaFreq) : 0;

  const total = pi + taxMonthly + insuranceMonthly + pmi + hoaMonthly;
  const otherMonthly = taxMonthly + insuranceMonthly + pmi + hoaMonthly;

  const closingEstimate = estimateClosingCosts(zipInfo, {
    homePrice: priceN,
    loanAmount,
    purpose: 'purchase',
  });
  const closingCosts = closingEstimate.estimate;

  // Compute recommended annual tax and insurance from the resolved county tax
  // rate and the current home price.
  const computeRecommendations = (info, homePrice) => {
    const price0 = homePrice > 0 ? homePrice : 450000;

    const taxEstimate = estimatePropertyTax(info, price0);
    const insuranceEstimate = estimateHomeInsurance(info, price0);
    setRecTax(taxEstimate.annualEstimate);
    setRecIns(insuranceEstimate.annualEstimate);
    setRecInsDetails(insuranceEstimate);
  };

  // Recompute recommendations when the price changes (if a ZIP was resolved).
  useEffect(() => {
    if (zipInfo) {
      computeRecommendations(zipInfo, priceN);
    }
  }, [priceN, zipInfo]);

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
      computeRecommendations(info, priceN);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setZipError("Couldn't find that ZIP code. Check it and try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setZipLoading(false);
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

  const calculate = async () => {
    if (validationError) {
      if (/Property tax|Homeowners insurance|HOA/.test(validationError)) {
        setCostsExpanded(true);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Check Your Inputs', validationError);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const payload = {
      costCadenceVersion: 2,
      price,
      down,
      rate,
      term: termN,
      tax,
      taxFreq,
      insurance,
      insuranceFreq,
      hoa,
      hoaFreq,
      includePmi,
      zip,
    };
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DEFAULTS, JSON.stringify(payload));
    } catch {}
    navigation.navigate('Result', {
      loanAmount,
      rate: num(rate),
      term: termN,
      monthlyPI: pi,
      tax: taxMonthly,
      insurance: insuranceMonthly,
      pmi,
      hoa: hoaMonthly,
      total,
      price: priceN,
      down: downN,
      downPct,
      closingCosts,
      closingCostsLow: closingEstimate.low,
      closingCostsHigh: closingEstimate.high,
      closingCostSource: closingEstimate.source,
      closingCostSourceYear: closingEstimate.sourceYear,
      closingState: zipInfo
        ? zipInfo.countyDisplay
          ? `${zipInfo.countyDisplay}, ${zipInfo.stateCode}`
          : zipInfo.state
        : null,
      inputs: payload,
      presetName,
    });
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Mortgage Estimate"
        subtitle="Build a clear monthly payment plan"
        icon="home-outline"
        variant="financial"
        onIconPress={() => navigation.getParent()?.navigate('Home')}
        iconAccessibilityLabel="Return to home"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.formScroll}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {presetName ? (
            <View style={styles.restoreBanner}>
              <Ionicons name="bookmark" size={16} color={COLORS.accent} />
              <Text style={styles.restoreText}>Loaded "{presetName}"</Text>
            </View>
          ) : null}

          <ValidationBanner message={validationError} />

          <View style={styles.previewCard}>
            <View style={styles.previewAccent} />
            <View style={styles.previewHead}>
              <View style={styles.liveDot} />
              <Text style={styles.previewLabel}>LIVE MONTHLY ESTIMATE</Text>
              <Text style={styles.previewStatus}>Updates as you edit</Text>
            </View>
            <View style={styles.previewAmountRow}>
              <Text style={styles.previewValue}>{fmtMoney(total)}</Text>
              <Text style={styles.previewUnit}>/ month</Text>
            </View>
            <View style={styles.previewDivider} />
            <View style={styles.previewBreakdown}>
              <View style={styles.previewMetric}>
                <Text style={styles.previewMetricLabel}>Principal & interest</Text>
                <Text style={styles.previewMetricValue}>{fmtMoney(pi)}</Text>
              </View>
              <View style={styles.previewMetricDivider} />
              <View style={styles.previewMetric}>
                <Text style={styles.previewMetricLabel}>Taxes, insurance & other</Text>
                <Text style={styles.previewMetricValue}>{fmtMoney(otherMonthly)}</Text>
              </View>
            </View>
            <View style={styles.previewDisclosure}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
              <Text style={styles.previewDisclosureText}>
                Planning estimate based on your inputs — not a lender quote.
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Loan Basics</Text>
          <View style={styles.basicsCard}>
            <InputField label="Home Price" value={price} onChangeText={setPrice} prefix="$" />
            <InputField label="Down Payment" value={down} onChangeText={setDown} prefix="$" />
            <View style={styles.loanTermsRow}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Interest Rate"
                  value={rate}
                  onChangeText={setRate}
                  suffix="%"
                  accentColor={COLORS.purple}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <InputField
                  label="Loan Term"
                  value={term}
                  onChangeText={setTerm}
                  suffix="yr"
                  accentColor={COLORS.accent}
                />
              </View>
            </View>
          </View>

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
                    ? `${zipInfo.city}, ${zipInfo.stateCode} · taxes, insurance and closing costs`
                    : zip
                      ? `ZIP ${zip} saved · tap to refresh local estimates.`
                      : 'Estimate taxes, insurance and closing costs for your area.'}
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

                    <View style={styles.closingCard}>
                      <View style={styles.closingHead}>
                        <View
                          style={[styles.closingIcon, { backgroundColor: COLORS.purple + '22' }]}
                        >
                          <Ionicons name="document-text" size={16} color={COLORS.purple} />
                        </View>
                        <Text style={styles.closingLabel}>Est. Closing Costs</Text>
                        <Text style={[styles.closingValue, { color: COLORS.purple }]}>
                          {fmtMoney(closingCosts)}
                        </Text>
                      </View>
                      <Text style={styles.closingNote}>
                        Planning range {fmtMoney(closingEstimate.low)}–
                        {fmtMoney(closingEstimate.high)} · {closingEstimate.source}
                        {closingEstimate.sourceYear ? ` ${closingEstimate.sourceYear}` : ''}.
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.applyAllBtn}
                      activeOpacity={0.9}
                      onPress={applyBothRecommendations}
                    >
                      <Ionicons name="download" size={16} color="#fff" />
                      <Text style={styles.applyAllText}>Apply tax & insurance to my estimate</Text>
                    </TouchableOpacity>
                    <Text style={styles.zipDisclaimer}>
                      Property tax and insurance use {zipInfo.source}
                      {zipInfo.sourceYear ? ` ${zipInfo.sourceYear}` : ''}. Insurance reflects
                      county costs for mortgaged homes when available; replace estimates with a tax
                      bill, insurer quote, or lender disclosure when available.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Taxes, Insurance & HOA</Text>
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
                <Text style={styles.zipSub}>Open to fine-tune taxes, insurance and HOA.</Text>
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
              <CostSummary label="HOA" value={hoaMonthly} color={COLORS.pink} />
            </View>

            {costsExpanded ? (
              <View style={styles.accordionBody}>
                <View style={styles.extrasHint}>
                  <Ionicons name="repeat" size={15} color={COLORS.textMuted} />
                  <Text style={styles.extrasHintText}>
                    Enter each amount at whatever cadence you're billed — we'll convert it to a
                    monthly figure.
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

          {pmiEligible ? (
            <View style={styles.pmiCard}>
              <View style={styles.pmiHead}>
                <View style={[styles.pmiIcon, { backgroundColor: COLORS.pink + '22' }]}>
                  <Ionicons name="shield-checkmark" size={18} color={COLORS.pink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pmiTitle}>Private Mortgage Insurance</Text>
                  <Text style={styles.pmiSub}>
                    Down payment is {downPct.toFixed(0)}% (under 20%). Lenders usually require PMI
                    of about {fmtMoney((loanAmount * 0.007) / 12)}/mo.
                  </Text>
                </View>
                <Switch
                  accessibilityLabel="Include private mortgage insurance"
                  value={includePmi}
                  onValueChange={(value) => {
                    Haptics.selectionAsync();
                    setIncludePmi(value);
                  }}
                  trackColor={{ false: COLORS.surfaceElevated, true: COLORS.pink }}
                  thumbColor="#fff"
                  ios_backgroundColor={COLORS.surfaceElevated}
                />
              </View>
              <View style={styles.pmiProgramNote}>
                <Ionicons name="information-circle" size={15} color={COLORS.teal} />
                <Text style={styles.pmiProgramNoteText}>
                  VA loans do not require PMI, and some other loan programs follow different
                  mortgage-insurance rules. Confirm the requirements with your lender.
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.bottomAction}>
            <TouchableOpacity style={styles.calcBtn} activeOpacity={0.9} onPress={calculate}>
              <Ionicons name="calculator" size={20} color="#fff" />
              <Text style={styles.calcText}>See Full Breakdown</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  formScroll: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 24 },
  restoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.accent + '18',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  restoreText: { color: COLORS.accent, fontSize: 13, fontWeight: '700' },
  previewCard: {
    backgroundColor: '#17243A',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(100,170,245,0.30)',
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 9,
    elevation: 3,
  },
  previewAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#4F9FF5',
  },
  previewHead: { flexDirection: 'row', alignItems: 'center' },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.green,
    marginRight: 7,
  },
  previewLabel: {
    color: '#9EC9F5',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  previewStatus: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  previewAmountRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 11 },
  previewValue: {
    color: COLORS.textPrimary,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  previewUnit: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 7,
    marginBottom: 6,
  },
  previewDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 14 },
  previewBreakdown: { flexDirection: 'row', alignItems: 'stretch' },
  previewMetric: { flex: 1 },
  previewMetricDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 14,
  },
  previewMetricLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  previewMetricValue: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 4,
  },
  previewDisclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(8,20,39,0.38)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 14,
  },
  previewDisclosureText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 7,
    marginBottom: 11,
  },
  basicsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  loanTermsRow: { flexDirection: 'row' },
  zipCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
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
  closingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 12,
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
  applyAllBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  applyAllText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  zipDisclaimer: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 10,
    lineHeight: 15,
  },
  extrasHint: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 0,
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
  costsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
  },
  costSummaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
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
  pmiCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pmiHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pmiIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pmiTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  pmiSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
    lineHeight: 17,
  },
  pmiProgramNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.teal + '10',
    borderRadius: 11,
    padding: 11,
    marginTop: 13,
  },
  pmiProgramNoteText: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 16,
    flex: 1,
  },
  bottomAction: { marginTop: 4, paddingTop: 4, paddingBottom: 8 },
  calcBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  calcText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
