import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import { useApp } from '../../context/AppContext';
import { DEMO_ACCOUNT, MOCK_OTP } from '../../data/mock';

const LEN = 6;

export default function OtpScreen({ navigation, route }) {
  const phone = route.params?.phone || '';
  const [code, setCode] = useState('');
  const [timer, setTimer] = useState(30);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const { signIn, completeProfile } = useApp();

  const verify = value => {
    if (value !== MOCK_OTP) {
      setError(`Incorrect code. For testing use ${MOCK_OTP}.`);
      return;
    }
    Keyboard.dismiss();
    if (phone === DEMO_ACCOUNT.phone) {
      // Existing account: skip onboarding and land in the app.
      completeProfile();
      signIn();
    } else {
      navigation.navigate('ProfileSetup');
    }
  };

  const onChange = t => {
    const next = t.replace(/\D/g, '').slice(0, LEN);
    setCode(next);
    setError('');
    if (next.length === LEN) verify(next);
  };

  useEffect(() => {
    if (timer <= 0) return;
    const t = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [timer]);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header />
      <View style={styles.body}>
        <Txt variant="h1">Enter the code</Txt>
        <Txt
          variant="body"
          color={colors.textMuted}
          style={{ marginTop: 8, marginBottom: 32 }}
        >
          Sent to{' '}
          <Txt variant="bodyMedium" color={colors.ink}>
            +91 {phone}
          </Txt>
          {'  '}
          <Txt
            variant="bodyMedium"
            color={colors.primary}
            onPress={() => navigation.goBack()}
          >
            Edit
          </Txt>
        </Txt>

        <Pressable
          style={styles.boxes}
          onPress={() => inputRef.current?.focus()}
        >
          {Array.from({ length: LEN }).map((_, i) => {
            const active = i === code.length;
            return (
              <View
                key={i}
                style={[
                  styles.box,
                  code[i] && styles.filled,
                  active && styles.active,
                  error && styles.boxError,
                ]}
              >
                <Txt style={styles.digit}>{code[i] || ''}</Txt>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={inputRef}
          autoFocus
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          style={styles.hidden}
        />

        {error ? (
          <Txt
            variant="small"
            color={colors.danger}
            center
            style={styles.error}
          >
            {error}
          </Txt>
        ) : (
          <Txt variant="small" center style={styles.error}>
            Test code: <Txt variant="label">{MOCK_OTP}</Txt>
          </Txt>
        )}

        <View style={styles.resend}>
          {timer > 0 ? (
            <Txt variant="small">
              Resend code in{' '}
              <Txt variant="small" color={colors.ink}>
                0:{String(timer).padStart(2, '0')}
              </Txt>
            </Txt>
          ) : (
            <Txt
              variant="label"
              color={colors.primary}
              onPress={() => setTimer(30)}
            >
              Resend code
            </Txt>
          )}
        </View>

        <View style={{ flex: 1 }} />
        <Button
          title="Verify & Continue"
          disabled={code.length < LEN}
          onPress={() => verify(code)}
        />
      </View>
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
  boxes: { flexDirection: 'row', justifyContent: 'space-between' },
  box: {
    width: 50,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { borderColor: colors.secondary, backgroundColor: '#F7F2FF' },
  active: { borderColor: colors.primary, borderWidth: 2 },
  boxError: { borderColor: colors.danger, backgroundColor: '#FFF1F3' },
  error: { marginTop: 16 },
  digit: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { marginTop: 12, alignItems: 'center' },
});
