import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import GradientHeader from '../components/GradientHeader';
import InputField from '../components/InputField';
import { COLORS, STORAGE_KEYS, monthlyPI, fmtMoney, fmtNum, formatInputWithCommas } from '../theme';
import { lookupTaxByZip } from '../taxApi';

const TERMS = [15, 20, 30];

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
function ExtraField({ label, value, onChangeValue, freq, onChangeFreq, accentColor, num, recommended }) {
  return (
    <View style={styles.extraWrap}>
      <InputField label={label} value={value} onChangeText={onChangeValue} prefix="$" accentColor={accentColor} />
      <View style={styles.freqRow}>
        {FREQS.map((f) => {
          const active = freq === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              activeOpacity={0.85}
              style={[styles.freqBtn, active && { backgroundColor: accentColor, borderColor: accentColor }]}
              onPress={() => { Haptics.selectionAsync(); onChangeFreq(f.key); }}
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
            Recommended: {fmtMoney(recommended)}/mo · tap to apply
          </Text>
          <TouchableOpacity
            style={[styles.recApply, { borderColor: accentColor }]}
            activeOpacity={0.8}
            onPress={() => { Haptics.selectionAsync(); onChangeValue(formatInputWithCommas(String(Math.round(recommended)))); onChangeFreq('monthly'); }}
          >
            <Text style={[styles.recApplyText, { color: accentColor }]}>Apply</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

export default function EstimatorScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const [price, setPrice] = useState(formatInputWithCommas('450000'));
  const [down, setDown] = useState(formatInputWithCommas('90000'));
  const [rate, setRate] = useState('6.75');
  const [term, setTerm] = useState(30);
  const [tax, setTax] = useState(formatInputWithCommas('320'));
  const [taxFreq, setTaxFreq] = useState('monthly');
  const [insurance, setInsurance] = useState(formatInputWithCommas('130'));
  const [insuranceFreq, setInsuranceFreq] = useState('monthly');
  const [hoa, setHoa] = useState('0');
  const [hoaFreq, setHoaFreq] = useState('monthly');
  const [includePmi, setIncludePmi] = useState(true);
  const [presetName, setPresetName] = useState('');

  // ZIP code lookup state
  const [zip, setZip] = useState('');
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState('');
  const [zipInfo, setZipInfo] = useState(null); // full tax breakdown object
  const [recTax, setRecTax] = useState(null); // recommended monthly tax
  const [recIns, setRecIns] = useState(null); // recommended monthly insurance

  const fmt = (v) => formatInputWithCommas(String(v ?? ''));

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.DEFAULTS);
        if (raw) {
          const d = JSON.parse(raw);
          setPrice(fmt(d.price ?? '450000'));
          setDown(fmt(d.down ?? '90000'));
          setRate(fmt(d.rate ?? '6.75'));
          setTerm(d.term ?? 30);
          setTax(fmt(d.tax ?? '320'));
          setTaxFreq(d.taxFreq ?? 'monthly');
          setInsurance(fmt(d.insurance ?? '130'));
          setInsuranceFreq(d.insuranceFreq ?? 'monthly');
          setHoa(fmt(d.hoa ?? '0'));
          setHoaFreq(d.hoaFreq ?? 'monthly');
          if (typeof d.includePmi === 'boolean') setIncludePmi(d.includePmi);
          if (d.zip) setZip(d.zip);
        }
      } catch (e) {}
    })();
  }, []);

  // Restore a saved estimate when navigated from the Saved tab.
  useEffect(() => {
    const r = route.params?.restore;
    if (r && r.type === 'purchase' && r.inputs) {
      const i = r.inputs;
      setPrice(fmt(i.price ?? String(r.price ?? '450000')));
      setDown(fmt(i.down ?? '90000'));
      setRate(fmt(i.rate ?? String(r.rate ?? '6.75')));
      setTerm(i.term ?? r.term ?? 30);
      setTax(fmt(i.tax ?? '320'));
      setTaxFreq(i.taxFreq ?? 'monthly');
      setInsurance(fmt(i.insurance ?? '130'));
      setInsuranceFreq(i.insuranceFreq ?? 'monthly');
      setHoa(fmt(i.hoa ?? '0'));
      setHoaFreq(i.hoaFreq ?? 'monthly');
      if (typeof i.includePmi === 'boolean') setIncludePmi(i.includePmi);
      if (i.zip) setZip(i.zip);
      setPresetName(r.name || '');
      navigation.setParams({ restore: undefined });
    }
  }, [route.params?.ts]);

  const num = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;
  const perOf = (freq) => FREQS.find((f) => f.key === freq)?.per || 1;

  const priceN = num(price);
  const downN = num(down);
  const loanAmount = Math.max(priceN - downN, 0);
  const downPct = priceN > 0 ? (downN / priceN) * 100 : 0;
  const pi = loanAmount > 0 ? monthlyPI(loanAmount, num(rate), term) : 0;
  const pmiEligible = downPct < 20 && loanAmount > 0;
  const pmi = pmiEligible && includePmi ? (loanAmount * 0.007) / 12 : 0;

  // Convert every "extra" to its monthly-equivalent based on its frequency.
  const taxMonthly = num(tax) / perOf(taxFreq);
  const insuranceMonthly = num(insurance) / perOf(insuranceFreq);
  const hoaMonthly = num(hoa) / perOf(hoaFreq);

  const total = pi + taxMonthly + insuranceMonthly + pmi + hoaMonthly;

  // ---- Approximate closing costs ----
  // Based on home price, down payment, loan term, and location (state rate).
  const closingRatePct = zipInfo?.closingRate != null ? zipInfo.closingRate : 3.0;
  // Term adjustment: 15yr slightly higher rate, 30yr baseline.
  const termAdj = term <= 15 ? 1.08 : term <= 20 ? 1.04 : 1.0;
  // Down payment adjustment: larger down payments reduce lender/points fees a bit.
  const downAdj = downPct >= 20 ? 0.95 : downPct >= 10 ? 1.0 : 1.05;
  const closingCosts = priceN > 0
    ? priceN * (closingRatePct / 100) * termAdj * downAdj
    : 0;

  // Compute recommended monthly tax + insurance from the resolved ZIP-local
  // tax breakdown and the current home price.
  const computeRecommendations = (info, homePrice) => {
    const price0 = homePrice > 0 ? homePrice : 450000;
    // Use the ZIP-LOCAL effective rate (county + municipal), not the flat state
    // average.
    const effRate = info.effectiveRate != null ? info.effectiveRate : info.stateRate;
    const annualTax = price0 * (effRate / 100);
    setRecTax(annualTax / 12);

    if (info.insBase != null) {
      const scale = Math.max(0.6, Math.min(2.5, price0 / 400000));
      setRecIns((info.insBase * scale) / 12);
    } else {
      setRecIns((price0 * 0.0035) / 12);
    }
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
    } catch (e) {
      setZipError("Couldn't find that ZIP code. Check it and try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setZipLoading(false);
  };

  const applyBothRecommendations = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (recTax != null) { setTax(formatInputWithCommas(String(Math.round(recTax)))); setTaxFreq('monthly'); }
    if (recIns != null) { setInsurance(formatInputWithCommas(String(Math.round(recIns)))); setInsuranceFreq('monthly'); }
  };

  const calculate = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const payload = { price, down, rate, term, tax, taxFreq, insurance, insuranceFreq, hoa, hoaFreq, includePmi, zip };
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DEFAULTS, JSON.stringify(payload));
    } catch (e) {}
    navigation.navigate('Result', {
      loanAmount, rate: num(rate), term, monthlyPI: pi,
      tax: taxMonthly, insurance: insuranceMonthly, pmi, hoa: hoaMonthly, total, price: priceN, down: downN, downPct,
      closingCosts,
      closingState: zipInfo ? (zipInfo.countyDisplay ? `${zipInfo.countyDisplay}, ${zipInfo.stateCode}` : zipInfo.state) : null,
      inputs: payload,
      presetName,
    });
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Mortgage Estimator"
        subtitle="Find your monthly payment"
        icon="home"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {presetName ? (
            <View style={styles.restoreBanner}>
              <Ionicons name="bookmark" size={16} color={COLORS.accent} />
              <Text style={styles.restoreText}>Loaded "{presetName}"</Text>
            </View>
          ) : null}

          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Estimated Monthly Payment</Text>
            <Text style={styles.previewValue}>{fmtMoney(total)}</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewSub}>Loan: {fmtMoney(loanAmount)}</Text>
              <Text style={styles.previewSub}>Down: {downPct.toFixed(0)}%</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Home Details</Text>
          <InputField label="Home Price" value={price} onChangeText={setPrice} prefix="$" />
          <InputField label="Down Payment" value={down} onChangeText={setDown} prefix="$" />

          <Text style={styles.sectionTitle}>Loan Details</Text>
          <InputField label="Interest Rate" value={rate} onChangeText={setRate} suffix="%" accentColor={COLORS.purple} />

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
                <Text style={[styles.termText, term === t && styles.termTextActive]}>{t} yr</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ---------------- OPTIONAL: ZIP CODE STEP ---------------- */}
          <View style={styles.zipHeadRow}>
            <Text style={styles.sectionTitle}>Location <Text style={styles.optional}>(optional)</Text></Text>
          </View>
          <View style={styles.zipCard}>
            <View style={styles.zipHead}>
              <View style={[styles.zipIcon, { backgroundColor: COLORS.teal + '22' }]}>
                <Ionicons name="location" size={18} color={COLORS.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.zipTitle}>Estimate taxes, insurance & closing by ZIP</Text>
                <Text style={styles.zipSub}>
                  Enter your ZIP and we'll estimate your property tax, home insurance
                  and closing costs for your area.
                </Text>
              </View>
            </View>

            <View style={styles.zipInputRow}>
              <View style={styles.zipInputWrap}>
                <Ionicons name="pin" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
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
                      {recTax != null ? `${fmtMoney(recTax)}/mo` : '—'}
                    </Text>
                    <Text style={styles.zipRecNote}>
                      {zipInfo.effectiveRate.toFixed(2)}% of home value
                    </Text>
                  </View>
                  <View style={styles.zipRecCol}>
                    <Text style={styles.zipRecLabel}>Est. Home Insurance</Text>
                    <Text style={[styles.zipRecValue, { color: COLORS.teal }]}>
                      {recIns != null ? `${fmtMoney(recIns)}/mo` : '—'}
                    </Text>
                    <Text style={styles.zipRecNote}>{zipInfo.state} avg</Text>
                  </View>
                </View>

                {/* Closing costs estimate derived from ZIP + price + term + down */}
                <View style={styles.closingCard}>
                  <View style={styles.closingHead}>
                    <View style={[styles.closingIcon, { backgroundColor: COLORS.purple + '22' }]}>
                      <Ionicons name="document-text" size={16} color={COLORS.purple} />
                    </View>
                    <Text style={styles.closingLabel}>Est. Closing Costs</Text>
                    <Text style={[styles.closingValue, { color: COLORS.purple }]}>{fmtMoney(closingCosts)}</Text>
                  </View>
                  <Text style={styles.closingNote}>
                    ~{(closingRatePct * termAdj * downAdj).toFixed(1)}% of home price · based on {zipInfo.state},
                    {' '}{term}yr term, {downPct.toFixed(0)}% down.
                  </Text>
                </View>

                <TouchableOpacity style={styles.applyAllBtn} activeOpacity={0.9} onPress={applyBothRecommendations}>
                  <Ionicons name="download" size={16} color="#fff" />
                  <Text style={styles.applyAllText}>Apply tax & insurance to my estimate</Text>
                </TouchableOpacity>
                <Text style={styles.zipDisclaimer}>
                  Estimates are based on {zipInfo.state} area data. Actual amounts vary — override below for accuracy.
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>Monthly Extras</Text>
          <View style={styles.extrasHint}>
            <Ionicons name="repeat" size={15} color={COLORS.textMuted} />
            <Text style={styles.extrasHintText}>
              Enter each amount at whatever cadence you're billed — we'll convert it to a monthly figure.
            </Text>
          </View>
          <ExtraField
            label="Property Tax"
            value={tax}
            onChangeValue={setTax}
            freq={taxFreq}
            onChangeFreq={setTaxFreq}
            accentColor={COLORS.amber}
            num={num}
            recommended={zipInfo ? recTax : null}
          />
          <ExtraField
            label="Home Insurance"
            value={insurance}
            onChangeValue={setInsurance}
            freq={insuranceFreq}
            onChangeFreq={setInsuranceFreq}
            accentColor={COLORS.teal}
            num={num}
            recommended={zipInfo ? recIns : null}
          />
          <ExtraField
            label="HOA Dues"
            value={hoa}
            onChangeValue={setHoa}
            freq={hoaFreq}
            onChangeFreq={setHoaFreq}
            accentColor={COLORS.pink}
            num={num}
          />

          {pmiEligible ? (
            <View style={styles.pmiCard}>
              <View style={styles.pmiHead}>
                <View style={[styles.pmiIcon, { backgroundColor: COLORS.pink + '22' }]}>
                  <Ionicons name="shield-checkmark" size={18} color={COLORS.pink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pmiTitle}>Private Mortgage Insurance</Text>
                  <Text style={styles.pmiSub}>
                    Down payment is {downPct.toFixed(0)}% (under 20%). Lenders usually
                    require PMI of about {fmtMoney((loanAmount * 0.007) / 12)}/mo.
                  </Text>
                </View>
              </View>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.toggleBtn, includePmi && styles.toggleBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); setIncludePmi(true); }}
                >
                  <Ionicons
                    name={includePmi ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={includePmi ? '#fff' : COLORS.textMuted}
                  />
                  <Text style={[styles.toggleText, includePmi && styles.toggleTextActive]}>Include PMI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.toggleBtn, !includePmi && styles.toggleBtnActiveOff]}
                  onPress={() => { Haptics.selectionAsync(); setIncludePmi(false); }}
                >
                  <Ionicons
                    name={!includePmi ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={!includePmi ? '#fff' : COLORS.textMuted}
                  />
                  <Text style={[styles.toggleText, !includePmi && styles.toggleTextActive]}>Exclude PMI</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={styles.calcBtn} activeOpacity={0.9} onPress={calculate}>
            <Ionicons name="calculator" size={20} color="#fff" />
            <Text style={styles.calcText}>See Full Breakdown</Text>
          </TouchableOpacity>
          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 40 },
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
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  previewLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  previewValue: { color: COLORS.accent, fontSize: 44, fontWeight: '900', marginVertical: 6, letterSpacing: -1 },
  previewRow: { flexDirection: 'row', gap: 20 },
  previewSub: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 8, marginBottom: 14 },
  optional: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
  label: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 10, marginLeft: 2 },
  termRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  termBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  termText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 15 },
  termTextActive: { color: '#fff' },
  zipHeadRow: { marginTop: 8 },
  zipCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 8,
  },
  zipHead: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  zipIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  zipTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  zipSub: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 4, lineHeight: 17 },
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
  zipInput: { flex: 1, color: COLORS.textPrimary, fontSize: 17, fontWeight: '700', letterSpacing: 1 },
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
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  closingLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700', flex: 1 },
  closingValue: { fontSize: 18, fontWeight: '900' },
  closingNote: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 8, lineHeight: 15 },
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
  zipDisclaimer: { color: COLORS.textMuted, fontSize: 11, fontWeight: '500', marginTop: 10, lineHeight: 15 },
  extrasHint: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: -4,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  extrasHintText: { color: COLORS.textMuted, fontSize: 12, flex: 1, fontWeight: '500', lineHeight: 17 },
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
  pmiCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pmiHead: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  pmiIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  pmiTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  pmiSub: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 3, lineHeight: 17 },
  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: { backgroundColor: COLORS.pink, borderColor: COLORS.pink },
  toggleBtnActiveOff: { backgroundColor: COLORS.textMuted, borderColor: COLORS.textMuted },
  toggleText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 13 },
  toggleTextActive: { color: '#fff' },
  calcBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  calcText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
