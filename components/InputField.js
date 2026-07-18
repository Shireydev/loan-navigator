import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { COLORS, formatInputWithCommas } from '../theme';

export default function InputField({
  label,
  value,
  onChangeText,
  prefix,
  suffix,
  placeholder,
  keyboardType = 'numeric',
  accentColor = COLORS.accent,
  formatCommas = true,
}) {
  // Add thousands separators as the user types for numeric fields.
  const handleChange = (text) => {
    if (formatCommas && keyboardType === 'numeric') {
      onChangeText(formatInputWithCommas(text));
    } else {
      onChangeText(text);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, { borderColor: COLORS.border }]}>
        {prefix ? <Text style={[styles.affix, { color: accentColor }]}>{prefix}</Text> : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          keyboardType={keyboardType}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function ValidationBanner({ message }) {
  if (!message) return null;

  return (
    <View style={styles.validationBanner} accessibilityRole="alert">
      <Text style={styles.validationTitle}>Check your inputs</Text>
      <Text style={styles.validationMessage}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 54,
  },
  affix: { fontSize: 18, fontWeight: '700', marginRight: 6 },
  suffix: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600', marginLeft: 6 },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  validationBanner: {
    backgroundColor: COLORS.red + '18',
    borderColor: COLORS.red + '55',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  validationTitle: { color: COLORS.red, fontSize: 13, fontWeight: '800', marginBottom: 3 },
  validationMessage: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
});
