import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  Camera,
  Check,
  CircleCheck,
  IdCard,
  ScanFace,
  ShieldCheck,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { HOSTS } from '../../data/mock';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Segmented from '../../components/Segmented';
import { Card } from '../../components/ListRow';

/* ---------- Blocked users ---------- */
export function BlockedUsersScreen() {
  const [list, setList] = useState(HOSTS.slice(5, 8));
  return (
    <Screen>
      <Header
        title="Blocked users"
        subtitle="They can’t see your profile or contact you"
      />
      <FlatList
        data={list}
        keyExtractor={u => u.id}
        ListEmptyComponent={
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={{ marginTop: 60 }}
          >
            You haven’t blocked anyone.
          </Txt>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Avatar uri={item.photo} size={50} />
            <View style={{ flex: 1 }}>
              <Txt variant="h3">{item.name}</Txt>
              <Txt variant="small">Blocked 3 days ago</Txt>
            </View>
            <Button
              title="Unblock"
              variant="secondary"
              size="sm"
              full={false}
              onPress={() => setList(l => l.filter(u => u.id !== item.id))}
            />
          </View>
        )}
      />
    </Screen>
  );
}

/* ---------- Followers / Following ---------- */
export function FollowersScreen({ route }) {
  const [tab, setTab] = useState(route.params?.tab || 'followers');
  const [following, setFollowing] = useState(['h1', 'h3']);
  const toggle = id =>
    setFollowing(f => (f.includes(id) ? f.filter(x => x !== id) : [...f, id]));
  const data =
    tab === 'followers' ? HOSTS : HOSTS.filter(h => following.includes(h.id));
  return (
    <Screen>
      <Header title="Connections" />
      <Segmented
        style={{ marginHorizontal: spacing.md, marginBottom: 8 }}
        value={tab}
        onChange={setTab}
        options={[
          { key: 'followers', label: 'Followers' },
          { key: 'following', label: 'Following' },
        ]}
      />
      <FlatList
        data={data}
        keyExtractor={u => u.id}
        renderItem={({ item }) => {
          const on = following.includes(item.id);
          return (
            <View style={styles.row}>
              <Avatar uri={item.photo} size={50} online={item.online} />
              <View style={{ flex: 1 }}>
                <Txt variant="h3">{item.name}</Txt>
                <Txt variant="small">
                  @{item.name.toLowerCase()}.{item.age}
                </Txt>
              </View>
              <Button
                title={on ? 'Following' : 'Follow'}
                variant={on ? 'secondary' : 'primary'}
                size="sm"
                full={false}
                onPress={() => toggle(item.id)}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}

/* ---------- Report user ---------- */
const REASONS = [
  'Fake profile / scam',
  'Inappropriate photos',
  'Harassment or bullying',
  'Underage user',
  'Spam or advertising',
  'Offensive behaviour on call',
  'Something else',
];

export function ReportScreen({ navigation, route }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.doneWrap}>
          <LinearGradient colors={colors.gradientSoft} style={styles.doneIcon}>
            <CircleCheck size={44} color={colors.success} />
          </LinearGradient>
          <Txt variant="h1" center>
            Thanks for reporting
          </Txt>
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={{ marginTop: 8 }}
          >
            Our safety team will review this within 24 hours.{' '}
            {route.params?.name} has been blocked and won’t be able to contact
            you.
          </Txt>
        </View>
        <View style={{ padding: spacing.md }}>
          <Button title="Done" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={{ padding: spacing.md }}>
          <Button
            title="Submit report"
            disabled={!reason}
            onPress={() => setDone(true)}
          />
        </View>
      }
    >
      <Header
        title={`Report ${route.params?.name || 'user'}`}
        subtitle="Your report is anonymous"
      />
      <View style={{ paddingHorizontal: spacing.md }}>
        <Txt variant="h3" style={{ marginBottom: 12 }}>
          Why are you reporting?
        </Txt>
        {REASONS.map(r => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            style={[styles.reason, reason === r && styles.reasonActive]}
          >
            <Txt variant="label" style={{ flex: 1 }}>
              {r}
            </Txt>
            <View style={[styles.radio, reason === r && styles.radioOn]}>
              {reason === r ? (
                <Check size={13} color={colors.white} strokeWidth={3} />
              ) : null}
            </View>
          </Pressable>
        ))}
        <Input
          label="Additional details (optional)"
          multiline
          value={details}
          onChangeText={setDetails}
          placeholder="Tell us what happened…"
          style={{ marginTop: 10 }}
        />
      </View>
    </Screen>
  );
}

