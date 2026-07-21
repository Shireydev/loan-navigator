import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BalanceLineChart from '../components/BalanceLineChart';
import { addSavedScenario, SCENARIO_TYPES } from '../savedScenarios';
import {
  COLORS,
  amortizeWithPayment,
  fmtMoney,
  formatInputWithCommas,
  formatProjectedPayoffMonth,
  parseLoanNumber,
} from '../theme';
import useScrollToTopOnFocus from '../components/useScrollToTopOnFocus';

function formatDuration(months) {
  if (months <= 0) return 'Paid off';
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (!years) return `${remainder} mo`;
  if (!remainder) return `${years} yr`;
  return `${years} yr ${remainder} mo`;
}

function MetricRow({ label, value, color, last }) {
  return (
    <View style={[styles.metricRow, !last && styles.metricBorder]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function PayoffResultScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useScrollToTopOnFocus(scrollRef, undefined, 'Payoff');
  const p = route.params;
  const [name, setName] = useState(p.presetName || '');
  const [saved, setSaved] = useState(false);
  const [paymentType, setPaymentType] = useState(p.extra > 0 ? 'monthly' : 'lump');
  const [monthlyExtra, setMonthlyExtra] = useState(
    p.extra > 0 ? formatInputWithCommas(String(p.extra)) : '',
  );
  const [lumpSum, setLumpSum] = useState(p.lump > 0 ? formatInputWithCommas(String(p.lump)) : '');

  const projection = useMemo(() => {
    const parseOptionalAmount = (value) =>
      String(value ?? '').trim() === '' ? 0 : parseLoanNumber(value);
    const parsedExtra = parseOptionalAmount(monthlyExtra);
    const parsedLump = parseOptionalAmount(lumpSum);
    const error =
      !Number.isFinite(parsedExtra) || parsedExtra < 0
        ? 'Monthly extra payment must be a valid amount of 0 or more.'
        : !Number.isFinite(parsedLump) || parsedLump < 0
          ? 'Lump-sum payment must be a valid amount of 0 or more.'
          : parsedLump > p.currentBalance
            ? 'Lump-sum payment cannot exceed the current balance.'
            : null;
    const extra = error ? 0 : parsedExtra;
    const lump = error ? 0 : parsedLump;
    const balanceAfterLump = Math.max(p.currentBalance - lump, 0);
    const nonLoanHousingCost = Math.max(p.currentMonthlyHousingCost - p.currentPayment, 0);
    const accelerated =
      balanceAfterLump <= 0
        ? {
            months: 0,
            totalInterest: 0,
            monthlyPayment: 0,
            schedule: [{ year: 0, balance: 0 }],
          }
        : amortizeWithPayment(balanceAfterLump, p.rate, p.currentPayment + extra);
    const monthsSaved = Math.max(0, p.currentPayoffMonths - accelerated.months);

    return {
      error,
      extra,
      lump,
      balanceAfterLump,
      newPayment: accelerated.monthlyPayment,
      newMonthlyHousingCost: nonLoanHousingCost + accelerated.monthlyPayment,
      newPayoffMonths: accelerated.months,
      newInterest: accelerated.totalInterest,
      monthsSaved,
      interestSaved: Math.max(0, p.currentInterest - accelerated.totalInterest),
      newSchedule: accelerated.schedule,
    };
  }, [
    lumpSum,
    monthlyExtra,
    p.currentBalance,
    p.currentInterest,
    p.currentMonthlyHousingCost,
    p.currentPayment,
    p.currentPayoffMonths,
    p.rate,
  ]);

  const currentPayoffDate = formatProjectedPayoffMonth(p.currentPayoffMonths);
  const acceleratedPayoffDate = formatProjectedPayoffMonth(projection.newPayoffMonths);

  const monthlyDifference = projection.newMonthlyHousingCost - p.currentMonthlyHousingCost;
  const usesMonthlyExtra = projection.extra > 0;
  const usesLumpSum = projection.lump > 0;
  const planSummary =
    usesMonthlyExtra && usesLumpSum
      ? `Adding ${fmtMoney(projection.extra)} each month and applying a ${fmtMoney(projection.lump)} lump sum`
      : usesMonthlyExtra
        ? `Adding ${fmtMoney(projection.extra)} each month`
        : usesLumpSum
          ? `Applying a ${fmtMoney(projection.lump)} lump sum`
          : 'Making no additional principal payments';
  const payoffChangeText =
    projection.monthsSaved > 0
      ? `${formatDuration(projection.monthsSaved)} sooner`
      : 'no payoff-time change';

  const saveScenario = async () => {
    if (projection.error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Check Your Payment', projection.error);
      return;
    }

    try {
      await addSavedScenario({
        type: SCENARIO_TYPES.MORTGAGE_PAYOFF,
        name: name.trim() || 'Mortgage Payoff',
        inputs: {
          ...p.inputs,
          extra: formatInputWithCommas(String(projection.extra)),
          lump: formatInputWithCommas(String(projection.lump)),
        },
        results: {
          balance: p.currentBalance,
          originalLoan: p.originalLoan,
          rate: p.rate,
          originalTerm: p.originalTerm,
          yearsRemaining: p.yearsRemaining,
          extra: projection.extra,
          lump: projection.lump,
          monthlyPayment: projection.newPayment,
          totalMonthlyHousingCost: projection.newMonthlyHousingCost,
          propertyTax: p.propertyTax,
          insurance: p.insurance,
          mortgageInsurance: p.mortgageInsurance,
          hoa: p.hoa,
          payoffMonths: projection.newPayoffMonths,
          currentPayoffDate,
          projectedPayoffDate: acceleratedPayoffDate,
          monthsSaved: projection.monthsSaved,
          interestSaved: projection.interestSaved,
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

  const revealNameInput = useCallback(() => {
    const scrollToName = () => scrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(scrollToName);
    setTimeout(scrollToName, 280);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#07162F', '#0A2D61']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Back to payoff accelerator"
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Payoff Projection</Text>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate('Home')}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Return to home"
          >
            <Ionicons name="home-outline" size={21} color="#8CC5FF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerLabel}>PROJECTED INTEREST SAVINGS</Text>
        <Text style={styles.headerValue}>{fmtMoney(projection.interestSaved)}</Text>
        <Text style={styles.headerSub}>
          Mortgage-free {acceleratedPayoffDate} · {payoffChangeText}
        </Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Projected Impact</Text>
          <View style={styles.analysisCard}>
            <View style={styles.analysisHeader}>
              <View style={styles.analysisHeaderIcon}>
                <Ionicons name="rocket" size={25} color={COLORS.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.analysisTitle}>A Faster Path to Mortgage-Free</Text>
                <Text style={styles.analysisSub}>
                  Your plan reduces both the payoff timeline and remaining interest.
                </Text>
              </View>
            </View>

            <View style={styles.analysisSection}>
              <Text style={styles.centeredSectionLabel}>MONTHLY HOUSING COST</Text>
              <View style={styles.compareRow}>
                <View style={styles.compareCol}>
                  <Text style={styles.compareLabel}>CURRENT</Text>
                  <Text style={styles.compareValue}>{fmtMoney(p.currentMonthlyHousingCost)}</Text>
                  <Text style={styles.compareSub}>{fmtMoney(p.currentPayment)} loan payment</Text>
                </View>
                <Ionicons name="arrow-forward" size={21} color={COLORS.textMuted} />
                <View style={styles.compareCol}>
                  <Text style={styles.compareLabel}>ACCELERATED</Text>
                  <Text style={styles.compareValue}>
                    {fmtMoney(projection.newMonthlyHousingCost)}
                  </Text>
                  <Text style={styles.compareSub}>
                    {fmtMoney(projection.newPayment)} loan payment
                  </Text>
                </View>
              </View>
              <View style={styles.monthlyChange}>
                <Text style={styles.monthlyChangeLabel}>MONTHLY COST CHANGE</Text>
                <Text style={styles.monthlyChangeValue}>
                  {monthlyDifference > 0
                    ? `+${fmtMoney(monthlyDifference)}/mo`
                    : monthlyDifference < 0
                      ? `${fmtMoney(Math.abs(monthlyDifference))}/mo lower`
                      : 'No monthly change'}
                </Text>
              </View>
              <View style={styles.costNote}>
                <Ionicons name="shield-checkmark" size={17} color={COLORS.teal} />
                <Text style={styles.costNoteText}>
                  Includes the loan payment, property tax, home insurance, PMI, and HOA.
                </Text>
              </View>
            </View>

            <View style={styles.analysisDivider} />

            <View style={styles.analysisSection}>
              <Text style={styles.centeredSectionLabel}>PAYOFF TIMELINE</Text>
              <View style={styles.compareRow}>
                <View style={styles.compareCol}>
                  <Text style={styles.compareLabel}>CURRENT</Text>
                  <Text style={styles.compareValue}>{formatDuration(p.currentPayoffMonths)}</Text>
                  <Text style={styles.compareSub}>Est. {currentPayoffDate}</Text>
                </View>
                <Ionicons name="arrow-forward" size={21} color={COLORS.textMuted} />
                <View style={styles.compareCol}>
                  <Text style={styles.compareLabel}>ACCELERATED</Text>
                  <Text style={styles.compareValue}>
                    {formatDuration(projection.newPayoffMonths)}
                  </Text>
                  <Text style={styles.compareSub}>Est. {acceleratedPayoffDate}</Text>
                </View>
              </View>
              <View style={styles.timeSaved}>
                <Ionicons name="time" size={18} color={COLORS.green} />
                <Text style={styles.timeSavedText}>
                  {projection.monthsSaved > 0
                    ? `Paid off ${formatDuration(projection.monthsSaved)} sooner`
                    : 'No payoff-time change'}
                </Text>
              </View>
            </View>

            <View style={styles.analysisDivider} />

            <View style={styles.analysisSection}>
              <Text style={styles.centeredSectionLabel}>REMAINING LOAN INTEREST</Text>
              <MetricRow
                label="Current Schedule"
                value={fmtMoney(p.currentInterest)}
                color={COLORS.red}
              />
              <MetricRow
                label="Accelerated Schedule"
                value={fmtMoney(projection.newInterest)}
                color={COLORS.teal}
                last
              />
              <View style={styles.interestOutcome}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.interestOutcomeLabel}>PROJECTED INTEREST SAVINGS</Text>
                  <Text style={styles.interestOutcomeSub}>Interest avoided by paying sooner</Text>
                </View>
                <Text style={styles.interestOutcomeValue}>
                  {fmtMoney(projection.interestSaved)}
                </Text>
              </View>
            </View>

            {usesLumpSum ? (
              <View style={styles.lumpBanner}>
                <Ionicons name="flash" size={18} color={COLORS.amber} />
                <Text style={styles.lumpBannerText}>
                  The {fmtMoney(projection.lump)} one-time payment lowers the balance from{' '}
                  {fmtMoney(p.currentBalance)} to {fmtMoney(projection.balanceAfterLump)}
                  immediately.
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>Adjust Your Plan</Text>
          <View style={styles.planEditorCard}>
            <Text style={styles.planEditorTitle}>Try another extra payment</Text>
            <Text style={styles.planEditorSub}>
              Edit either strategy and the projection will update immediately.
            </Text>
            <View style={styles.paymentTypeRow}>
              <TouchableOpacity
                style={[
                  styles.paymentTypeBtn,
                  paymentType === 'monthly' && styles.paymentTypeBtnActive,
                ]}
                onPress={() => setPaymentType('monthly')}
                accessibilityRole="button"
                accessibilityState={{ selected: paymentType === 'monthly' }}
              >
                <Ionicons
                  name="repeat"
                  size={17}
                  color={paymentType === 'monthly' ? '#fff' : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.paymentTypeText,
                    paymentType === 'monthly' && styles.paymentTypeTextActive,
                  ]}
                >
                  Monthly Extra
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.paymentTypeBtn,
                  paymentType === 'lump' && styles.paymentTypeBtnActive,
                ]}
                onPress={() => setPaymentType('lump')}
                accessibilityRole="button"
                accessibilityState={{ selected: paymentType === 'lump' }}
              >
                <Ionicons
                  name="flash"
                  size={17}
                  color={paymentType === 'lump' ? '#fff' : COLORS.textSecondary}
                />
                <Text
                  style={[
                    styles.paymentTypeText,
                    paymentType === 'lump' && styles.paymentTypeTextActive,
                  ]}
                >
                  Lump Sum
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.editorInputLabel}>
              {paymentType === 'monthly' ? 'Additional principal each month' : 'One-time payment'}
            </Text>
            <View style={styles.editorInputRow}>
              <Text style={styles.editorPrefix}>$</Text>
              <TextInput
                style={styles.editorInput}
                value={paymentType === 'monthly' ? monthlyExtra : lumpSum}
                onChangeText={(value) => {
                  const formatted = formatInputWithCommas(value);
                  if (paymentType === 'monthly') setMonthlyExtra(formatted);
                  else setLumpSum(formatted);
                  setSaved(false);
                }}
                keyboardType="numeric"
                maxLength={18}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
                accessibilityLabel={
                  paymentType === 'monthly'
                    ? 'Additional monthly principal'
                    : 'One-time lump-sum payment'
                }
              />
              <Text style={styles.editorSuffix}>{paymentType === 'monthly' ? '/mo' : 'once'}</Text>
            </View>
            {projection.error ? (
              <View style={styles.editorError} accessibilityRole="alert">
                <Ionicons name="alert-circle" size={16} color={COLORS.red} />
                <Text style={styles.editorErrorText}>{projection.error}</Text>
              </View>
            ) : null}
            {usesMonthlyExtra && usesLumpSum ? (
              <Text style={styles.combinedPlanText}>
                Combined plan: {fmtMoney(projection.extra)}/mo plus a {fmtMoney(projection.lump)}{' '}
                one-time payment.
              </Text>
            ) : null}
          </View>

          <View style={styles.narrativeCard}>
            <View style={styles.narrativeIcon}>
              <Ionicons name="information-circle" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.narrativeTitle}>What this means for you</Text>
              <Text style={styles.narrativeText}>
                {planSummary} shortens the estimated payoff from{' '}
                {formatDuration(p.currentPayoffMonths)} to{' '}
                {formatDuration(projection.newPayoffMonths)} and moves the projected mortgage-free
                date from {currentPayoffDate} to {acceleratedPayoffDate}, saving{' '}
                {fmtMoney(projection.interestSaved)} in interest. The projected monthly housing cost
                includes principal and interest, property tax, home insurance, PMI, and HOA. Only
                the loan payment reduces the mortgage balance. Tax, insurance, and HOA generally
                continue after payoff, while PMI may end earlier when equity requirements are met.
              </Text>
            </View>
          </View>

          {p.currentSchedule?.length && projection.newSchedule?.length ? (
            <>
              <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>
                Balance Projection
              </Text>
              <View style={styles.chartCard}>
                <View style={styles.chartIntro}>
                  <Ionicons name="analytics" size={17} color={COLORS.accent} />
                  <Text style={styles.chartSub}>
                    Compare the scheduled balance with your accelerated plan.
                  </Text>
                </View>
                <BalanceLineChart
                  schedule={p.currentSchedule}
                  compareSchedule={projection.newSchedule}
                  color={COLORS.accent}
                  compareColor={COLORS.green}
                />
                <View style={styles.savingsBanner}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
                  <Text style={styles.savingsBannerText}>
                    {projection.monthsSaved > 0
                      ? `Paid off ${formatDuration(projection.monthsSaved)} sooner · save ${fmtMoney(
                          projection.interestSaved,
                        )} in interest`
                      : 'No payoff-time change with the current extra-payment plan'}
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          <Text style={[styles.sectionTitle, styles.saveTitle]}>
            {saved ? 'Scenario Saved' : 'Save This Scenario for Later'}
          </Text>
          <View style={styles.actionCard}>
            {!saved ? (
              <View>
                <Text style={styles.nameLabel}>Scenario name</Text>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  onFocus={revealNameInput}
                  placeholder="e.g. Pay Off Home Early"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.saveBtn, saved && styles.savedBtn]}
              activeOpacity={0.9}
              onPress={saveScenario}
              disabled={saved}
              accessibilityRole="button"
            >
              <Ionicons name={saved ? 'checkmark-circle' : 'bookmark'} size={18} color="#fff" />
              <Text style={styles.saveText}>{saved ? 'Saved to your list' : 'Save Scenario'}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  headerLabel: { color: '#9EC9F5', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  headerValue: {
    color: COLORS.green,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 5,
  },
  headerSub: { color: 'rgba(222,237,255,0.70)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  scroll: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 11,
    marginTop: 7,
  },
  laterSectionTitle: { marginTop: 24 },
  saveTitle: { marginTop: 24 },
  planEditorCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.accent + '55',
    padding: 18,
    marginBottom: 18,
  },
  planEditorTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' },
  planEditorSub: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  paymentTypeRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 13,
    padding: 4,
    marginTop: 16,
  },
  paymentTypeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 8,
  },
  paymentTypeBtnActive: { backgroundColor: COLORS.accent },
  paymentTypeText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  paymentTypeTextActive: { color: '#fff' },
  editorInputLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  editorInputRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  editorPrefix: { color: COLORS.accent, fontSize: 19, fontWeight: '800', marginRight: 6 },
  editorInput: { flex: 1, color: COLORS.textPrimary, fontSize: 19, fontWeight: '800' },
  editorSuffix: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700', marginLeft: 8 },
  editorError: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 },
  editorErrorText: { color: COLORS.red, fontSize: 12, fontWeight: '600', flex: 1 },
  combinedPlanText: {
    color: COLORS.teal,
    fontSize: 11.5,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 10,
  },
  analysisCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
    backgroundColor: COLORS.green + '18',
  },
  analysisHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.green + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisTitle: { color: COLORS.green, fontSize: 17, fontWeight: '800' },
  analysisSub: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  analysisSection: { padding: 18 },
  centeredSectionLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    textAlign: 'center',
    marginBottom: 14,
  },
  analysisDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 18 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compareCol: { flex: 1, alignItems: 'center' },
  compareLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800' },
  compareValue: {
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 5,
    textAlign: 'center',
  },
  compareSub: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  monthlyChange: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginTop: 16,
    backgroundColor: COLORS.accent + '12',
  },
  monthlyChangeLabel: { color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '800' },
  monthlyChangeValue: { color: COLORS.accent, fontSize: 15, fontWeight: '900' },
  costNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: COLORS.teal + '12',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  costNoteText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  timeSaved: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.green + '14',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  timeSavedText: { color: COLORS.green, fontSize: 14, fontWeight: '800' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16 },
  metricBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  metricLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', flex: 1 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  interestOutcome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 13,
    padding: 14,
    marginTop: 4,
    backgroundColor: COLORS.green + '14',
  },
  interestOutcomeLabel: { color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '800' },
  interestOutcomeSub: { color: COLORS.textMuted, fontSize: 10.5, fontWeight: '600', marginTop: 4 },
  interestOutcomeValue: { color: COLORS.green, fontSize: 21, fontWeight: '900' },
  lumpBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.amber + '18',
    borderTopWidth: 1,
    borderTopColor: COLORS.amber + '44',
    padding: 16,
  },
  lumpBannerText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  narrativeCard: {
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
  narrativeIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrativeTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  narrativeText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 5,
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
