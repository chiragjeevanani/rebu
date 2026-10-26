import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  Ban,
  Bell,
  Camera,
  Eye,
  EyeOff,
  FileText,
  Globe,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  Trash2,
  Video,
} from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import ListRow, { Card } from '../../components/ListRow';

export default function SettingsScreen({ navigation }) {
  const [s, setS] = useState({
    showDistance: true,
    showOnline: true,
    incognito: false,
    readReceipts: true,
    allowCalls: true,
    pushMatches: true,
    pushMessages: true,
    pushLikes: true,
    pushPromos: false,
  });
  const t = k => ({
    toggle: s[k],
    onToggle: v => setS(p => ({ ...p, [k]: v })),
  });

  return (
    <Screen scroll>
      <Header title="Settings" />

      <Txt variant="tiny" style={styles.group}>
        ACCOUNT
      </Txt>
      <Card padded={false} style={styles.card}>
        <ListRow
          icon={Smartphone}
          title="Phone number"
          value="+91 98••• ••210"
          onPress={() => {}}
        />
        <ListRow icon={Mail} title="Email" value="arjun@…" onPress={() => {}} />
        <ListRow
          icon={Lock}
          title="Change password"
          onPress={() => navigation.navigate('ForgotPassword')}
        />
        <ListRow
          icon={Globe}
          title="Language"
          value="English"
          onPress={() => {}}
          last
        />
      </Card>

      <Txt variant="tiny" style={styles.group}>
        PRIVACY
      </Txt>
      <Card padded={false} style={styles.card}>
        <ListRow
          icon={MapPin}
          title="Show my distance"
          {...t('showDistance')}
        />
        <ListRow icon={Eye} title="Show online status" {...t('showOnline')} />
        <ListRow
          icon={EyeOff}
          title="Incognito mode"
          subtitle="Only people you like can see you"
          {...t('incognito')}
        />
        <ListRow
          icon={MessageCircle}
          title="Read receipts"
          {...t('readReceipts')}
        />
        <ListRow
          icon={Video}
          title="Allow calls from matches"
          {...t('allowCalls')}
          last
        />
      </Card>

      <Txt variant="tiny" style={styles.group}>
        SAFETY
      </Txt>
      <Card padded={false} style={styles.card}>
        <ListRow
          icon={Camera}
          title="Screenshots blocked"
          subtitle="Chats, calls, live rooms and your wallet can’t be captured or recorded"
        />
        <ListRow
          icon={ShieldCheck}
          title="Verify your profile"
          onPress={() => navigation.navigate('Verification')}
        />
        <ListRow
          icon={Ban}
          title="Blocked users"
          onPress={() => navigation.navigate('BlockedUsers')}
        />
        <ListRow
          icon={FileText}
          title="Safety tips"
          onPress={() => navigation.navigate('Content', { page: 'safety' })}
          last
        />
      </Card>

      <Txt variant="tiny" style={styles.group}>
        NOTIFICATIONS
      </Txt>
      <Card padded={false} style={styles.card}>
        <ListRow icon={Bell} title="New matches" {...t('pushMatches')} />
        <ListRow icon={MessageCircle} title="Messages" {...t('pushMessages')} />
        <ListRow icon={Phone} title="Likes & super likes" {...t('pushLikes')} />
        <ListRow
          icon={Bell}
          title="Offers & announcements"
          {...t('pushPromos')}
          last
        />
      </Card>

      <Txt variant="tiny" style={styles.group}>
        LEGAL
      </Txt>
      <Card padded={false} style={styles.card}>
        <ListRow
          icon={FileText}
          title="Terms of service"
          onPress={() => navigation.navigate('Content', { page: 'terms' })}
        />
        <ListRow
          icon={FileText}
          title="Privacy policy"
          onPress={() => navigation.navigate('Content', { page: 'privacy' })}
        />
        <ListRow
          icon={FileText}
          title="Community guidelines"
          onPress={() => navigation.navigate('Content', { page: 'guidelines' })}
          last
        />
      </Card>

      <Card padded={false} style={[styles.card, { marginTop: 20 }]}>
        <ListRow
          icon={Trash2}
          title="Delete account"
          danger
          onPress={() => navigation.navigate('DeleteAccount')}
          last
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    marginHorizontal: spacing.md + 4,
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 1.2,
    color: colors.textFaint,
  },
  card: { marginHorizontal: spacing.md },
});
