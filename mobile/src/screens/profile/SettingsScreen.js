import React from 'react';
import { StyleSheet } from 'react-native';
import {
  Ban,
  Camera,
  FileText,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import ListRow, { Card } from '../../components/ListRow';
import { useApp } from '../../context/AppContext';

// "98765 43210" → "+91 98••• ••210"
const maskPhone = p => {
  const d = String(p || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 2)}••• ••${d.slice(7)}` : '';
};

export default function SettingsScreen({ navigation }) {
  const { user } = useApp();
  const phone = maskPhone(user?.phone);
  const email = user?.email || '';
  const account = [
    phone ? { icon: Smartphone, title: 'Phone number', value: phone } : null,
    email ? { icon: Mail, title: 'Email', value: email } : null,
    email
      ? {
          icon: Lock,
          title: 'Change password',
          onPress: () => navigation.navigate('ForgotPassword'),
        }
      : null,
  ].filter(Boolean);

  return (
    <Screen scroll>
      <Header title="Settings" />

      {account.length ? (
        <>
          <Txt variant="tiny" style={styles.group}>
            ACCOUNT
          </Txt>
          <Card padded={false} style={styles.card}>
            {account.map((row, i) => (
              <ListRow
                key={row.title}
                {...row}
                last={i === account.length - 1}
              />
            ))}
          </Card>
        </>
      ) : null}

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
