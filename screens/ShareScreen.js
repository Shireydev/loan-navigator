import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Clipboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import GradientHeader from '../components/GradientHeader';
import { COLORS } from '../theme';

// The live web build of this app. Testers can open it in Safari (or any
// mobile browser) and use the calculators without installing anything.
const WEB_APP_URL = 'https://can-you-build-for-me-a-mortgag.expo.app';

const SHARE_MESSAGE =
  `Try out our Mortgage & Auto Loan calculators right from your phone — ` +
  `no install needed. Just open this link in Safari:\n\n${WEB_APP_URL}`;

const STEPS = [
  {
    icon: 'share-outline',
    color: COLORS.accent,
    title: 'Send the link',
    body: 'Tap “Share Link” below and pick Messages, Mail, or any app to send it to your testers.',
  },
  {
    icon: 'globe-outline',
    color: COLORS.teal,
    title: 'Open in Safari',
    body: 'Testers tap the link on their iPhone — it opens the full app right inside Safari.',
  },
  {
    icon: 'add-circle-outline',
    color: COLORS.purple,
    title: 'Add to Home Screen (optional)',
    body: 'In Safari, tap the Share icon → “Add to Home Screen” for an app-like icon.',
  },
];

export default function ShareScreen() {
  const [copied, setCopied] = useState(false);

  const shareLink = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: SHARE_MESSAGE,
        url: WEB_APP_URL,
        title: 'Loan Calculators',
      });
    } catch (e) {}
  };

  const copyLink = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      Clipboard.setString(WEB_APP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  return (
    <View style={styles.container}>
      <GradientHeader
        title="Share with Testers"
        subtitle="Use it from Safari — no install"
        icon="share-social"
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.linkCard}>
          <View style={styles.linkHead}>
            <View style={[styles.linkIcon, { backgroundColor: COLORS.accent + '22' }]}>
              <Ionicons name="link" size={22} color={COLORS.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel}>Web App Link</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>{WEB_APP_URL}</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.shareBtn} activeOpacity={0.9} onPress={shareLink}>
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text style={styles.shareText}>Share Link</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.copyBtn, copied && styles.copyBtnDone]}
            activeOpacity={0.85}
            onPress={copyLink}
          >
            <Ionicons
              name={copied ? 'checkmark-circle' : 'copy-outline'}
              size={18}
              color={copied ? COLORS.green : COLORS.accent}
            />
            <Text style={[styles.copyText, copied && { color: COLORS.green }]}>
              {copied ? 'Copied to clipboard' : 'Copy Link'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>How testers use it</Text>
        {STEPS.map((s, i) => (
          <View key={i} style={styles.stepCard}>
            <View style={[styles.stepIcon, { backgroundColor: s.color + '22' }]}>
              <Ionicons name={s.icon} size={20} color={s.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.stepTitleRow}>
                <View style={[styles.stepNum, { backgroundColor: s.color }]}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepTitle}>{s.title}</Text>
              </View>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          </View>
        ))}

        <View style={styles.tipBanner}>
          <Ionicons name="information-circle" size={18} color={COLORS.amber} />
          <Text style={styles.tipText}>
            The web link works on iPhone, iPad, and Android — anything with a browser.
            No App Store or TestFlight approval needed.
          </Text>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 40 },
  linkCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  linkIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  linkLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  linkUrl: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 3 },
  shareBtn: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 5,
  },
  shareText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  copyBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  copyBtnDone: { borderColor: COLORS.green + '66' },
  copyText: { color: COLORS.accent, fontSize: 15, fontWeight: '700' },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 14 },
  stepCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  stepIcon: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  stepNum: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  stepTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  stepBody: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500', lineHeight: 19 },
  tipBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.amber + '15',
    borderRadius: 14,
    padding: 16,
    alignItems: 'flex-start',
  },
  tipText: { color: COLORS.textSecondary, fontSize: 13, flex: 1, fontWeight: '500', lineHeight: 19 },
});
