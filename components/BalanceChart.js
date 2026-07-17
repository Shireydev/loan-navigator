import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, fmtMoney } from '../theme';

// Simple bar chart of remaining balance over years, optional comparison series
export default function BalanceChart({ schedule, compareSchedule, color = COLORS.accent, compareColor = COLORS.teal }) {
  if (!schedule || schedule.length === 0) return null;

  const allBalances = [
    ...schedule.map((s) => s.balance),
    ...(compareSchedule ? compareSchedule.map((s) => s.balance) : []),
  ];
  const max = Math.max(...allBalances, 1);

  // Sample down to at most ~15 bars for readability
  const step = Math.max(1, Math.ceil(schedule.length / 15));
  const sampled = schedule.filter((_, i) => i % step === 0 || i === schedule.length - 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.chartRow}>
        {sampled.map((s, i) => {
          const h = (s.balance / max) * 120;
          const cmp = compareSchedule && compareSchedule.find((c) => c.year === s.year);
          const ch = cmp ? (cmp.balance / max) * 120 : 0;
          return (
            <View key={i} style={styles.barCol}>
              <View style={styles.barStack}>
                {compareSchedule ? (
                  <View style={[styles.bar, { height: Math.max(ch, 2), backgroundColor: compareColor, opacity: 0.9 }]} />
                ) : null}
                <View style={[styles.bar, { height: Math.max(h, 2), backgroundColor: color }]} />
              </View>
              <Text style={styles.yearLabel}>{s.year}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>{compareSchedule ? 'Standard' : 'Balance'}</Text>
        </View>
        {compareSchedule ? (
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: compareColor }]} />
            <Text style={styles.legendText}>With Extra</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.axisLabel}>Remaining balance by year (peak {fmtMoney(max)})</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    paddingHorizontal: 2,
  },
  barCol: { flex: 1, alignItems: 'center' },
  barStack: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 120 },
  bar: { width: 5, borderRadius: 3 },
  yearLabel: { color: COLORS.textMuted, fontSize: 9, marginTop: 6 },
  legendRow: { flexDirection: 'row', gap: 20, marginTop: 14, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  axisLabel: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center', marginTop: 10 },
});
