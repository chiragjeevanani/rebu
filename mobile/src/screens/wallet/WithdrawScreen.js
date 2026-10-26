// Host withdrawals: payout accounts (in the verified name), amount, fee,
// confirmation and the history of payouts with their status.
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  CircleCheck,
  Clock3,
  Landmark,
  Loader,
  Plus,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { ECONOMY, inr, timeLabel } from '../../data/economy';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Sheet from '../../components/Sheet';
import { Card } from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';

const STATUS = {
  requested: { label: 'Requested', color: colors.warning, icon: Clock3 },
  processing: { label: 'Processing', color: colors.secondary, icon: Loader },
  paid: { label: 'Paid', color: colors.success, icon: CircleCheck },
  rejected: { label: 'Rejected', color: colors.danger, icon: Clock3 },
};

const validUpi = v => /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(v);
const validIfsc = v => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);

function AddAccountSheet({ kind, holder, onClose, onSave }) {
  const [upi, setUpi] = useState('');
  const [acc, setAcc] = useState('');
  const [acc2, setAcc2] = useState('');
  const [ifsc, setIfsc] = useState('');
  const ok =
    kind === 'upi'
      ? validUpi(upi)
      : acc.length >= 9 && acc === acc2 && validIfsc(ifsc);

  return (
    <Sheet
      visible={!!kind}
      onClose={onClose}
      title={kind === 'upi' ? 'Add UPI ID' : 'Add bank account'}
    >
      <View style={styles.holder}>
        <ShieldCheck size={16} color={colors.success} />
        <Txt variant="small" style={styles.flex}>
          Must be in your verified name: <Txt variant="label">{holder}</Txt>
        </Txt>
      </View>
      {kind === 'upi' ? (
        <Input
          label="UPI ID"
          placeholder="name@bank"
          autoCapitalize="none"
          value={upi}
          onChangeText={v => setUpi(v.trim())}
          error={upi && !validUpi(upi) ? 'Enter a valid UPI ID' : null}
        />
      ) : (
        <>
          <Input
            label="Account number"
            keyboardType="number-pad"
            value={acc}
            onChangeText={v => setAcc(v.replace(/\D/g, ''))}
            maxLength={18}
          />
          <Input
            label="Re-enter account number"
            keyboardType="number-pad"
            value={acc2}
            onChangeText={v => setAcc2(v.replace(/\D/g, ''))}
            maxLength={18}
            style={styles.field}
            error={acc2 && acc !== acc2 ? 'Numbers don’t match' : null}
          />
          <Input
            label="IFSC code"
            placeholder="HDFC0001234"
            autoCapitalize="characters"
            value={ifsc}
            onChangeText={v => setIfsc(v.toUpperCase().trim())}
            maxLength={11}
            style={styles.field}
            error={
              ifsc.length === 11 && !validIfsc(ifsc) ? 'Invalid IFSC' : null
            }
          />
        </>
      )}
      <Button
        title="Save account"
        disabled={!ok}
        style={styles.field}
        onPress={() =>
          onSave(
            kind === 'upi'
              ? { kind, label: `UPI · ${upi}`, detail: 'Usually instant' }
              : {
                  kind,
                  label: `Bank ••${acc.slice(-4)}`,
                  detail: `IFSC ${ifsc}`,
                },
          )
        }
      />
    </Sheet>
  );
}

