// Where a host application stands: submitted → under review → approved,
// or rejected with reasons and a way to fix and resubmit.
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  Check,
  CircleAlert,
  Clock3,
  PartyPopper,
  X,
} from 'lucide-react-native';
import { colors, fonts, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { ECONOMY, inr } from '../../data/economy';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import { Card } from '../../components/ListRow';

const fmt = t => {
  if (!t) return '';
  const d = new Date(t);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()}/${d.getMonth() + 1} · ${h % 12 || 12}:${m} ${
    h < 12 ? 'AM' : 'PM'
  }`;
};

const DOT = {
  done: { style: 'dotDone', icon: Check },
  active: { style: 'dotActive', icon: Clock3 },
  failed: { style: 'dotFailed', icon: X },
  todo: { style: null, icon: null },
};

function Stepper({ steps }) {
  return (
    <Card style={styles.card}>
      {steps.map((s, i) => {
        const d = DOT[s.state];
        return (
          <View key={s.title} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.dot, d.style && styles[d.style]]}>
                {d.icon ? (
                  <d.icon size={14} color={colors.white} strokeWidth={3} />
                ) : null}
              </View>
              {i < steps.length - 1 ? (
                <View
                  style={[styles.line, s.state === 'done' && styles.lineDone]}
                />
              ) : null}
            </View>
            <View style={styles.stepText}>
              <Txt
                variant="label"
                color={s.state === 'todo' ? colors.textFaint : colors.ink}
              >
                {s.title}
              </Txt>
              {s.sub ? <Txt variant="small">{s.sub}</Txt> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const COPY = {
  pending: {
    title: 'Application under review',
    body: 'Our team is checking your photos and ID. This usually takes less than 24 hours — we’ll notify you.',
    badge: { icon: Clock3, color: colors.warning },
  },
  approved: {
    title: 'You’re a REBU host! 🎉',
    body: `Your Host tab is ready. Go online to get calls or start a live. We’ve added a ${inr(
      ECONOMY.welcomeBonusCoins * ECONOMY.coinInr,
    )} welcome bonus to your earnings.`,
    badge: { icon: PartyPopper, color: colors.success },
  },
  rejected: {
    title: 'Application not approved',
    body: 'Please fix the points below and resubmit. Your answers are saved.',
    badge: { icon: CircleAlert, color: colors.danger },
  },
};

export default function HostStatusScreen({ navigation }) {
  const { hostApp, user } = useApp();
  const status = hostApp.status === 'none' ? 'pending' : hostApp.status;
  const copy = COPY[status];
  const photo = hostApp.data?.photos?.[0] || user.photos[0];

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          {status === 'approved' ? (
            <Button
              title="Open Host Center"
              onPress={() => navigation.replace('HostCenter')}
            />
          ) : status === 'rejected' ? (
            <Button
              title="Fix & resubmit"
              onPress={() =>
                navigation.replace('HostApply', { resubmit: true })
              }
            />
          ) : (
            <Button
              title="Back to app"
              variant="outline"
              onPress={() => navigation.popToTop()}
            />
          )}
        </View>
      }
    >
      <Header title="Host application" />
      <View style={styles.body}>
        <View style={styles.hero}>
          <View>
            <Image source={{ uri: photo }} style={styles.avatar} />
            <View style={[styles.badge, { backgroundColor: copy.badge.color }]}>
              <copy.badge.icon size={16} color={colors.white} />
            </View>
          </View>
          <Txt variant="h2" center style={styles.title}>
            {copy.title}
          </Txt>
          <Txt variant="body" center color={colors.textMuted}>
            {copy.body}
          </Txt>
        </View>

        {status === 'rejected' ? (
          <Card style={styles.reasons}>
            {(hostApp.reasons || []).map(r => (
              <View key={r} style={styles.reason}>
                <CircleAlert size={16} color={colors.danger} />
                <Txt variant="small" style={styles.flex}>
                  {r}
                </Txt>
              </View>
            ))}
          </Card>
        ) : null}

        <Stepper
          steps={[
            {
              title: 'Application submitted',
              sub: fmt(hostApp.submittedAt),
              state: 'done',
            },
            {
              title: 'Profile & ID review',
              sub:
                status === 'approved'
                  ? 'Verified'
                  : status === 'rejected'
                  ? `Needs changes · ${fmt(hostApp.reviewedAt)}`
                  : 'In progress',
              state:
                status === 'approved'
                  ? 'done'
                  : status === 'rejected'
                  ? 'failed'
                  : 'active',
            },
            {
              title: 'Approved — start earning',
              sub: status === 'approved' ? fmt(hostApp.approvedAt) : null,
              state: status === 'approved' ? 'done' : 'todo',
            },
          ]}
        />

        {status === 'pending' ? (
          <Txt variant="tiny" center style={styles.demo}>
            Test build: applications are approved automatically about 20 seconds
            after submitting.
          </Txt>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md },
  footer: { paddingHorizontal: spacing.md, paddingTop: 10 },
  hero: { alignItems: 'center', paddingVertical: 12 },
  avatar: { width: 112, height: 112, borderRadius: 56 },
  badge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginTop: 16, marginBottom: 6 },
  reasons: { marginTop: 18, gap: 10, backgroundColor: '#FFF1F1' },
  reason: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  card: { marginTop: 18 },
  step: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.success },
  dotActive: { backgroundColor: colors.warning },
  dotFailed: { backgroundColor: colors.danger },
  line: {
    width: 2,
    flex: 1,
    minHeight: 26,
    backgroundColor: colors.surfaceMuted,
    marginVertical: 3,
  },
  lineDone: { backgroundColor: colors.success },
  stepText: { flex: 1, paddingBottom: 18, paddingTop: 2 },
  demo: { marginTop: 14, paddingHorizontal: 20, fontFamily: fonts.medium },
});
