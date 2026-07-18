import React, { useCallback, useRef, useState } from 'react';
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
import { COLORS, fmtMoney } from '../theme';
import useScrollToTopOnFocus from '../components/useScrollToTopOnFocus';

function MetricRow({ label, value, color = COLORS.textPrimary, last, detail }) {
  return (
    <View style={[styles.metricRow, !last && styles.metricBorder]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
      </View>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Comparison({ left, right, leftDetail, rightDetail }) {
  return (
    <View style={styles.compareRow}>
      <View style={styles.compareCol}>
        <Text style={styles.compareLabel}>CURRENT</Text>
        <Text style={styles.compareValue}>{left}</Text>
        <Text style={styles.compareDetail}>{leftDetail}</Text>
      </View>
      <Ionicons name="arrow-forward" size={21} color={COLORS.textMuted} />
      <View style={styles.compareCol}>
        <Text style={styles.compareLabel}>NEW</Text>
        <Text style={styles.compareValue}>{right}</Text>
        <Text style={styles.compareDetail}>{rightDetail}</Text>
      </View>
    </View>
  );
}

function Narrative({ children }) {
  return (
    <View style={styles.narrativeCard}>
      <View style={styles.narrativeIcon}>
        <Ionicons name="information-circle" size={20} color={COLORS.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.narrativeTitle}>What this means for you</Text>
        <Text style={styles.narrativeText}>{children}</Text>
      </View>
    </View>
  );
}

function PurchaseResults({ p }) {
  return (
    <>
      <Text style={styles.sectionTitle}>Purchase Breakdown</Text>
      <View style={styles.analysisCard}>
        <View style={styles.positiveHeader}>
          <View style={styles.positiveHeaderIcon}>
            <Ionicons name="car-sport" size={25} color={COLORS.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.analysisTitle, { color: COLORS.accent }]}>
              Your Financing Plan
            </Text>
            <Text style={styles.analysisSub}>
              See how the purchase price becomes the amount financed.
            </Text>
          </View>
        </View>

        <View style={styles.analysisSection}>
          <SectionLabel>ESTIMATED MONTHLY PAYMENT</SectionLabel>
          <Text style={styles.primaryResult}>{fmtMoney(p.monthlyPayment)}</Text>
          <Text style={styles.primaryResultSub}>
            {p.rate.toFixed(2)}% APR · {p.term} monthly payments
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.analysisSection}>
          <SectionLabel>FROM VEHICLE PRICE TO LOAN</SectionLabel>
          <MetricRow label="Vehicle Price" value={fmtMoney(p.price)} />
          <MetricRow
            label="Trade-in Credit"
            value={`−${fmtMoney(p.tradeIn)}`}
            color={COLORS.teal}
          />
          <MetricRow
            label="Taxable Amount"
            value={fmtMoney(p.taxableAmount)}
            detail="Vehicle price after trade-in credit"
          />
          <MetricRow
            label={`Sales Tax (${p.salesTaxRate.toFixed(2)}%)`}
            value={fmtMoney(p.salesTaxAmount)}
            color={COLORS.amber}
          />
          <MetricRow
            label="Down Payment"
            value={`−${fmtMoney(p.downPayment)}`}
            color={COLORS.green}
            detail="Paid upfront instead of financed"
            last
          />
          <View style={styles.subtotalRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subtotalLabel}>AMOUNT FINANCED</Text>
              <Text style={styles.subtotalSub}>Principal used to calculate the loan payment</Text>
            </View>
            <Text style={styles.subtotalValue}>{fmtMoney(p.amountFinanced)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.analysisSection}>
          <SectionLabel>LOAN AND OWNERSHIP COST</SectionLabel>
          <MetricRow label="Financed Principal" value={fmtMoney(p.amountFinanced)} />
          <MetricRow
            label="Interest Over Loan Term"
            value={fmtMoney(p.totalInterest)}
            color={COLORS.red}
          />
          <MetricRow label="Total of Loan Payments" value={fmtMoney(p.totalLoanPayments)} last />
          <View style={styles.outcomeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.outcomeLabel}>ESTIMATED TOTAL ACQUISITION COST</Text>
              <Text style={styles.outcomeSub}>Cash, trade-in value, tax, and loan interest</Text>
            </View>
            <Text style={styles.outcomeValue}>{fmtMoney(p.totalCost)}</Text>
          </View>
        </View>
      </View>

      <Narrative>
        The payment is calculated from the {fmtMoney(p.amountFinanced)} financed balance—not just
        the vehicle price. Your trade-in reduces the taxable amount, sales tax is added, and your
        down payment reduces what must be borrowed. The total acquisition cost includes the value of
        the trade-in and cash paid upfront because both are part of what you give up to purchase the
        vehicle. Registration, title, dealer, warranty, and insurance costs are excluded unless they
        are included in the vehicle price.
      </Narrative>
    </>
  );
}

function PayoffResults({ p }) {
  const monthlyChange = p.newPayment - p.currentPayment;
  const planSummary =
    p.extra > 0 && p.lump > 0
      ? `Adding ${fmtMoney(p.extra)} each month and applying a ${fmtMoney(p.lump)} lump sum`
      : p.extra > 0
        ? `Adding ${fmtMoney(p.extra)} each month`
        : `Applying a ${fmtMoney(p.lump)} lump sum`;

  return (
    <>
      <Text style={styles.sectionTitle}>Projected Impact</Text>
      <View style={styles.analysisCard}>
        <View style={[styles.positiveHeader, { backgroundColor: COLORS.green + '18' }]}>
          <View style={[styles.positiveHeaderIcon, { backgroundColor: COLORS.green + '22' }]}>
            <Ionicons name="rocket" size={25} color={COLORS.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.analysisTitle, { color: COLORS.green }]}>
              Pay Off Your Auto Loan Sooner
            </Text>
            <Text style={styles.analysisSub}>
              Extra principal reduces both payoff time and future interest.
            </Text>
          </View>
        </View>

        <View style={styles.analysisSection}>
          <SectionLabel>MONTHLY LOAN PAYMENT</SectionLabel>
          <Comparison
            left={fmtMoney(p.currentPayment)}
            right={fmtMoney(p.newPayment)}
            leftDetail="scheduled payment"
            rightDetail="with extra principal"
          />
          <View style={styles.changeRow}>
            <Text style={styles.changeLabel}>MONTHLY PAYMENT CHANGE</Text>
            <Text style={styles.changeValue}>
              {monthlyChange > 0 ? `+${fmtMoney(monthlyChange)}/mo` : 'No monthly change'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.analysisSection}>
          <SectionLabel>PAYOFF TIMELINE</SectionLabel>
          <Comparison
            left={`${p.currentPayoffMonths} mo`}
            right={`${p.newPayoffMonths} mo`}
            leftDetail="scheduled payoff"
            rightDetail="accelerated payoff"
          />
          <View style={styles.timeSavedRow}>
            <Ionicons name="time" size={18} color={COLORS.green} />
            <Text style={styles.timeSavedText}>{p.monthsSaved} months sooner</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.analysisSection}>
          <SectionLabel>REMAINING LOAN INTEREST</SectionLabel>
          <MetricRow
            label="Current Schedule"
            value={fmtMoney(p.currentInterest)}
            color={COLORS.red}
          />
          <MetricRow
            label="Accelerated Schedule"
            value={fmtMoney(p.newInterest)}
            color={COLORS.teal}
            last
          />
          <View style={[styles.outcomeRow, { backgroundColor: COLORS.green + '14' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.outcomeLabel}>PROJECTED INTEREST SAVINGS</Text>
              <Text style={styles.outcomeSub}>Interest avoided by paying principal sooner</Text>
            </View>
            <Text style={[styles.outcomeValue, { color: COLORS.green }]}>
              {fmtMoney(p.interestSaved)}
            </Text>
          </View>
        </View>

        {p.lump > 0 ? (
          <View style={styles.lumpRow}>
            <Ionicons name="flash" size={18} color={COLORS.amber} />
            <Text style={styles.lumpText}>
              The {fmtMoney(p.lump)} one-time payment lowers the estimated balance from{' '}
              {fmtMoney(p.currentBalance)} to {fmtMoney(p.balanceAfterLump)} immediately.
            </Text>
          </View>
        ) : null}
      </View>

      <Narrative>
        {planSummary} shortens the projected payoff from {p.currentPayoffMonths} months to{' '}
        {p.newPayoffMonths} months and saves {fmtMoney(p.interestSaved)} in interest. Extra payments
        are treated as principal-only payments, which lowers the balance before future interest is
        calculated. This comparison covers the auto loan only; insurance, fuel, maintenance,
        registration, and depreciation are separate ownership costs.
      </Narrative>

      {p.currentSchedule?.length && p.newSchedule?.length ? (
        <>
          <Text style={[styles.sectionTitle, styles.laterSectionTitle]}>Balance Projection</Text>
          <View style={styles.chartCard}>
            <View style={styles.chartIntro}>
              <Ionicons name="analytics" size={17} color={COLORS.accent} />
              <Text style={styles.chartIntroText}>
                Compare the scheduled balance with the accelerated plan.
              </Text>
            </View>
            <BalanceLineChart
              schedule={p.currentSchedule}
              compareSchedule={p.newSchedule}
              color={COLORS.accent}
              compareColor={COLORS.green}
            />
          </View>
        </>
      ) : null}
    </>
  );
}

function RefinanceResults({ p }) {
  const savesMonthly = p.monthlySavings > 0;
  const savesLifetime = p.lifetimeSavings > 0;
  const payoffDifference = p.newPayoffMonths - p.currentPayoffMonths;
  const outcomeColor = savesLifetime ? COLORS.green : COLORS.red;
  const title =
    savesMonthly && savesLifetime
      ? 'Lower Payment and Lower Remaining Cost'
      : savesMonthly
        ? 'Lower Payment, Higher Remaining Cost'
        : savesLifetime
          ? 'Higher Payment, Lower Remaining Cost'
          : 'Refinance Costs More';

  return (
    <>
      <Text style={styles.sectionTitle}>Decision Summary</Text>
      <View style={styles.analysisCard}>
        <View style={[styles.positiveHeader, { backgroundColor: outcomeColor + '18' }]}>
          <View style={[styles.positiveHeaderIcon, { backgroundColor: outcomeColor + '22' }]}>
            <Ionicons
              name={savesLifetime ? 'checkmark-circle' : 'close-circle'}
              size={25}
              color={outcomeColor}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.analysisTitle, { color: outcomeColor }]}>{title}</Text>
            <Text style={styles.analysisSub}>
              Compare monthly cash flow with the full remaining cost after fees.
            </Text>
          </View>
        </View>

        <View style={styles.analysisSection}>
          <SectionLabel>MONTHLY PRINCIPAL & INTEREST</SectionLabel>
          <Comparison
            left={fmtMoney(p.currentPayment)}
            right={fmtMoney(p.newPayment)}
            leftDetail={`${p.currentRate.toFixed(2)}% APR · ${p.currentPayoffMonths} mo`}
            rightDetail={`${p.newRate.toFixed(2)}% APR · ${p.newPayoffMonths} mo`}
          />
          <View
            style={[
              styles.changeRow,
              { backgroundColor: (savesMonthly ? COLORS.green : COLORS.red) + '12' },
            ]}
          >
            <Text style={styles.changeLabel}>MONTHLY PAYMENT CHANGE</Text>
            <Text style={[styles.changeValue, { color: savesMonthly ? COLORS.green : COLORS.red }]}>
              {savesMonthly
                ? `Save ${fmtMoney(p.monthlySavings)}/mo`
                : `Pay ${fmtMoney(Math.abs(p.monthlySavings))}/mo more`}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.analysisSection}>
          <SectionLabel>REMAINING LOAN COST</SectionLabel>
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
          <MetricRow label="Refinance Fees" value={fmtMoney(p.refinanceFees)} last />
          <View style={[styles.outcomeRow, { backgroundColor: outcomeColor + '14' }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.outcomeLabel}>
                {savesLifetime ? 'LIFETIME SAVINGS AFTER FEES' : 'LIFETIME LOSS AFTER FEES'}
              </Text>
              <Text style={styles.outcomeSub}>Interest difference minus refinance fees</Text>
            </View>
            <Text style={[styles.outcomeValue, { color: outcomeColor }]}>
              {fmtMoney(Math.abs(p.lifetimeSavings))}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />
        <View style={styles.timingRow}>
          <View style={styles.timingMetric}>
            <Ionicons name="timer-outline" size={19} color={COLORS.amber} />
            <Text style={styles.timingValue}>
              {savesMonthly && Number.isFinite(p.breakEven)
                ? `${p.breakEven.toFixed(1)} mo`
                : 'N/A'}
            </Text>
            <Text style={styles.timingLabel}>Fee break-even</Text>
          </View>
          <View style={styles.timingDivider} />
          <View style={styles.timingMetric}>
            <Ionicons name="calendar-outline" size={19} color={COLORS.purple} />
            <Text style={styles.timingValue}>
              {payoffDifference === 0
                ? 'No change'
                : `${Math.abs(payoffDifference)} mo ${payoffDifference > 0 ? 'longer' : 'shorter'}`}
            </Text>
            <Text style={styles.timingLabel}>Payoff timeline</Text>
          </View>
        </View>
      </View>

      <Narrative>
        The new payment is {fmtMoney(Math.abs(p.monthlySavings))}{' '}
        {savesMonthly ? 'lower' : 'higher'} each month. After the {fmtMoney(p.refinanceFees)} in
        fees, the refinance is projected to {savesLifetime ? 'save' : 'cost'}{' '}
        {fmtMoney(Math.abs(p.lifetimeSavings))} over the remaining loan life. A lower payment does
        not always mean a lower total cost: extending the payoff timeline can create more interest,
        while a shorter term can raise the payment but reduce interest. The comparison excludes
        insurance, registration, maintenance, and vehicle depreciation because refinancing does not
        change those costs.
      </Narrative>
    </>
  );
}

