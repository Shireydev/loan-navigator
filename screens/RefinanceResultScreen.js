import React, { useCallback, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { COLORS, fmtMoney, formatProjectedPayoffMonth } from '../theme';
import useScrollToTopOnFocus from '../components/useScrollToTopOnFocus';
import { addSavedScenario, SCENARIO_TYPES } from '../savedScenarios';

function MetricRow({ label, value, color, last }) {
  return (
    <View style={[styles.metricRow, !last && styles.metricBorder]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function RefinanceResultScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useScrollToTopOnFocus(scrollRef, undefined, 'Refinance');
  const p = route.params;
  const [name, setName] = useState(p.presetName || '');
  const [saved, setSaved] = useState(false);
  const currentPayoffDate = formatProjectedPayoffMonth(p.currentPayoffMonths);
  const newPayoffDate = formatProjectedPayoffMonth(p.newPayoffMonths);

  const lowersPayment = p.monthlySavings > 0;
  const savesLifetime = p.lifetimeSavings > 0;
  const reasonableBreakEven = Number.isFinite(p.breakEven) && p.breakEven <= 60;
  const strongYes = savesLifetime && lowersPayment && reasonableBreakEven;
  const mixedOutcome = lowersPayment !== savesLifetime;
  const outcomeColor =
    strongYes || (lowersPayment && savesLifetime)
      ? COLORS.green
      : mixedOutcome
        ? COLORS.amber
        : COLORS.red;
  const payoffMonthDifference = p.newPayoffMonths - p.currentPayoffMonths;

  const verdictTitle = strongYes
    ? 'Strong Refinance Opportunity'
    : lowersPayment && savesLifetime
      ? 'Positive, but Slow to Recover Costs'
      : lowersPayment
        ? 'Lower Payment, Higher Lifetime Cost'
        : savesLifetime
          ? 'Higher Payment, Lower Lifetime Cost'
          : 'Refinance Costs More';

  const verdictSub = strongYes
    ? 'The new loan improves monthly cash flow and lifetime cost.'
    : lowersPayment && savesLifetime
      ? 'The loan saves money monthly and overall, but closing costs take longer to recover.'
      : lowersPayment
        ? 'The payment falls, but the new interest and closing costs outweigh that monthly benefit.'
        : savesLifetime
          ? 'The payment rises, but the shorter or lower-cost loan saves money over time.'
          : 'The new loan increases the payment and total remaining cost.';

  const monthlyNarrative = lowersPayment
    ? `The new principal-and-interest payment is ${fmtMoney(p.monthlySavings)} lower each month.`
    : `The new principal-and-interest payment is ${fmtMoney(Math.abs(p.monthlySavings))} higher each month.`;
  const lifetimeNarrative = savesLifetime
    ? `After the ${fmtMoney(p.closingCosts)} closing costs, the refinance is projected to save ${fmtMoney(p.lifetimeSavings)} over the remaining life of the loan.`
    : `After the ${fmtMoney(p.closingCosts)} closing costs, the refinance is projected to cost ${fmtMoney(Math.abs(p.lifetimeSavings))} more over the remaining life of the loan.`;
  const timelineNarrative =
    payoffMonthDifference > 0
      ? `The new payoff schedule is about ${payoffMonthDifference} months longer, moving the estimated payoff from ${currentPayoffDate} to ${newPayoffDate}.`
      : payoffMonthDifference < 0
        ? `The new payoff schedule is about ${Math.abs(payoffMonthDifference)} months shorter, moving the estimated payoff from ${currentPayoffDate} to ${newPayoffDate}.`
        : `The estimated payoff timeline is essentially unchanged at ${newPayoffDate}.`;
  const breakEvenNarrative =
    lowersPayment && Number.isFinite(p.breakEven)
      ? `It takes about ${p.breakEven.toFixed(1)} months of payment savings to recover the closing costs.`
      : 'Because the new payment is not lower, there is no monthly-payment break-even point.';

  const saveAnalysis = async () => {
    try {
      await addSavedScenario({
        type: SCENARIO_TYPES.HOME_REFINANCE,
        name: name.trim() || 'Home Refinance',
        inputs: p.inputs,
        results: {
          balance: p.currentBalance,
          originalLoan: p.originalLoan,
          curRate: p.currentRate,
          newRate: p.newRate,
          origYears: p.originalTerm,
          yearsLeft: p.yearsLeft,
          currentPayoffDate,
          newPayoffDate,
          monthlySavings: p.monthlySavings,
          breakEven: p.breakEven,
          lifetimeSavings: p.lifetimeSavings,
          worthIt: savesLifetime,
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
            accessibilityLabel="Back to refinance analyzer"
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Refinance Analysis</Text>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate('Home')}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Return to home"
          >
            <Ionicons name="home-outline" size={21} color="#8CC5FF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerLabel}>
          {savesLifetime ? 'PROJECTED LIFETIME SAVINGS' : 'PROJECTED LIFETIME LOSS'}
        </Text>
        <Text style={[styles.headerValue, { color: outcomeColor }]}>
          {fmtMoney(Math.abs(p.lifetimeSavings))}
        </Text>
        <Text style={styles.headerSub}>after estimated closing costs</Text>
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
          <Text style={styles.sectionTitle}>Decision Summary</Text>
          <View style={styles.analysisCard}>
            <View style={[styles.analysisHeader, { backgroundColor: outcomeColor + '18' }]}>
              <View style={[styles.analysisHeaderIcon, { backgroundColor: outcomeColor + '22' }]}>
                <Ionicons
                  name={
                    mixedOutcome
                      ? 'swap-horizontal'
                      : savesLifetime
                        ? 'checkmark-circle'
                        : 'close-circle'
                  }
                  size={25}
                  color={outcomeColor}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.analysisTitle, { color: outcomeColor }]}>{verdictTitle}</Text>
                <Text style={styles.analysisSub}>{verdictSub}</Text>
              </View>
            </View>

            <View style={styles.analysisSection}>
              <Text style={[styles.analysisSectionLabel, styles.centeredSectionLabel]}>
                MONTHLY PRINCIPAL & INTEREST
              </Text>
              <View style={styles.paymentCompare}>
                <View style={styles.paymentCompareCol}>
                  <Text style={styles.paymentCompareLabel}>CURRENT</Text>
                  <Text style={styles.paymentCompareValue}>{fmtMoney(p.currentPayment)}</Text>
                  <Text style={styles.paymentCompareSub}>
                    {p.currentRate.toFixed(2)}% APR · {p.currentPayoffMonths} mo left{`\n`}Est.{' '}
                    {currentPayoffDate}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={21} color={COLORS.textMuted} />
                <View style={styles.paymentCompareCol}>
                  <Text style={styles.paymentCompareLabel}>NEW</Text>
                  <Text style={styles.paymentCompareValue}>{fmtMoney(p.newPayment)}</Text>
                  <Text style={styles.paymentCompareSub}>
                    {p.newRate.toFixed(2)}% APR · {p.newPayoffMonths} mo{`\n`}Est. {newPayoffDate}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.monthlyChange,
                  { backgroundColor: (lowersPayment ? COLORS.green : COLORS.red) + '12' },
                ]}
              >
                <Text style={styles.monthlyChangeLabel}>MONTHLY PAYMENT CHANGE</Text>
                <Text
                  style={[
                    styles.monthlyChangeValue,
                    { color: lowersPayment ? COLORS.green : COLORS.red },
                  ]}
                >
                  {lowersPayment
                    ? `Save ${fmtMoney(p.monthlySavings)}/mo`
                    : `Pay ${fmtMoney(Math.abs(p.monthlySavings))}/mo more`}
                </Text>
              </View>
            </View>

            <View style={styles.analysisDivider} />

            <View style={styles.analysisSection}>
              <Text style={[styles.analysisSectionLabel, styles.centeredSectionLabel]}>
                REMAINING LOAN COST
              </Text>
              <MetricRow
                label="Interest Left on Current Loan"
                value={fmtMoney(p.currentInterest)}
                color={COLORS.red}
              />
              <MetricRow
                label="Interest on New Loan"
                value={fmtMoney(p.newInterest)}
                color={COLORS.teal}
              />
              <MetricRow
                label="Closing Costs"
                value={fmtMoney(p.closingCosts)}
                color={COLORS.textPrimary}
                last
              />
              <View
                style={[
                  styles.lifetimeOutcome,
                  { backgroundColor: (savesLifetime ? COLORS.green : COLORS.red) + '14' },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.lifetimeOutcomeLabel}>
                    {savesLifetime ? 'LIFETIME SAVINGS AFTER COSTS' : 'LIFETIME LOSS AFTER COSTS'}
                  </Text>
                  <Text style={styles.lifetimeOutcomeSub}>
                    Interest difference minus closing costs
                  </Text>
                </View>
                <Text
                  style={[
                    styles.lifetimeOutcomeValue,
                    { color: savesLifetime ? COLORS.green : COLORS.red },
                  ]}
                >
                  {fmtMoney(Math.abs(p.lifetimeSavings))}
                </Text>
              </View>
            </View>

            <View style={styles.analysisDivider} />

            <View style={styles.timingRow}>
              <View style={styles.timingMetric}>
                <Ionicons name="timer-outline" size={19} color={COLORS.amber} />
                <Text style={styles.timingValue}>
                  {lowersPayment && Number.isFinite(p.breakEven)
                    ? `${p.breakEven.toFixed(1)} mo`
                    : 'N/A'}
                </Text>
                <Text style={styles.timingLabel}>Closing-cost break-even</Text>
              </View>
              <View style={styles.timingDivider} />
              <View style={styles.timingMetric}>
                <Ionicons name="calendar-outline" size={19} color={COLORS.purple} />
                <Text style={styles.timingValue}>
                  {payoffMonthDifference === 0
                    ? 'No change'
                    : `${Math.abs(payoffMonthDifference)} mo ${payoffMonthDifference > 0 ? 'longer' : 'shorter'}`}
                </Text>
                <Text style={styles.timingLabel}>Payoff timeline change</Text>
              </View>
            </View>
          </View>

          <View style={styles.analysisNarrative}>
            <View style={styles.analysisNarrativeIcon}>
              <Ionicons name="information-circle" size={20} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.analysisNarrativeTitle}>What this means for you</Text>
              <Text style={styles.analysisNarrativeText}>
                {monthlyNarrative} {lifetimeNarrative} {timelineNarrative} {breakEvenNarrative} The
                lifetime comparison focuses on interest and closing costs because the same remaining
                principal must be repaid either way. Property tax, insurance, HOA, and other escrow
                costs are not changed by refinancing.
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionTitle, styles.saveTitle]}>
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
                  onFocus={revealNameInput}
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
              <Text style={styles.saveText}>{saved ? 'Saved to your list' : 'Save Analysis'}</Text>
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
  headerValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1, marginTop: 5 },
  headerSub: { color: 'rgba(222,237,255,0.70)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  scroll: { padding: 20, paddingBottom: 40 },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 11,
    marginTop: 7,
  },
  saveTitle: { marginTop: 24 },
  analysisCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14 },
  analysisHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisTitle: { fontSize: 17, fontWeight: '800' },
  analysisSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  analysisSection: { padding: 18 },
  analysisSectionLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    marginBottom: 14,
  },
  centeredSectionLabel: { textAlign: 'center' },
  analysisDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 18 },
  paymentCompare: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentCompareCol: { flex: 1, alignItems: 'center' },
  paymentCompareLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800' },
  paymentCompareValue: { color: COLORS.textPrimary, fontSize: 23, fontWeight: '900', marginTop: 5 },
  paymentCompareSub: {
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
  },
  monthlyChangeLabel: { color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '800' },
  monthlyChangeValue: { fontSize: 15, fontWeight: '900' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16 },
  metricBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  metricLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', flex: 1 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  lifetimeOutcome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 13,
    padding: 14,
    marginTop: 4,
  },
  lifetimeOutcomeLabel: { color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '800' },
  lifetimeOutcomeSub: { color: COLORS.textMuted, fontSize: 10.5, fontWeight: '600', marginTop: 4 },
  lifetimeOutcomeValue: { fontSize: 21, fontWeight: '900' },
  timingRow: { flexDirection: 'row', padding: 18 },
  timingMetric: { flex: 1 },
  timingDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  timingValue: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 8 },
  timingLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 4,
  },
  analysisNarrative: {
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
  analysisNarrativeIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.accent + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisNarrativeTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  analysisNarrativeText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 5,
  },
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
