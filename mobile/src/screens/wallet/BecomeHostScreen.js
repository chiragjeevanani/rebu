import React from 'react';
import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  Gift,
  IdCard,
  MessageCircle,
  Video,
  Wallet,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import { Card } from '../../components/ListRow';
import { canApplyToHost, womenOnly } from '../../utils/hosting';

const BENEFITS = [
  {
    icon: Video,
    title: 'Earn from calls',
    body: 'Get paid for every minute of voice & video calls.',
  },
  {
    icon: MessageCircle,
    title: 'Earn from chats',
    body: 'Paid messages from users who want to talk to you.',
  },
  {
    icon: Gift,
    title: 'Receive gifts',
    body: 'Gifts convert to diamonds you can withdraw.',
  },
  {
    icon: Wallet,
    title: 'Fast withdrawals',
    body: 'Withdraw to bank or UPI within 24–48 hours.',
  },
];

const HOW = [
  {
    title: 'Apply in 5 minutes',
    body: 'Your details, photos, a quick selfie check and ID.',
  },
  {
    title: 'We review it',
    body: 'Usually within 24 hours. Joining via an agency? Add its code.',
  },
  {
    title: 'Go online & earn',
    body: 'Take calls, go live and receive gifts. Withdraw to bank or UPI.',
  },
];

export default function BecomeHostScreen({ navigation }) {
  const { hostApp, user, config } = useApp();
  const status = hostApp.status;
  // Existing hosts and earlier applications keep their way in.
  const blocked = status === 'none' && !canApplyToHost(user, config);

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={{ padding: spacing.md }}>
          {blocked ? (
            <Txt variant="small" style={styles.blocked}>
              Hosting on REBU is open to women only.
            </Txt>
          ) : null}
          <Button
            disabled={blocked}
            title={
              status === 'approved'
                ? 'Open Host Center'
                : status === 'pending' || status === 'rejected'
                ? 'View application status'
                : 'Start application'
            }
            onPress={() =>
              navigation.replace(
                status === 'approved'
                  ? 'HostCenter'
                  : status === 'pending' || status === 'rejected'
                  ? 'HostStatus'
                  : 'HostApply',
              )
            }
          />
        </View>
      }
    >
      <Header title="Become a host" />
      <View style={{ paddingHorizontal: spacing.md }}>
        <LinearGradient
          colors={['#1C1C1E', '#1C1C1E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Txt style={styles.kicker}>REBU HOST PROGRAM</Txt>
          <Txt style={styles.title}>Turn conversations into income</Txt>
          <Txt style={styles.sub}>Top hosts earn ₹50,000+ every month</Txt>
        </LinearGradient>

        <View style={styles.grid}>
          {BENEFITS.map(b => (
            <Card key={b.title} style={styles.benefit}>
              <View style={styles.icon}>
                <b.icon size={20} color={colors.primary} />
              </View>
              <Txt variant="label" style={{ marginTop: 10 }}>
                {b.title}
              </Txt>
              <Txt variant="small" style={{ marginTop: 2 }}>
                {b.body}
              </Txt>
            </Card>
          ))}
        </View>

        <Txt variant="h3" style={styles.howTitle}>
          How it works
        </Txt>
        <Card padded={false}>
          {HOW.map((h, i) => (
            <View
              key={h.title}
              style={[styles.how, i < HOW.length - 1 && styles.howDivider]}
            >
              <View style={styles.howNum}>
                <Txt style={styles.howNumText}>{i + 1}</Txt>
              </View>
              <View style={styles.flex}>
                <Txt variant="label">{h.title}</Txt>
                <Txt variant="small">{h.body}</Txt>
              </View>
            </View>
          ))}
        </Card>

        <Card style={styles.req}>
          <IdCard size={22} color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <Txt variant="label">Requirements</Txt>
            <Txt variant="small">
              {womenOnly(config) ? 'Women only · ' : ''}18+, verified profile
              photo, and government ID for withdrawals.
            </Txt>
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: 22 },
  blocked: { textAlign: 'center', marginBottom: 10 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.75)',
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.white,
    marginTop: 6,
  },
  sub: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  benefit: { width: '48.4%' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFECF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  howTitle: { marginTop: 22, marginBottom: 10 },
  how: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'center' },
  howDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  howNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howNumText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  req: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
});
