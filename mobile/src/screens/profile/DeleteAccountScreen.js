import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { TriangleAlert } from 'lucide-react-native';
import { colors, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Chip from '../../components/Chip';
import Input from '../../components/Input';
import { inr } from '../../data/economy';
import Button from '../../components/Button';

const REASONS = [
  'Found someone',
  'Not getting matches',
  'Too expensive',
  'Privacy concerns',
  'Taking a break',
  'Other',
];

export default function DeleteAccountScreen({ navigation }) {
  const { coins, isHost, balance, deleteAccount } = useApp();
  const [reason, setReason] = useState(null);
  const [confirm, setConfirm] = useState('');
  const ready = reason && confirm.trim().toUpperCase() === 'DELETE';

  const losses = [
    `Your ${num(coins)} coins will be lost. Coins can’t be refunded.`,
    'Your profile, photos, matches and chats are permanently deleted.',
    'Your call and transaction history is removed.',
  ];
  if (isHost) {
    losses.push(
      `Withdraw your ${inr(
        balance.available,
      )} host balance first — it can’t be paid out after deletion.`,
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            title="Delete my account permanently"
            variant="danger"
            disabled={!ready}
            onPress={() =>
              deleteAccount().catch(e =>
                Alert.alert('Couldn’t delete account', e.message),
              )
            }
          />
          <Button
            title="Keep my account"
            variant="ghost"
            onPress={() => navigation.goBack()}
          />
        </View>
      }
    >
      <Header title="Delete account" />
      <View style={styles.body}>
        <View style={styles.warning}>
          <TriangleAlert size={20} color={colors.danger} />
          <Txt variant="label" color={colors.danger} style={styles.flex}>
            This can’t be undone
          </Txt>
        </View>
        {losses.map(l => (
          <View key={l} style={styles.loss}>
            <View style={styles.bullet} />
            <Txt variant="body" style={styles.flex}>
              {l}
            </Txt>
          </View>
        ))}

        <Txt variant="h3" style={styles.section}>
          Why are you leaving?
        </Txt>
        <View style={styles.reasons}>
          {REASONS.map(r => (
            <Chip
              key={r}
              small
              label={r}
              selected={reason === r}
              onPress={() => setReason(r)}
            />
          ))}
        </View>

        <Input
          label="Type DELETE to confirm"
          placeholder="DELETE"
          autoCapitalize="characters"
          value={confirm}
          onChangeText={setConfirm}
          style={styles.section}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.md },
  flex: { flex: 1 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: '#FFE8EC',
    marginBottom: 12,
  },
  loss: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
    marginTop: 9,
  },
  section: { marginTop: 22 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  footer: { paddingHorizontal: spacing.md, paddingTop: 10 },
});
