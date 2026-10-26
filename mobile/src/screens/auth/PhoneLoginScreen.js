import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { ChevronDown, FlaskConical, ShieldCheck } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { DEMO_ACCOUNT } from '../../data/mock';
import { post } from '../../api/client';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Button from '../../components/Button';

export default function PhoneLoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    const digits = phone.replace(/[^0-9]/g, '');
    setSending(true);
    setError('');
    try {
      const r = await post('/auth/otp/send', { phone: digits });
      navigation.navigate('Otp', {
        phone: digits,
        devCode: r.devCode,
        resendAfter: r.resendAfter,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };
  const valid = phone.replace(/\D/g, '').length === 10;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header />
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Txt variant="h1">What’s your number?</Txt>
        <Txt variant="body" color={colors.textMuted} style={styles.sub}>
          We’ll send you a 6-digit code to verify it’s really you.
        </Txt>

        <Input
          autoFocus
          keyboardType="phone-pad"
          maxLength={10}
          placeholder="98765 43210"
          value={phone}
          onChangeText={setPhone}
          prefix={
            <View style={styles.cc}>
              <Txt style={styles.flag}>🇮🇳</Txt>
              <Txt style={styles.code}>+91</Txt>
              <ChevronDown size={16} color={colors.textMuted} />
              <View style={styles.sep} />
            </View>
          }
          inputStyle={styles.phoneInput}
        />

        <View style={styles.note}>
          <ShieldCheck size={16} color={colors.success} />
          <Txt variant="small" style={{ flex: 1 }}>
            Your number is never shown on your profile.
          </Txt>
        </View>

        <Pressable
          style={({ pressed }) => [styles.demo, pressed && { opacity: 0.7 }]}
          onPress={() => setPhone(DEMO_ACCOUNT.phone)}
        >
          <View style={styles.demoIcon}>
            <FlaskConical size={18} color={colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="label">Demo login</Txt>
            <Txt variant="small">
              +91 {DEMO_ACCOUNT.phone} · OTP {DEMO_ACCOUNT.otp}
            </Txt>
          </View>
          <Txt variant="label" color={colors.primary}>
            Use
          </Txt>
        </Pressable>

        {error ? (
          <Txt variant="small" color={colors.danger} style={styles.sub}>
            {error}
          </Txt>
        ) : null}
        <View style={{ flex: 1 }} />
        <Button
          title="Send OTP"
          disabled={!valid}
          loading={sending}
          onPress={send}
        />
        <Button
          title="Continue with email"
          variant="ghost"
          onPress={() => navigation.navigate('EmailAuth')}
          style={{ marginTop: 6 }}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  sub: { marginTop: 8, marginBottom: 28 },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flag: { fontSize: 18 },
  code: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  sep: {
    width: 1,
    height: 24,
    backgroundColor: colors.borderStrong,
    marginLeft: 8,
  },
  phoneInput: { fontFamily: fonts.bold, fontSize: 18, letterSpacing: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  demo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: '#F7F2FF',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CDBDFF',
  },
  demoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
