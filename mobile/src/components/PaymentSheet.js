import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  Check,
  CircleX,
  CreditCard,
  FlaskConical,
  Hourglass,
  Landmark,
  Smartphone,
} from 'lucide-react-native';
import { colors, radius } from '../theme';
import Sheet from './Sheet';
import Txt from './Txt';
import Button from './Button';
import Segmented from './Segmented';

const METHODS = [
  { key: 'UPI', icon: Smartphone, sub: 'GPay, PhonePe, Paytm' },
  { key: 'Card', icon: CreditCard, sub: 'Debit or credit card' },
  { key: 'Netbanking', icon: Landmark, sub: 'All major banks' },
];

const RESULT = {
  success: {
    icon: Check,
    colors: ['#1E9E5A', '#1E9E5A'],
    title: 'Payment successful',
  },
  failed: {
    icon: CircleX,
    colors: ['#E5383B', '#E5383B'],
    title: 'Payment failed',
    body: 'No money was taken. If your account was debited, it will be refunded automatically within 5–7 working days.',
  },
  pending: {
    icon: Hourglass,
    colors: ['#F5B301', '#F5B301'],
    title: 'Payment pending',
    body: 'We’re confirming with your bank. Coins are added as soon as it’s confirmed — otherwise the amount is refunded within 5–7 working days.',
  },
};

/**
 * Checkout flow: choose method → processing → result.
 * Until a payment gateway is connected, the outcome is picked with the TEST switch.
 */
export default function PaymentSheet({
  visible,
  onClose,
  amount,
  description,
  successText,
  onResult,
}) {
  const [step, setStep] = useState('method');
  const [method, setMethod] = useState('UPI');
  const [testResult, setTestResult] = useState('success');

  useEffect(() => {
    if (visible) setStep('method');
  }, [visible]);

  useEffect(() => {
    if (step !== 'processing') return;
    const t = setTimeout(() => {
      onResult(testResult, method);
      setStep(testResult);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const result = RESULT[step];

  return (
    <Sheet
      visible={visible}
      onClose={step === 'processing' ? () => {} : onClose}
      title={step === 'method' ? `Pay ₹${amount}` : undefined}
    >
      {step === 'method' ? (
        <>
          <Txt variant="small" style={styles.desc}>
            {description}
          </Txt>
          {METHODS.map(m => (
            <Pressable
              key={m.key}
              onPress={() => setMethod(m.key)}
              style={[styles.method, method === m.key && styles.methodActive]}
            >
              <View style={styles.methodIcon}>
                <m.icon size={20} color={colors.secondary} />
              </View>
              <View style={styles.flex}>
                <Txt variant="label">{m.key}</Txt>
                <Txt variant="small">{m.sub}</Txt>
              </View>
              <View style={[styles.radio, method === m.key && styles.radioOn]}>
                {method === m.key ? (
                  <Check size={13} color={colors.white} strokeWidth={3} />
                ) : null}
              </View>
            </Pressable>
          ))}
          <View style={styles.test}>
            <View style={styles.testHead}>
              <FlaskConical size={14} color={colors.secondary} />
              <Txt variant="tiny" color={colors.secondary}>
                TEST MODE · choose the payment outcome
              </Txt>
            </View>
            <Segmented
              value={testResult}
              onChange={setTestResult}
              options={[
                { key: 'success', label: 'Success' },
                { key: 'failed', label: 'Fail' },
                { key: 'pending', label: 'Pending' },
              ]}
            />
          </View>
          <Button
            title={`Pay ₹${amount} with ${method}`}
            onPress={() => setStep('processing')}
          />
        </>
      ) : step === 'processing' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Txt variant="h3" style={styles.processing}>
            Processing payment…
          </Txt>
          <Txt variant="small" center>
            Don’t close the app or press back.
          </Txt>
        </View>
      ) : (
        <View style={styles.center}>
          <LinearGradient colors={result.colors} style={styles.resultIcon}>
            <result.icon size={34} color={colors.white} strokeWidth={2.6} />
          </LinearGradient>
          <Txt variant="h2" center>
            {result.title}
          </Txt>
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={styles.resultBody}
          >
            {step === 'success' ? successText : result.body}
          </Txt>
          {step === 'failed' ? (
            <>
              <Button title="Try again" onPress={() => setStep('method')} />
              <Button title="Close" variant="ghost" onPress={onClose} />
            </>
          ) : (
            <Button title="Done" onPress={onClose} />
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  desc: { marginTop: -8, marginBottom: 14 },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 8,
  },
  methodActive: { borderColor: colors.primary, backgroundColor: '#FFF5F8' },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0EAFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  test: {
    marginTop: 6,
    marginBottom: 14,
    padding: 10,
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CDBDFF',
    backgroundColor: '#F7F2FF',
  },
  testHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { alignItems: 'center', paddingVertical: 16, gap: 6 },
  processing: { marginTop: 14 },
  resultIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  resultBody: { marginBottom: 16 },
});