export default function AutoResultScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  useScrollToTopOnFocus(scrollRef, undefined, 'Auto');
  const p = route.params;
  const [name, setName] = useState(p.presetName || '');
  const [saved, setSaved] = useState(false);

  const isPurchase = p.resultType === 'purchase';
  const isPayoff = p.resultType === 'payoff';
  const isRefinance = p.resultType === 'refinance';
  const refinanceSaves = isRefinance && p.lifetimeSavings > 0;
  const headerColor = isRefinance && !refinanceSaves ? COLORS.red : COLORS.green;
  const headerLabel = isPurchase
    ? 'ESTIMATED MONTHLY PAYMENT'
    : isPayoff
      ? 'PROJECTED INTEREST SAVINGS'
      : refinanceSaves
        ? 'PROJECTED LIFETIME SAVINGS'
        : 'PROJECTED LIFETIME LOSS';
  const headerValue = isPurchase
    ? p.monthlyPayment
    : isPayoff
      ? p.interestSaved
      : Math.abs(p.lifetimeSavings);
  const headerTitle = isPurchase
    ? 'Your Auto Purchase'
    : isPayoff
      ? 'Your Payoff Projection'
      : 'Your Refinance Analysis';
  const headerSub = isPurchase
    ? `${p.rate.toFixed(2)}% APR · ${p.term} months`
    : isPayoff
      ? `Paid off ${p.monthsSaved} months sooner`
      : 'after estimated refinance fees';

  const saveResult = async () => {
    const type = isPurchase
      ? SCENARIO_TYPES.AUTO_PURCHASE
      : isPayoff
        ? SCENARIO_TYPES.AUTO_PAYOFF
        : SCENARIO_TYPES.AUTO_REFINANCE;
    const defaultName = isPurchase ? 'Car Purchase' : isPayoff ? 'Car Payoff' : 'Car Refinance';
    const results = isPurchase
      ? {
          price: p.price,
          financed: p.amountFinanced,
          rate: p.rate,
          term: p.term,
          monthly: p.monthlyPayment,
          totalInterest: p.totalInterest,
          totalCost: p.totalCost,
        }
      : isPayoff
        ? {
            balance: p.currentBalance,
            originalLoan: p.originalLoan,
            rate: p.rate,
            originalTerm: p.originalTerm,
            monthsRemaining: p.monthsRemaining,
            extra: p.extra,
            lump: p.lump,
            monthlyPayment: p.newPayment,
            payoffMonths: p.newPayoffMonths,
            monthsSaved: p.monthsSaved,
            interestSaved: p.interestSaved,
          }
        : {
            balance: p.currentBalance,
            curRate: p.currentRate,
            newRate: p.newRate,
            monthlySavings: p.monthlySavings,
            netSavings: p.lifetimeSavings,
            worthIt: p.lifetimeSavings > 0,
          };

    try {
      await addSavedScenario({
        type,
        name: name.trim() || defaultName,
        inputs: p.inputs,
        results,
      });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Unable to save auto-loan result:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Unable to Save',
        'Your auto-loan scenario could not be saved. Please try again.',
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
            accessibilityLabel="Back to auto loan inputs"
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate('Home')}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Return to home"
          >
            <Ionicons name="home-outline" size={21} color="#8CC5FF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.headerLabel}>{headerLabel}</Text>
        <Text style={[styles.headerValue, { color: headerColor }]}>{fmtMoney(headerValue)}</Text>
        <Text style={styles.headerSub}>{headerSub}</Text>
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
          {isPurchase ? <PurchaseResults p={p} /> : null}
          {isPayoff ? <PayoffResults p={p} /> : null}
          {isRefinance ? <RefinanceResults p={p} /> : null}

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
                  placeholder={
                    isPurchase
                      ? 'e.g. Honda CR-V'
                      : isPayoff
                        ? 'e.g. Pay Off Sedan Early'
                        : 'e.g. Truck Refi'
                  }
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            ) : null}
            <TouchableOpacity
              style={[styles.saveBtn, saved && styles.savedBtn]}
              activeOpacity={0.9}
              onPress={saveResult}
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
  laterSectionTitle: { marginTop: 24 },
  saveTitle: { marginTop: 24 },
  analysisCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  positiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 20,
    backgroundColor: COLORS.accent + '14',
  },
  positiveHeaderIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisTitle: { fontSize: 17, fontWeight: '800' },
  analysisSub: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  analysisSection: { padding: 18 },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.05,
    textAlign: 'center',
    marginBottom: 14,
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: 18 },
  primaryResult: {
    color: COLORS.textPrimary,
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  primaryResultSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 5,
  },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  metricBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  metricLabel: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  metricDetail: { color: COLORS.textMuted, fontSize: 10.5, fontWeight: '500', marginTop: 3 },
  metricValue: { fontSize: 16, fontWeight: '800' },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
    padding: 14,
    marginTop: 5,
    backgroundColor: COLORS.accent + '12',
  },
  subtotalLabel: { color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '800' },
  subtotalSub: { color: COLORS.textMuted, fontSize: 10.5, fontWeight: '600', marginTop: 4 },
  subtotalValue: { color: COLORS.accent, fontSize: 21, fontWeight: '900' },
  outcomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
    padding: 14,
    marginTop: 5,
    backgroundColor: COLORS.purple + '12',
  },
  outcomeLabel: { color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '800' },
  outcomeSub: { color: COLORS.textMuted, fontSize: 10.5, fontWeight: '600', marginTop: 4 },
  outcomeValue: { color: COLORS.textPrimary, fontSize: 21, fontWeight: '900' },
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
  compareDetail: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  changeRow: {
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
  changeLabel: { color: COLORS.textSecondary, fontSize: 9.5, fontWeight: '800' },
  changeValue: { color: COLORS.accent, fontSize: 15, fontWeight: '900' },
  timeSavedRow: {
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
  lumpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.amber + '18',
    borderTopWidth: 1,
    borderTopColor: COLORS.amber + '44',
    padding: 16,
  },
  lumpText: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  timingRow: { flexDirection: 'row', padding: 18 },
  timingMetric: { flex: 1 },
  timingDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  timingValue: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 8 },
  timingLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 4 },
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
  chartIntroText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '500', flex: 1 },
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