/* ---------- Verification ---------- */
export function VerificationScreen({ navigation }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      icon: ScanFace,
      title: 'Take a selfie',
      body: 'Copy the pose shown on screen so we can match it with your photos.',
    },
    {
      icon: IdCard,
      title: 'Government ID (optional)',
      body: 'Hosts must verify with Aadhaar / PAN to enable withdrawals.',
    },
    {
      icon: ShieldCheck,
      title: 'Get your blue tick',
      body: 'Verified profiles get up to 2× more matches and calls.',
    },
  ];
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Profile verification" />
      <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
        <LinearGradient
          colors={['#1C1C1E', '#1C1C1E']}
          style={styles.verifyHero}
        >
          <View style={styles.selfieFrame}>
            <Camera size={40} color={colors.white} />
          </View>
          <Txt style={styles.verifyTitle}>Show everyone you’re real</Txt>
          <Txt style={styles.verifySub}>Takes less than a minute</Txt>
        </LinearGradient>
        {steps.map((s, i) => (
          <Card
            key={s.title}
            style={[
              styles.stepCard,
              i <= step && { borderColor: colors.primary },
            ]}
          >
            <View
              style={[
                styles.stepIcon,
                i < step && { backgroundColor: colors.success },
              ]}
            >
              {i < step ? (
                <Check size={18} color={colors.white} />
              ) : (
                <s.icon size={20} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="label">{s.title}</Txt>
              <Txt variant="small">{s.body}</Txt>
            </View>
          </Card>
        ))}
      </View>
      <View style={{ padding: spacing.md }}>
        <Button
          title={
            step >= 2 ? 'Done' : step === 0 ? 'Start verification' : 'Continue'
          }
          onPress={() => (step >= 2 ? navigation.goBack() : setStep(step + 1))}
        />
      </View>
    </Screen>
  );
}

/* ---------- Dynamic content pages (managed from admin panel) ---------- */
const CONTENT = {
  help: {
    title: 'Help & support',
    sections: [
      [
        'How do coins work?',
        'Coins are used for audio/video calls (charged per minute), sending gifts and unlocking premium features. Recharge any time from your wallet.',
      ],
      [
        'How do I become a host?',
        'Go to Profile → Become a host, complete verification and join an agency or apply directly. Hosts earn from calls, chats and gifts.',
      ],
      [
        'When are withdrawals processed?',
        'Withdrawals are processed within 24–48 hours to your bank account or UPI after admin approval.',
      ],
      [
        'Contact us',
        'Email support@rebu.app or call +91 76918 10506 (10 AM – 7 PM).',
      ],
    ],
  },
  terms: {
    title: 'Terms of service',
    sections: [
      ['1. Eligibility', 'You must be 18 years or older to use REBU.'],
      [
        '2. Your account',
        'You are responsible for activity on your account and for keeping your login secure.',
      ],
      [
        '3. Coins & payments',
        'Coins are non-refundable and have no cash value outside REBU, except host earnings withdrawn per the host policy.',
      ],
      [
        '4. Content',
        'You must not upload content that is illegal, explicit or infringes others’ rights.',
      ],
    ],
  },
  privacy: {
    title: 'Privacy policy',
    sections: [
      [
        'What we collect',
        'Profile details, photos, approximate location, and usage data to provide matching.',
      ],
      [
        'How we use it',
        'To show you relevant people nearby, keep REBU safe and improve the service.',
      ],
      [
        'Your controls',
        'Hide distance, go incognito, download or delete your data at any time.',
      ],
    ],
  },
  guidelines: {
    title: 'Community guidelines',
    sections: [
      [
        'Be respectful',
        'Harassment, hate speech and threats lead to a permanent ban.',
      ],
      ['Be real', 'Use your own recent photos. No impersonation.'],
      [
        'Keep it safe',
        'No nudity or sexual content on calls. Calls may be moderated.',
      ],
    ],
  },
  safety: {
    title: 'Safety tips',
    sections: [
      [
        'Protect your info',
        'Never share bank details, OTPs or your home address.',
      ],
      [
        'Meet in public',
        'For your first date, meet in a public place and tell a friend.',
      ],
      [
        'Report & block',
        'If something feels off, report and block from the profile or chat menu.',
      ],
    ],
  },
};

export function ContentScreen({ route }) {
  const page = CONTENT[route.params?.page] || CONTENT.help;
  return (
    <Screen scroll>
      <Header title={page.title} />
      <View style={{ paddingHorizontal: spacing.md, gap: 12 }}>
        {page.sections.map(([h, b]) => (
          <Card key={h}>
            <Txt variant="h3">{h}</Txt>
            <Txt
              variant="body"
              color={colors.textMuted}
              style={{ marginTop: 6 }}
            >
              {b}
            </Txt>
          </Card>
        ))}
        <Txt variant="tiny" center style={{ marginTop: 8 }}>
          Last updated 24 Oct 2026
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 10,
  },
  reasonActive: { borderColor: colors.primary, backgroundColor: '#FFF5F8' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  doneWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  doneIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  verifyHero: {
    alignItems: 'center',
    padding: 24,
    borderRadius: radius.xl,
    marginBottom: 16,
  },
  selfieFrame: {
    width: 110,
    height: 130,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.white,
    marginTop: 14,
  },
  verifySub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFECF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
