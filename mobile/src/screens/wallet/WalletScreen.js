import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { CircleCheck, Crown } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { num } from '../../utils/format';
import { COIN_PACKS } from '../../data/mock';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import Segmented from '../../components/Segmented';
import PaymentSheet from '../../components/PaymentSheet';
import TransactionRow from '../../components/TransactionRow';
import { CoinIcon } from '../../components/CoinPill';
import { Card } from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';

const PLANS = [
  { key: 'week', label: '1 week', price: 199, per: '₹199/wk' },
  {
    key: 'month',
    label: '1 month',
    price: 499,
    per: '₹125/wk',
    tag: 'Most popular',
  },
  {
    key: 'quarter',
    label: '3 months',
    price: 999,
    per: '₹83/wk',
    tag: 'Save 33%',
  },
];
const PERKS = [
  'VIP badge on your profile and in calls',
  '10% off every video & voice call',
  '50 bonus coins every day',
  'Priority connection in Random match',
  '20 free messages to hosts every day',
];

export default function WalletScreen({ navigation, route }) {
  useSecureScreen();
  const { coins, addCoins, transactions, addTransaction } = useApp();
  const [tab, setTab] = useState(route.params?.tab || 'coins');
  const [pack, setPack] = useState('p2');
  const [plan, setPlan] = useState('month');
  const [checkout, setCheckout] = useState(false);
  const selected = COIN_PACKS.find(p => p.id === pack);
  const selectedPlan = PLANS.find(p => p.key === plan);
  const total = selected.coins + selected.bonus;
  const order =
    tab === 'coins'
      ? {
          amount: selected.price,
          title: `Recharge · ${num(selected.coins)}${
            selected.bonus ? ` + ${num(selected.bonus)}` : ''
          } coins`,
          description: `${num(total)} coins will be added to your wallet.`,
          successText: `${num(total)} coins have been added to your wallet.`,
        }
      : {
          amount: selectedPlan.price,
          title: `REBU VIP · ${selectedPlan.label}`,
          description: 'Unlock all VIP perks instantly.',
          successText: 'REBU VIP is now active.',
        };

  // Every attempt is recorded, including failed and pending ones.
  const onPaymentResult = (result, method) => {
    const sub = `${method} · ₹${num(order.amount)}`;
    if (result === 'success') {
      if (tab === 'coins') addCoins(total);
      addTransaction({
        type: 'recharge',
        title: order.title,
        sub,
        amount: tab === 'coins' ? total : 0,
      });
    } else if (result === 'failed') {
      addTransaction({
        type: 'recharge',
        title: order.title,
        sub,
        amount: 0,
        status: 'failed',
        note: 'Payment failed. Any amount debited is refunded in 5–7 working days.',
      });
    } else {
      addTransaction({
        type: 'recharge',
        title: order.title,
        sub,
        amount: 0,
        status: 'pending',
        note: 'Waiting for bank confirmation.',
      });
    }
  };

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            title={
              tab === 'coins'
                ? `Pay ₹${num(selected.price)}`
                : `Get VIP · ₹${num(selectedPlan.price)}`
            }
            onPress={() => setCheckout(true)}
            gradient={tab === 'premium' ? ['#F5B301', '#F5B301'] : undefined}
          />
          <Txt variant="tiny" center style={{ marginTop: 8 }}>
            Secure payment via UPI, cards & netbanking
          </Txt>
        </View>
      }
    >
      <Header
        title="Wallet"
        right={
          <Txt
            variant="label"
            color={colors.primary}
            onPress={() => navigation.navigate('HostDashboard')}
          >
            Earnings
          </Txt>
        }
      />

      <View style={{ paddingHorizontal: spacing.md }}>
        <LinearGradient
          colors={['#1C1C1E', '#1C1C1E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balance}
        >
          <Txt style={styles.balanceLabel}>Coin balance</Txt>
          <View style={styles.balanceRow}>
            <CoinIcon size={32} />
            <Txt style={styles.balanceAmount}>{num(coins)}</Txt>
          </View>
          <Txt style={styles.balanceSub}>
            ≈ {Math.floor(coins / 40)} min of video calls
          </Txt>
        </LinearGradient>

        <Segmented
          style={{ marginTop: 18 }}
          value={tab}
          onChange={setTab}
          options={[
            { key: 'coins', label: 'Recharge coins' },
            { key: 'premium', label: 'VIP' },
          ]}
        />

        {tab === 'coins' ? (
          <>
            <View style={styles.packs}>
              {COIN_PACKS.map((p, i) => {
                const active = p.id === pack;
                return (
                  <View key={p.id} style={styles.packCell}>
                    <Pressable
                      onPress={() => setPack(p.id)}
                      style={[styles.pack, active && styles.packActive]}
                    >
                      {p.tag ? (
                        <LinearGradient
                          colors={colors.gradient}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.packTag}
                        >
                          <Txt style={styles.packTagText}>{p.tag}</Txt>
                        </LinearGradient>
                      ) : null}
                      <CoinIcon size={30} />
                      <Txt style={styles.packCoins}>{num(p.coins)}</Txt>
                      {p.bonus ? (
                        <Txt style={styles.packBonus}>
                          +{num(p.bonus)} bonus
                        </Txt>
                      ) : (
                        <Txt style={styles.packBonus}> </Txt>
                      )}
                      <View
                        style={[
                          styles.price,
                          active && { backgroundColor: colors.primary },
                        ]}
                      >
                        <Txt
                          style={[
                            styles.priceText,
                            active && { color: colors.white },
                          ]}
                        >
                          ₹{num(p.price)}
                        </Txt>
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.sectionHead}>
              <Txt variant="h3">Recent transactions</Txt>
              <Txt
                variant="label"
                color={colors.primary}
                onPress={() => navigation.navigate('Transactions')}
              >
                See all
              </Txt>
            </View>
            <Card padded={false}>
              {transactions.slice(0, 5).map((t, i, arr) => (
                <TransactionRow key={t.id} tx={t} last={i === arr.length - 1} />
              ))}
              {transactions.length === 0 ? (
                <Txt variant="small" center style={styles.emptyTx}>
                  No transactions yet.
                </Txt>
              ) : null}
            </Card>
          </>
        ) : (
          <>
            <LinearGradient colors={['#FFF6DA', '#FFF6DA']} style={styles.gold}>
              <LinearGradient
                colors={colors.gradientGold}
                style={styles.goldIcon}
              >
                <Crown size={28} color={colors.white} />
              </LinearGradient>
              <Txt variant="h2" style={{ marginTop: 10 }}>
                REBU VIP
              </Txt>
              {PERKS.map(p => (
                <View key={p} style={styles.perk}>
                  <CircleCheck size={18} color={colors.warning} />
                  <Txt variant="bodyMedium">{p}</Txt>
                </View>
              ))}
            </LinearGradient>
            <View style={styles.plans}>
              {PLANS.map(p => {
                const active = p.key === plan;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPlan(p.key)}
                    style={[styles.plan, active && styles.planActive]}
                  >
                    {p.tag ? (
                      <Txt style={styles.planTag}>{p.tag}</Txt>
                    ) : (
                      <View style={{ height: 16 }} />
                    )}
                    <Txt variant="label">{p.label}</Txt>
                    <Txt style={styles.planPrice}>₹{num(p.price)}</Txt>
                    <Txt variant="tiny">{p.per}</Txt>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </View>

      <PaymentSheet
        visible={checkout}
        onClose={() => setCheckout(false)}
        amount={num(order.amount)}
        description={order.description}
        successText={order.successText}
        onResult={onPaymentResult}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  balance: { borderRadius: radius.xl, padding: 22 },
  balanceLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  balanceAmount: {
    fontFamily: fonts.extrabold,
    fontSize: 38,
    lineHeight: 46,
    color: colors.white,
    letterSpacing: -1,
  },
  balanceSub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  packs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  packCell: { width: '31.6%' },
  pack: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  packActive: { borderColor: colors.primary, backgroundColor: '#FFF5F8' },
  packTag: {
    position: 'absolute',
    top: -9,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  packTagText: { fontFamily: fonts.bold, fontSize: 9.5, color: colors.white },
  packCoins: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
    marginTop: 6,
  },
  packBonus: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.success,
  },
  price: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
  },
  priceText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  emptyTx: { padding: 16 },
  gold: {
    marginTop: 16,
    borderRadius: radius.xl,
    padding: 20,
    alignItems: 'flex-start',
  },
  goldIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  plans: { flexDirection: 'row', gap: 10, marginTop: 14 },
  plan: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  planActive: { borderColor: colors.warning, backgroundColor: '#FFF8E8' },
  planTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.warning,
    height: 16,
  },
  planPrice: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
