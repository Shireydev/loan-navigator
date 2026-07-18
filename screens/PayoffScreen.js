import React, { useState, useEffect } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
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
  formatInputWithCommas,
  parseLoanNumber,
  remainingBalanceFromOriginal,
  validatePayoffScenario,
} from '../theme';
import { addSavedScenario, SCENARIO_TYPES } from '../savedScenarios';

const PRESETS = [50, 100, 200, 500];
const LUMP_PRESETS = [5000, 10000, 25000, 50000];

// Given the ORIGINAL loan amount, its rate, the original term (years) and how
// many years remain, compute the current remaining balance. This lets us build
// an accurate amortization schedule from the borrower's true position — the
// remaining balance is derived rather than guessed.
export default function PayoffScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const [origLoan, setOrigLoan] = useState(formatInputWithCommas('400000'));
  const [rate, setRate] = useState('6.75');
  const [origYears, setOrigYears] = useState('30');
  const [yearsLeft, setYearsLeft] = useState('27');
  const [extra, setExtra] = useState('200');
  const [lump, setLump] = useState('0');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  // Restore a saved mortgage payoff scenario from the Saved tab.
  useEffect(() => {
    const item = route.params?.restore;
    if (!item || item.type !== SCENARIO_TYPES.MORTGAGE_PAYOFF || !item.inputs) return;

    const i = item.inputs;
    setOrigLoan(i.origLoan ?? formatInputWithCommas('400000'));
    setRate(i.rate ?? '6.75');
    setOrigYears(i.origYears ?? '30');
    setYearsLeft(i.yearsLeft ?? '27');
    setExtra(i.extra ?? '200');
    setLump(i.lump ?? '0');
    setName(item.name || '');
    setSaved(false);
    navigation.setParams({ restore: undefined });
  }, [navigation, route.params?.restore, route.params?.ts]);

  // Allow each changed combination to be saved as a separate scenario.
  useEffect(() => {
    setSaved(false);
  }, [origLoan, rate, origYears, yearsLeft, extra, lump]);

  const origLoanN = parseLoanNumber(origLoan);
  const rateN = parseLoanNumber(rate);
  const origYearsN = parseLoanNumber(origYears);
  const yearsLeftN = parseLoanNumber(yearsLeft);
  const extraN = parseLoanNumber(extra);
  const lumpN = parseLoanNumber(lump);

  const baseValidationError = validatePayoffScenario({
    originalLoan: origLoanN,
    rate: rateN,
    originalTerm: origYearsN,
    remainingTerm: yearsLeftN,
    extra: extraN,
    lump: lumpN,
    termLabel: 'term',
    maxTerm: 50,
  });

  // Derive the current remaining balance from the original loan trajectory.
  const balN = !baseValidationError
    ? remainingBalanceFromOriginal(origLoanN, rateN, origYearsN * 12, yearsLeftN * 12)
    : 0;
  const validationError =
    baseValidationError ||
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

  // The regular scheduled monthly payment for the remaining balance over the
  // years that are actually left. This is the payment the borrower keeps
  // paying regardless of any lump sum.
  const scheduledPayment = balN > 0 ? monthlyPI(balN, rateN, yearsLeftN) : 0;

  // Apply the one-time lump sum immediately against the balance for the
  // accelerated scenario. The lump reduces the starting principal.
  const balAfterLump = validationError ? 0 : Math.max(balN - lumpN, 0);

  // Baseline: remaining balance amortized over years left, no extras/lump.
  const base = balN > 0 ? amortize(balN, rateN, yearsLeftN, 0) : null;

  // Accelerated scenario: start from the balance AFTER the lump sum, but keep
  // paying the ORIGINAL scheduled monthly payment (plus any monthly extra).
  // Because the balance is lower, the same payment kills the loan faster — so
  // the payoff time genuinely drops. This is the correct behaviour for a
  // one-time lump sum payment.
  const withExtra =
    balN > 0
      ? balAfterLump <= 0
        ? { months: 0, totalInterest: 0, monthlyPayment: 0, schedule: [{ year: 0, balance: 0 }] }
        : amortizeWithPayment(balAfterLump, rateN, scheduledPayment + extraN)
      : null;

  const hasAccel = (extraN > 0 || lumpN > 0) && balN > 0;

  const monthsSaved = base && withExtra ? base.months - withExtra.months : 0;
  const interestSaved = base && withExtra ? base.totalInterest - withExtra.totalInterest : 0;
  const yearsSaved = Math.floor(monthsSaved / 12);
  const remMonths = monthsSaved % 12;

  const applyPreset = (amt) => {
    Haptics.selectionAsync();
    setExtra(String(amt));
  };

  const applyLumpPreset = (amt) => {
    Haptics.selectionAsync();
    setLump(String(amt));
  };

  const saveScenario = async () => {
    if (validationError || !base || !withExtra) {
      Alert.alert('Check Your Inputs', validationError || 'Enter a valid payoff scenario.');
      return;
    }

    try {
      await addSavedScenario({
        type: SCENARIO_TYPES.MORTGAGE_PAYOFF,
        name: name.trim() || 'Mortgage Payoff',
        inputs: { origLoan, rate, origYears, yearsLeft, extra, lump },
        results: {
          balance: balN,
          originalLoan: origLoanN,
          rate: rateN,
          originalTerm: origYearsN,
          yearsRemaining: yearsLeftN,
          extra: extraN,
          lump: lumpN,
          monthlyPayment: withExtra.monthlyPayment,
          payoffMonths: withExtra.months,
          monthsSaved,
          interestSaved,
        },
      });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Unable to save mortgage payoff scenario:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Unable to Save',
        'Your mortgage payoff scenario could not be saved. Please try again.',
      );
    }
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Payoff Accelerator"
        subtitle="Pay less interest, finish sooner"
        icon="trending-down"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ValidationBanner message={validationError} />
          <Text style={styles.sectionTitle}>Your Original Loan</Text>
          <InputField
            label="Original Loan Amount"
            value={origLoan}
            onChangeText={setOrigLoan}
            prefix="$"
          />
          <InputField
            label="Interest Rate"
            value={rate}
            onChangeText={setRate}
            suffix="%"
            accentColor={COLORS.purple}
          />
          <View style={styles.rowInputs}>
            <View style={{ flex: 1 }}>
              <InputField
                label="Original Term"
                value={origYears}
                onChangeText={setOrigYears}
                suffix="yr"
                accentColor={COLORS.pink}
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 1 }}>
              <InputField
                label="Years Remaining"
                value={yearsLeft}
                onChangeText={setYearsLeft}
                suffix="yr"
                accentColor={COLORS.teal}
              />
            </View>
          </View>

          {balN > 0 ? (
            <View style={styles.derivedCard}>
              <View style={[styles.derivedIcon, { backgroundColor: COLORS.accent + '22' }]}>
                <Ionicons name="wallet" size={20} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.derivedLabel}>Current Remaining Balance</Text>
                <Text style={styles.derivedValue}>{fmtMoney(balN)}</Text>
                <Text style={styles.derivedSub}>
                  After {(origYearsN - yearsLeftN).toFixed(0)} yr of payments ·{' '}
                  {yearsLeftN.toFixed(0)} yr left
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.hintRow}>
            <Ionicons name="information-circle" size={15} color={COLORS.textMuted} />
            <Text style={styles.hintText}>
              We derive your remaining balance from the original loan and years left, so the
              amortization schedule is accurate.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Extra Monthly Payment</Text>
          <InputField
            label="Additional Principal / mo"
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

          <Text style={styles.sectionTitle}>One-Time Lump Sum</Text>
          <InputField
            label="Lump Sum Payment (applied now)"
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
            <Ionicons name="cash" size={15} color={COLORS.textMuted} />
            <Text style={styles.hintText}>
              A lump sum is applied to your principal immediately — like a bonus, tax refund, or
              windfall — combining with monthly extras to crush your balance faster.
            </Text>
          </View>

          {hasAccel && withExtra ? (
            <>
              <View style={styles.highlightCard}>
                <Ionicons name="rocket" size={26} color={COLORS.green} />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={styles.highlightLabel}>You could save</Text>
                  <Text style={styles.highlightValue}>{fmtMoney(interestSaved)}</Text>
                  <Text style={styles.highlightSub}>
                    and be mortgage-free {yearsSaved > 0 ? `${yearsSaved} yr ` : ''}
                    {remMonths > 0 ? `${remMonths} mo ` : ''}sooner
                  </Text>
                </View>
              </View>

              {lumpN > 0 ? (
                <View style={styles.lumpBanner}>
                  <Ionicons name="flash" size={18} color={COLORS.amber} />
                  <Text style={styles.lumpBannerText}>
                    Your {fmtMoney(lumpN)} lump sum drops the balance to {fmtMoney(balAfterLump)}{' '}
                    right away.
                  </Text>
                </View>
              ) : null}

              <View style={styles.statRow}>
                <StatCard
                  label="New Payoff Time"
                  value={`${(withExtra.months / 12).toFixed(1)} yr`}
                  icon="time"
                  color={COLORS.teal}
                  sub={base ? `was ${(base.months / 12).toFixed(1)} yr` : undefined}
                />
                <View style={{ width: 12 }} />
                <StatCard
                  label="Monthly Payment"
                  value={fmtMoney(withExtra.monthlyPayment)}
                  icon="cash"
                  color={COLORS.accent}
                  sub={extraN > 0 ? `+${fmtMoney(extraN)}/mo` : 'same payment'}
                />
              </View>

              {base && withExtra.schedule && withExtra.schedule.length > 0 ? (
                <View style={styles.chartCard}>
                  <View style={styles.chartHead}>
                    <View style={styles.chartBadge}>
                      <Ionicons name="analytics" size={18} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chartTitle}>Balance Over Time</Text>
                      <Text style={styles.chartSub}>
                        How extra & lump payments shrink your balance faster.
                      </Text>
                    </View>
                  </View>

                  <BalanceLineChart
                    schedule={base.schedule}
                    compareSchedule={withExtra.schedule}
                    color={COLORS.accent}
                    compareColor={COLORS.green}
                  />

                  {monthsSaved > 0 ? (
                    <View style={styles.savingsBanner}>
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
                      <Text style={styles.savingsBannerText}>
                        Paid off {yearsSaved > 0 ? `${yearsSaved} yr ` : ''}
                        {remMonths > 0 ? `${remMonths} mo ` : ''}sooner · save{' '}
                        {fmtMoney(interestSaved)} in interest
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyHint}>
              <Ionicons name="bulb" size={22} color={COLORS.amber} />
              <Text style={styles.emptyText}>
                Add an extra monthly amount or a one-time lump sum above to see how much interest
                and time you'll save.
              </Text>
            </View>
          )}

          {base && withExtra ? (
            <>
              {!saved ? (
                <NameField
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Pay Off Home Early"
                />
              ) : null}
              <TouchableOpacity
                style={[styles.saveBtn, saved && { backgroundColor: COLORS.green }]}
                activeOpacity={0.9}
                onPress={saveScenario}
                disabled={saved}
              >
                <Ionicons name={saved ? 'checkmark-circle' : 'bookmark'} size={18} color="#fff" />
                <Text style={styles.saveText}>{saved ? 'Saved' : 'Save Scenario'}</Text>
              </TouchableOpacity>
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
      <Text style={styles.nameLabel}>Name this scenario</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 14,
    marginTop: 4,
  },
  rowInputs: { flexDirection: 'row' },
  derivedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  derivedIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  derivedLabel: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  derivedValue: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    marginVertical: 2,
    letterSpacing: -0.5,
  },
  derivedSub: { color: COLORS.textMuted, fontSize: 12, fontWeight: '500' },
  hintRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  hintText: { color: COLORS.textMuted, fontSize: 12, flex: 1, fontWeight: '500', lineHeight: 17 },
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
  lumpBannerText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  statRow: { flexDirection: 'row', marginTop: 16 },
  chartCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chartHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  chartBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' },
  chartSub: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 2 },
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
    marginTop: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },
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
