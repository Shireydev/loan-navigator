import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import GradientHeader from '../components/GradientHeader';
import InputField from '../components/InputField';
import StatCard from '../components/StatCard';
import BalanceLineChart from '../components/BalanceLineChart';
import { COLORS, STORAGE_KEYS, monthlyPI, amortize, amortizeWithPayment, fmtMoney } from '../theme';

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
  const [mode, setMode] = useState('purchase');
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('');

  // Purchase state
  const [price, setPrice] = useState('38000');
  const [down, setDown] = useState('5000');
  const [trade, setTrade] = useState('0');
  const [salesTax, setSalesTax] = useState('7');
  const [rate, setRate] = useState('6.90');
  const [term, setTerm] = useState(60);

  // Payoff state
  const [pBalance, setPBalance] = useState('22000');
  const [pRate, setPRate] = useState('6.90');
  const [pMonths, setPMonths] = useState('42');
  const [pExtra, setPExtra] = useState('100');
  const [pLump, setPLump] = useState('0');

  // Refinance state
  const [rBalance, setRBalance] = useState('22000');
  const [rCurRate, setRCurRate] = useState('9.50');
  const [rMonths, setRMonths] = useState('42');
  const [rNewRate, setRNewRate] = useState('6.00');
  const [rNewTerm, setRNewTerm] = useState('48');
  const [rFees, setRFees] = useState('300');

  const num = (v) => parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0;

  // Jump to a specific mode when arriving from the landing page.
  useEffect(() => {
    const lm = route.params?.landingMode;
    if (lm && ['purchase', 'payoff', 'refinance'].includes(lm)) {
      setMode(lm);
      setSaved(false);
      setName('');
      navigation.setParams({ landingMode: undefined });
    }
  }, [route.params?.ts]);

  // Restore a saved car estimate from the Saved tab.
  useEffect(() => {
    const item = route.params?.restore;
    if (!item || !item.inputs) return;
    if (item.type === 'car_purchase') {
      const i = item.inputs;
      setMode('purchase');
      setPrice(i.price ?? '38000');
      setDown(i.down ?? '5000');
      setTrade(i.trade ?? '0');
      setSalesTax(i.salesTax ?? '7');
      setRate(i.rate ?? '6.90');
      setTerm(i.term ?? 60);
      setName(item.name || '');
      setSaved(false);
    } else if (item.type === 'car_refinance') {
      const i = item.inputs;
      setMode('refinance');
      setRBalance(i.rBalance ?? '22000');
      setRCurRate(i.rCurRate ?? '9.50');
      setRMonths(i.rMonths ?? '42');
      setRNewRate(i.rNewRate ?? '6.00');
      setRNewTerm(i.rNewTerm ?? '48');
      setRFees(i.rFees ?? '300');
      setName(item.name || '');
      setSaved(false);
    }
    navigation.setParams({ restore: undefined });
  }, [route.params?.ts]);

  const setModeHaptic = (m) => {
    Haptics.selectionAsync();
    setMode(m);
    setSaved(false);
    setName('');
  };

  // ---- Purchase calcs ----
  // Trade-in value is subtracted from the vehicle price BEFORE sales tax is
  // applied (most states tax the net price after trade-in credit).
  const priceN = num(price);
  const tradeN = num(trade);
  const taxableAmount = Math.max(priceN - tradeN, 0);
  const taxAmt = taxableAmount * (num(salesTax) / 100);
  const amountFinanced = Math.max(taxableAmount + taxAmt - num(down), 0);
  const carPay = amountFinanced > 0 ? monthlyPI(amountFinanced, num(rate), term / 12) : 0;
  const purAm = amountFinanced > 0 ? amortize(amountFinanced, num(rate), term / 12, 0) : null;
  const totalCost = purAm ? num(down) + tradeN + amountFinanced + purAm.totalInterest : 0;

  // ---- Payoff calcs ----
  const pBalN = num(pBalance);
  const pLumpN = num(pLump);
  const pRateN = num(pRate);
  const pExtraN = num(pExtra);
  const pYears = (num(pMonths) || 1) / 12;
  // The regular scheduled monthly payment for the current balance/term.
  const pScheduledPay = pBalN > 0 ? monthlyPI(pBalN, pRateN, pYears) : 0;
  // Apply the lump sum immediately against the balance.
  const pBalAfterLump = Math.max(pBalN - pLumpN, 0);

  const pBase = pBalN > 0 ? amortize(pBalN, pRateN, pYears, 0) : null;
  // Accelerated: keep paying the SAME scheduled payment (plus monthly extra)
  // against the reduced balance, so the loan is paid off sooner.
  const pWith = pBalN > 0
    ? (pBalAfterLump <= 0
        ? { months: 0, totalInterest: 0, monthlyPayment: 0, schedule: [{ year: 0, balance: 0 }] }
        : amortizeWithPayment(pBalAfterLump, pRateN, pScheduledPay + pExtraN))
    : null;
  const pHasAccel = (pExtraN > 0 || pLumpN > 0) && pBalN > 0;
  const pMonthsSaved = pBase && pWith ? pBase.months - pWith.months : 0;
  const pInterestSaved = pBase && pWith ? pBase.totalInterest - pWith.totalInterest : 0;

  // ---- Refinance calcs ----
  const rBalN = num(rBalance);
  const rCurYears = (num(rMonths) || 1) / 12;
  const rCurPay = rBalN > 0 ? monthlyPI(rBalN, num(rCurRate), rCurYears) : 0;
  const rNewPay = rBalN > 0 ? monthlyPI(rBalN, num(rNewRate), (num(rNewTerm) || 1) / 12) : 0;
  const rMonthlySavings = rCurPay - rNewPay;
  const rCurAm = rBalN > 0 ? amortize(rBalN, num(rCurRate), rCurYears, 0) : null;
  const rNewAm = rBalN > 0 ? amortize(rBalN, num(rNewRate), (num(rNewTerm) || 1) / 12, 0) : null;
  const rFeesN = num(rFees);
  const rLifetime = rCurAm && rNewAm ? rCurAm.totalInterest - rNewAm.totalInterest - rFeesN : 0;
  const rWorthIt = rLifetime > 0;

  const save = async (entry) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.SAVED);
      const list = raw ? JSON.parse(raw) : [];
      list.unshift({ id: Date.now().toString(), date: new Date().toISOString(), ...entry });
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED, JSON.stringify(list));
      setSaved(true);
    } catch (e) {}
  };

  const defaultName = mode === 'purchase' ? 'Car Purchase' : mode === 'refinance' ? 'Car Refinance' : 'Car Payoff';

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Auto Loan Center"
        subtitle="Purchase, payoff & refinance"
        icon="car-sport"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
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
                  <Ionicons name={m.icon} size={18} color={active ? '#fff' : COLORS.textSecondary} />
                  <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
              <InputField label="Vehicle Price" value={price} onChangeText={setPrice} prefix="$" />
              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <InputField label="Down Payment" value={down} onChangeText={setDown} prefix="$" accentColor={COLORS.green} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <InputField label="Trade-in Value" value={trade} onChangeText={setTrade} prefix="$" accentColor={COLORS.teal} />
                </View>
              </View>
              <InputField label="Sales Tax" value={salesTax} onChangeText={setSalesTax} suffix="%" accentColor={COLORS.amber} />
              <View style={styles.hintRow}>
                <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
                <Text style={styles.hintText}>
                  Trade-in value is subtracted from the price before sales tax is applied.
                </Text>
              </View>

              <Text style={styles.sectionTitle}>Loan</Text>
              <InputField label="Interest Rate (APR)" value={rate} onChangeText={setRate} suffix="%" accentColor={COLORS.purple} />
              <Text style={styles.label}>Loan Term</Text>
              <View style={styles.termRow}>
                {TERMS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    activeOpacity={0.8}
                    style={[styles.termBtn, term === t && styles.termBtnActive]}
                    onPress={() => { Haptics.selectionAsync(); setTerm(t); }}
                  >
                    <Text style={[styles.termText, term === t && styles.termTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {amountFinanced > 0 && purAm ? (
                <>
                  <View style={styles.statRow}>
                    <StatCard label="Total Interest" value={fmtMoney(purAm.totalInterest)} icon="cash" color={COLORS.red} />
                    <View style={{ width: 12 }} />
                    <StatCard label="Total Cost" value={fmtMoney(totalCost)} icon="pricetag" color={COLORS.accent} />
                  </View>
                  <View style={styles.metricsCard}>
                    <MetricRow label="Taxable Amount" value={fmtMoney(taxableAmount)} color={COLORS.teal} />
                    <MetricRow label="Sales Tax" value={fmtMoney(taxAmt)} color={COLORS.amber} />
                    <MetricRow label="Amount Financed" value={fmtMoney(amountFinanced)} color={COLORS.textPrimary} />
                    <MetricRow label="Total of Payments" value={fmtMoney(purAm.totalPaid)} color={COLORS.textPrimary} last />
                  </View>
                  {!saved ? (
                    <NameField value={name} onChangeText={setName} placeholder="e.g. Honda CR-V" />
                  ) : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, saved && { backgroundColor: COLORS.green }]}
                    activeOpacity={0.9}
                    onPress={() => save({
                      type: 'car_purchase',
                      name: name.trim() || defaultName,
                      price: priceN,
                      financed: amountFinanced,
                      rate: num(rate),
                      term,
                      monthly: carPay,
                      totalInterest: purAm.totalInterest,
                      inputs: { price, down, trade, salesTax, rate, term },
                    })}
                    disabled={saved}
                  >
                    <Ionicons name={saved ? 'checkmark-circle' : 'bookmark'} size={18} color="#fff" />
                    <Text style={styles.saveText}>{saved ? 'Saved' : 'Save Estimate'}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </>
          ) : null}

          {/* ---------------- PAYOFF ---------------- */}
          {mode === 'payoff' ? (
            <>
              <Text style={styles.sectionTitle}>Your Current Auto Loan</Text>
              <InputField label="Remaining Balance" value={pBalance} onChangeText={setPBalance} prefix="$" />
              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <InputField label="Interest Rate" value={pRate} onChangeText={setPRate} suffix="%" accentColor={COLORS.purple} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <InputField label="Months Left" value={pMonths} onChangeText={setPMonths} suffix="mo" accentColor={COLORS.teal} />
                </View>
              </View>

              <Text style={styles.sectionTitle}>Extra Monthly Payment</Text>
              <InputField label="Additional Principal / mo" value={pExtra} onChangeText={setPExtra} prefix="$" accentColor={COLORS.green} />
              <View style={styles.presetRow}>
                {PRESETS.map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.preset, num(pExtra) === amt && styles.presetActive]}
                    activeOpacity={0.8}
                    onPress={() => { Haptics.selectionAsync(); setPExtra(String(amt)); }}
                  >
                    <Text style={[styles.presetText, num(pExtra) === amt && styles.presetTextActive]}>+${amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>One-Time Lump Sum</Text>
              <InputField label="Lump Sum Payment (applied now)" value={pLump} onChangeText={setPLump} prefix="$" accentColor={COLORS.amber} />
              <View style={styles.presetRow}>
                {LUMP_PRESETS.map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={[styles.presetLump, num(pLump) === amt && styles.presetLumpActive]}
                    activeOpacity={0.8}
                    onPress={() => { Haptics.selectionAsync(); setPLump(String(amt)); }}
                  >
                    <Text style={[styles.presetText, num(pLump) === amt && styles.presetLumpTextActive]}>
                      +${amt >= 1000 ? `${amt / 1000}k` : amt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.hintRow}>
                <Ionicons name="cash" size={15} color={COLORS.textMuted} />
                <Text style={styles.hintText}>
                  A lump sum is applied to your principal immediately — combine it with monthly
                  extras to pay off your auto loan even faster.
                </Text>
              </View>

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
                        Your {fmtMoney(pLumpN)} lump sum drops the balance to {fmtMoney(pBalAfterLump)} right away.
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.statRow}>
                    <StatCard
                      label="New Payoff Time"
                      value={`${pWith.months} mo`}
                      icon="time"
                      color={COLORS.teal}
                      sub={`was ${pBase.months} mo`}
                    />
                    <View style={{ width: 12 }} />
                    <StatCard
                      label="Monthly Payment"
                      value={fmtMoney(pWith.monthlyPayment)}
                      icon="cash"
                      color={COLORS.accent}
                      sub={pExtraN > 0 ? `+${fmtMoney(pExtraN)}/mo` : 'same payment'}
                    />
                  </View>
                  {pWith.schedule && pWith.schedule.length > 0 ? (
                    <View style={styles.chartCard}>
                      <Text style={styles.chartTitle}>Balance Over Time</Text>
                      <BalanceLineChart
                        schedule={pBase.schedule}
                        compareSchedule={pWith.schedule}
                        color={COLORS.accent}
                        compareColor={COLORS.green}
                      />
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyHint}>
                  <Ionicons name="bulb" size={22} color={COLORS.amber} />
                  <Text style={styles.emptyText}>
                    Add an extra monthly amount or a one-time lump sum to see how much interest and time you'll save.
                  </Text>
                </View>
              )}
            </>
          ) : null}

          {/* ---------------- REFINANCE ---------------- */}
          {mode === 'refinance' ? (
            <>
              <Text style={styles.sectionTitle}>Current Auto Loan</Text>
              <InputField label="Remaining Balance" value={rBalance} onChangeText={setRBalance} prefix="$" />
              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <InputField label="Current Rate" value={rCurRate} onChangeText={setRCurRate} suffix="%" accentColor={COLORS.red} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <InputField label="Months Left" value={rMonths} onChangeText={setRMonths} suffix="mo" accentColor={COLORS.teal} />
                </View>
              </View>

              <Text style={styles.sectionTitle}>New Loan Offer</Text>
              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <InputField label="New Rate" value={rNewRate} onChangeText={setRNewRate} suffix="%" accentColor={COLORS.green} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <InputField label="New Term" value={rNewTerm} onChangeText={setRNewTerm} suffix="mo" accentColor={COLORS.purple} />
                </View>
              </View>
              <InputField label="Refinance Fees" value={rFees} onChangeText={setRFees} prefix="$" accentColor={COLORS.amber} />

              {rBalN > 0 ? (
                <>
                  <View style={[styles.verdict, { backgroundColor: (rWorthIt ? COLORS.green : COLORS.red) + '18', borderColor: (rWorthIt ? COLORS.green : COLORS.red) + '44' }]}>
                    <Ionicons
                      name={rWorthIt ? 'checkmark-circle' : 'close-circle'}
                      size={34}
                      color={rWorthIt ? COLORS.green : COLORS.red}
                    />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text style={[styles.verdictTitle, { color: rWorthIt ? COLORS.green : COLORS.red }]}>
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
                      <Text style={[styles.comparePay, { color: COLORS.red }]}>{fmtMoney(rCurPay)}</Text>
                      <Text style={styles.compareRate}>{num(rCurRate).toFixed(2)}% / mo</Text>
                    </View>
                    <Ionicons name="arrow-forward" size={22} color={COLORS.textMuted} />
                    <View style={styles.compareCol}>
                      <Text style={styles.compareHead}>New</Text>
                      <Text style={[styles.comparePay, { color: COLORS.green }]}>{fmtMoney(rNewPay)}</Text>
                      <Text style={styles.compareRate}>{num(rNewRate).toFixed(2)}% / mo</Text>
                    </View>
                  </View>

                  <View style={styles.metricsCard}>
                    <MetricRow
                      label="Monthly Difference"
                      value={rMonthlySavings >= 0 ? fmtMoney(rMonthlySavings) : `-${fmtMoney(Math.abs(rMonthlySavings))}`}
                      color={rMonthlySavings >= 0 ? COLORS.green : COLORS.red}
                    />
                    <MetricRow label="Interest Left (Current)" value={rCurAm ? fmtMoney(rCurAm.totalInterest) : '—'} color={COLORS.red} />
                    <MetricRow label="Interest (New Loan)" value={rNewAm ? fmtMoney(rNewAm.totalInterest) : '—'} color={COLORS.teal} />
                    <MetricRow label="Refinance Fees" value={fmtMoney(rFeesN)} color={COLORS.textPrimary} />
                    <MetricRow
                      label="Net Savings"
                      value={rLifetime >= 0 ? fmtMoney(rLifetime) : `-${fmtMoney(Math.abs(rLifetime))}`}
                      color={rLifetime >= 0 ? COLORS.green : COLORS.red}
                      last
                    />
                  </View>

                  {!saved ? (
                    <NameField value={name} onChangeText={setName} placeholder="e.g. Truck Refi" />
                  ) : null}
                  <TouchableOpacity
                    style={[styles.saveBtn, saved && { backgroundColor: COLORS.green }]}
                    activeOpacity={0.9}
                    onPress={() => save({
                      type: 'car_refinance',
                      name: name.trim() || defaultName,
                      balance: rBalN,
                      curRate: num(rCurRate),
                      newRate: num(rNewRate),
                      monthlySavings: rMonthlySavings,
                      netSavings: rLifetime,
                      worthIt: rWorthIt,
                      inputs: { rBalance, rCurRate, rMonths, rNewRate, rNewTerm, rFees },
                    })}
                    disabled={saved}
                  >
                    <Ionicons name={saved ? 'checkmark-circle' : 'bookmark'} size={18} color="#fff" />
                    <Text style={styles.saveText}>{saved ? 'Saved' : 'Save Analysis'}</Text>
                  </TouchableOpacity>
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

function NameField({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.nameCard}>
      <Text style={styles.nameLabel}>Name this estimate</Text>
      <TextInput
        style={styles.nameInput}
        value={value}
        onChangeText={onChangeText}
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
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  modeText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 13 },
  modeTextActive: { color: '#fff' },
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
  label: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 10, marginLeft: 2 },
  rowInputs: { flexDirection: 'row' },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: -4,
    marginBottom: 8,
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
    marginTop: 20,
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
  lumpBannerText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  emptyHint: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.amber + '15',
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
    alignItems: 'center',
  },
  emptyText: { color: COLORS.textSecondary, fontSize: 14, flex: 1, fontWeight: '500', lineHeight: 20 },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    padding: 20,
    marginTop: 22,
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
  compareHead: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  comparePay: { fontSize: 24, fontWeight: '900', marginVertical: 4 },
  compareRate: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  nameCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 16,
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
