import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { KeyRound, Mail, MailCheck } from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Button from '../../components/Button';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const Icon = sent ? MailCheck : KeyRound;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header />
      <View style={styles.body}>
        <LinearGradient colors={colors.gradientSoft} style={styles.icon}>
          <Icon size={34} color={colors.primary} />
        </LinearGradient>
        <Txt variant="h1" center>
          {sent ? 'Check your inbox' : 'Forgot password?'}
        </Txt>
        <Txt
          variant="body"
          color={colors.textMuted}
          center
          style={{ marginTop: 8, marginBottom: 28 }}
        >
          {sent
            ? `We sent a reset link to ${
                email || 'your email'
              }. It expires in 30 minutes.`
            : 'Enter the email linked to your account and we’ll send you a reset link.'}
        </Txt>
        {!sent ? (
          <Input
            icon={Mail}
            placeholder="Email address"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        ) : null}
        <View style={{ flex: 1 }} />
        <Button
          title={sent ? 'Back to log in' : 'Send reset link'}
          onPress={() => (sent ? navigation.goBack() : setSent(true))}
        />
        <Button
          title="Recover with phone number"
          variant="ghost"
          onPress={() => navigation.navigate('PhoneLogin')}
          style={{ marginTop: 6 }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  icon: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
});
