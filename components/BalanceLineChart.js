import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

// Line chart of remaining balance over years — standard vs. with extra payment.
// Matches the reference "Balance Over Time (Line Chart)" design, built with
// plain Views (no external SVG dependency) using small rotated segments.

function Series({ points, color, plotW, plotH, maxYear, maxBal }) {
  const xy = points.map((p) => ({
    x: maxYear > 0 ? (p.year / maxYear) * plotW : 0,
    y: plotH - (p.balance / maxBal) * plotH,
  }));

  return (
    <>
      {xy.slice(1).map((pt, i) => {
        const prev = xy[i];
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: prev.x,
              top: prev.y,
              width: len,
              height: 3,
              backgroundColor: color,
              borderRadius: 2,
              transform: [{ translateY: -1.5 }, { rotateZ: `${angle}deg` }],
              transformOrigin: 'left center',
            }}
          />
        );
      })}
      {/* end dot */}
      <View
        style={{
          position: 'absolute',
          left: xy[xy.length - 1].x - 4,
          top: xy[xy.length - 1].y - 4,
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        }}
      />
    </>
  );
}

export default function BalanceLineChart({
  schedule,
  compareSchedule,
  color = COLORS.accent,
  compareColor = COLORS.green,
}) {
  if (!schedule || schedule.length === 0) return null;

  const plotW = 260;
  const plotH = 150;

  const initial = (sch) => Math.max(...sch.map((s) => s.balance), 0);

  const s1 = [{ year: 0, balance: initial(schedule) }, ...schedule.map((s) => ({ year: s.year, balance: s.balance }))];
  const s2 = compareSchedule
    ? [{ year: 0, balance: initial(compareSchedule) }, ...compareSchedule.map((s) => ({ year: s.year, balance: s.balance }))]
    : null;

  const maxYear = Math.max(s1[s1.length - 1].year, s2 ? s2[s2.length - 1].year : 0, 1);
  const maxBal = Math.max(...s1.map((p) => p.balance), ...(s2 ? s2.map((p) => p.balance) : [0]), 1);

  const yTicks = 4;
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => (maxBal / yTicks) * (yTicks - i));

  const xStep = maxYear <= 10 ? 2 : 5;
  const xTicks = [];
  for (let yr = 0; yr <= maxYear; yr += xStep) xTicks.push(yr);
  if (xTicks[xTicks.length - 1] !== maxYear) xTicks.push(maxYear);

  const fmtAxis = (v) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}m`;
    if (v >= 1000) return `$${Math.round(v / 1000)}k`;
    return `$${Math.round(v)}`;
  };

  return (
    <View>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>Standard Payment</Text>
        </View>
        {s2 ? (
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: compareColor }]} />
            <Text style={styles.legendText}>With Extra Payment</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chartBody}>
        {/* Y axis labels */}
        <View style={[styles.yAxis, { height: plotH }]}>
          {tickVals.map((v, i) => (
            <Text key={i} style={styles.yLabel}>{fmtAxis(v)}</Text>
          ))}
        </View>

        {/* Plot area */}
        <View style={[styles.plot, { width: plotW, height: plotH }]}>
          {/* grid lines */}
          {tickVals.map((_, i) => (
            <View
              key={i}
              style={[styles.grid, { top: (plotH / yTicks) * i }]}
            />
          ))}
          <Series points={s1} color={color} plotW={plotW} plotH={plotH} maxYear={maxYear} maxBal={maxBal} />
          {s2 ? (
            <Series points={s2} color={compareColor} plotW={plotW} plotH={plotH} maxYear={maxYear} maxBal={maxBal} />
          ) : null}
        </View>
      </View>

      {/* X axis labels */}
      <View style={[styles.xAxis, { marginLeft: 44, width: plotW }]}>
        {xTicks.map((yr, i) => (
          <Text
            key={i}
            style={[
              styles.xLabel,
              { position: 'absolute', left: (yr / maxYear) * plotW - 10 },
            ]}
          >
            {yr}
          </Text>
        ))}
      </View>
      <Text style={styles.axisTitle}>Years</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legendRow: { flexDirection: 'row', gap: 18, justifyContent: 'flex-end', marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  chartBody: { flexDirection: 'row' },
  yAxis: { width: 44, justifyContent: 'space-between', paddingRight: 6 },
  yLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'right' },
  plot: { position: 'relative' },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: COLORS.border, opacity: 0.4 },
  xAxis: { height: 16, marginTop: 4 },
  xLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center', width: 20 },
  axisTitle: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 6 },
});