export default function WithdrawScreen({ navigation }) {
  useSecureScreen();
  const {
    user,
    hostApp,
    balance,
    withdrawals,
    payoutMethods,
    setPayoutMethods,
    requestWithdrawal,
  } = useApp();
  const available = Math.floor(balance.available);
  const [amount, setAmount] = useState(String(available));
  const [methodId, setMethodId] = useState(payoutMethods[0]?.id || null);
  const [adding, setAdding] = useState(null); // upi | bank
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(null);

  const holder = hostApp.data?.name || user.name;
  const n = Number(amount) || 0;
  const fee = Math.round((n * ECONOMY.withdrawFee) / 100);
  const method = payoutMethods.find(m => m.id === methodId);
  const error =
    n > available
      ? 'More than your available balance'
      : n && n < ECONOMY.minWithdraw
      ? `Minimum withdrawal is ${inr(ECONOMY.minWithdraw)}`
      : null;
  const valid = n >= ECONOMY.minWithdraw && n <= available && !!method;

  const saveAccount = m => {
    const acct = { id: `pm${Date.now()}`, holder, ...m };
    setPayoutMethods(list => [...list, acct]);
    setMethodId(acct.id);
    setAdding(null);
  };

  if (done) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.done}>
          <View style={styles.doneIcon}>
            <CircleCheck size={44} color={colors.white} />
          </View>
          <Txt variant="h1" center>
            Withdrawal requested
          </Txt>
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={styles.doneSub}
          >
            {inr(done.net)} will reach {done.method.label} within{' '}
            {ECONOMY.payoutTime}. Track it under Payout history.
          </Txt>
        </View>
        <View style={styles.pad}>
          <Button title="Done" onPress={() => setDone(null)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.pad}>
          <Button
            title={
              method
                ? `Withdraw ${inr(Math.max(0, n - fee))}`
                : 'Add a payout account first'
            }
            disabled={!valid}
            onPress={() => setConfirm(true)}
          />
        </View>
      }
    >
      <Header
        title="Withdraw"
        subtitle={`Available ${inr(balance.available)}`}
      />
      <View style={styles.body}>
        {/* Payout account */}
        <Txt variant="h3" style={styles.h}>
          Payout account
        </Txt>
        {payoutMethods.map(m => {
          const on = m.id === methodId;
          const Icon = m.kind === 'upi' ? Smartphone : Landmark;
          return (
            <Pressable
              key={m.id}
              style={[styles.method, on && styles.methodOn]}
              onPress={() => setMethodId(m.id)}
            >
              <View style={styles.methodIcon}>
                <Icon size={20} color={colors.ink} />
              </View>
              <View style={styles.flex}>
                <Txt variant="label">{m.label}</Txt>
                <Txt variant="small">
                  {m.holder} · {m.detail}
                </Txt>
              </View>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  setPayoutMethods(list => list.filter(x => x.id !== m.id));
                  if (on) setMethodId(null);
                }}
              >
                <Trash2 size={18} color={colors.textFaint} />
              </Pressable>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on ? <View style={styles.radioDot} /> : null}
              </View>
            </Pressable>
          );
        })}
        <View style={styles.addRow}>
          <Pressable style={styles.add} onPress={() => setAdding('upi')}>
            <Plus size={16} color={colors.ink} />
            <Txt variant="label">UPI ID</Txt>
          </Pressable>
          <Pressable style={styles.add} onPress={() => setAdding('bank')}>
            <Plus size={16} color={colors.ink} />
            <Txt variant="label">Bank account</Txt>
          </Pressable>
        </View>

        {/* Amount */}
        <Txt variant="h3" style={styles.h}>
          Amount
        </Txt>
        <Input
          keyboardType="number-pad"
          value={amount}
          onChangeText={t => setAmount(t.replace(/\D/g, ''))}
          prefix={<Txt style={styles.rupee}>₹</Txt>}
          inputStyle={styles.amountInput}
          error={error}
        />
        <View style={styles.quick}>
          {[500, 1000, 5000].map(v => (
            <Chip
              key={v}
              small
              label={inr(v)}
              selected={n === v}
              onPress={() => setAmount(String(v))}
            />
          ))}
          <Chip
            small
            label="All"
            selected={n === available && available > 0}
            onPress={() => setAmount(String(available))}
          />
        </View>
        <Card style={styles.summary}>
          <View style={styles.line}>
            <Txt variant="small">Withdrawal</Txt>
            <Txt variant="label">{inr(n)}</Txt>
          </View>
          <View style={styles.line}>
            <Txt variant="small">Fee ({ECONOMY.withdrawFee}%)</Txt>
            <Txt variant="label" color={colors.danger}>
              −{inr(fee)}
            </Txt>
          </View>
          <View style={[styles.line, styles.lineTotal]}>
            <Txt variant="label">You receive</Txt>
            <Txt variant="label" color={colors.success}>
              {inr(Math.max(0, n - fee))}
            </Txt>
          </View>
        </Card>
        <Txt variant="tiny" style={styles.note}>
          Minimum {inr(ECONOMY.minWithdraw)}. Paid within {ECONOMY.payoutTime}.
          Earnings under review can’t be withdrawn until they’re cleared.
        </Txt>

        {/* History */}
        <Txt variant="h3" style={styles.h}>
          Payout history
        </Txt>
        <Card padded={false}>
          {withdrawals.length === 0 ? (
            <Txt variant="small" center style={styles.empty}>
              No withdrawals yet.
            </Txt>
          ) : (
            withdrawals.map((w, i) => {
              const st = STATUS[w.status];
              return (
                <View
                  key={w.id}
                  style={[
                    styles.hist,
                    i < withdrawals.length - 1 && styles.divider,
                  ]}
                >
                  <View style={styles.flex}>
                    <Txt variant="label">{inr(w.net)}</Txt>
                    <Txt variant="small">
                      {w.method.label} · {timeLabel(w.ts)}
                    </Txt>
                  </View>
                  <View
                    style={[
                      styles.status,
                      { backgroundColor: `${st.color}18` },
                    ]}
                  >
                    <st.icon size={13} color={st.color} />
                    <Txt style={[styles.statusText, { color: st.color }]}>
                      {st.label}
                    </Txt>
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </View>

      <AddAccountSheet
        kind={adding}
        holder={holder}
        onClose={() => setAdding(null)}
        onSave={saveAccount}
      />

      <Sheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Confirm withdrawal"
      >
        <View style={styles.line}>
          <Txt variant="small">To</Txt>
          <Txt variant="label">{method?.label}</Txt>
        </View>
        <View style={styles.line}>
          <Txt variant="small">Amount</Txt>
          <Txt variant="label">{inr(n)}</Txt>
        </View>
        <View style={styles.line}>
          <Txt variant="small">Fee</Txt>
          <Txt variant="label">−{inr(fee)}</Txt>
        </View>
        <View style={[styles.line, styles.lineTotal]}>
          <Txt variant="label">You receive</Txt>
          <Txt variant="label" color={colors.success}>
            {inr(n - fee)}
          </Txt>
        </View>
        <Button
          title="Confirm"
          style={styles.field}
          onPress={() => {
            const w = requestWithdrawal(n, {
              id: method.id,
              label: method.label,
            });
            setConfirm(false);
            setAmount('');
            setDone(w);
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: spacing.md },
  body: { paddingHorizontal: spacing.md, paddingBottom: 16 },
  h: { marginTop: 18, marginBottom: 10 },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  methodOn: { borderColor: colors.ink },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
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
  radioOn: { borderColor: colors.ink },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  addRow: { flexDirection: 'row', gap: 10 },
  add: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  rupee: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink },
  amountInput: { fontFamily: fonts.extrabold, fontSize: 24 },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  summary: { marginTop: 14 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  lineTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 10,
  },
  note: { marginTop: 8 },
  empty: { padding: 20 },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
  },
  statusText: { fontFamily: fonts.bold, fontSize: 11.5 },
  holder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  field: { marginTop: 14 },
  done: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  doneIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  doneSub: { marginTop: 8 },
});
