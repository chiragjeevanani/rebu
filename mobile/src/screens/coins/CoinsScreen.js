import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Clock, Flame, ReceiptText, ThumbsUp } from 'lucide-react-native';
import { colors, fonts, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Txt from '../../components/Txt';
import PaymentSheet from '../../components/PaymentSheet';
import { CoinIcon } from '../../components/CoinPill';
import { TopBar } from '../../components/Live';

// Starter packs: big bonus on the first purchase of each.
const STARTER = [
  { id: 's1', coins: 100, extra: 100, price: 59, art: '🪙' },
  {
    id: 's2',
    coins: 250,
    extra: 150,
    price: 119,
    art: '💰',
    tag: 'Best value',
  },
  { id: 's3', coins: 450, extra: 125, price: 239, art: '🎁' },
  { id: 's4', coins: 1100, extra: 125, price: 589, art: '💎' },
  { id: 's5', coins: 2500, extra: 150, price: 1169, art: '🏆', tag: 'Popular' },
  { id: 's6', coins: 3000, extra: 100, price: 1749, art: '👑' },
];
const FLASH = [
  { id: 'f1', coins: 550, extra: 175, price: 220, art: '🪙' },
  {
    id: 'f2',
    coins: 1400,
    extra: 180,
    price: 550,
    art: '💰',
    tag: 'Best value',
  },
  { id: 'f3', coins: 2800, extra: 180, price: 1100, art: '🏆', tag: 'Hot' },
];
const FLASH_SECONDS = 9 * 60 + 59;

const clock = s =>
  [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':');

function Pack({ pack, onPress }) {
  return (
    <Pressable style={styles.pack} onPress={onPress}>
      {pack.tag ? (
        <View
          style={[
            styles.tag,
            pack.tag === 'Best value' ? styles.tagGold : styles.tagRed,
          ]}
        >
          {pack.tag === 'Best value' ? (
            <ThumbsUp size={11} color={colors.ink} />
          ) : (
            <Flame size={11} color={colors.white} />
          )}
          <Txt
            style={[
              styles.tagText,
              pack.tag !== 'Best value' && styles.tagTextLight,
            ]}
          >
            {pack.tag}
          </Txt>
        </View>
      ) : null}
      <View style={styles.amount}>
        <CoinIcon size={20} />
        <Txt style={styles.amountText}>{num(pack.coins)}</Txt>
      </View>
      <Txt style={styles.extra}>{pack.extra}% more</Txt>
      <Txt style={styles.art}>{pack.art}</Txt>
      <View style={styles.price}>
        <Txt style={styles.priceText}>₹{num(pack.price)}</Txt>
      </View>
    </Pressable>
  );
}

export default function CoinsScreen({ navigation }) {
  const { addCoins, addTransaction } = useApp();
  const [left, setLeft] = useState(FLASH_SECONDS);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    const t = setInterval(
      () => setLeft(s => (s > 0 ? s - 1 : FLASH_SECONDS)),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  const total = order ? Math.round(order.coins * (1 + order.extra / 100)) : 0;
  const onResult = (result, method) => {
    const title = `Recharge · ${num(total)} coins`;
    const sub = `${method} · ₹${num(order.price)}`;
    if (result === 'success') {
      addCoins(total);
      addTransaction({ type: 'recharge', title, sub, amount: total });
    } else {
      addTransaction({
        type: 'recharge',
        title,
        sub,
        amount: 0,
        status: result,
        note:
          result === 'failed'
            ? 'Payment failed. Any amount debited is refunded in 5–7 working days.'
            : 'Waiting for bank confirmation.',
      });
    }
  };

  return (
    <Screen>
      <TopBar
        right={
          <Pressable
            onPress={() => navigation.navigate('Transactions')}
            hitSlop={8}
          >
            <ReceiptText size={25} color={colors.ink} strokeWidth={1.9} />
          </Pressable>
        }
      />
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Txt style={styles.title}>First recharge bonus 🎁</Txt>
          <View style={styles.headRight}>
            <Clock size={15} color={colors.textMuted} />
            <Txt variant="small">once each</Txt>
          </View>
        </View>
        <View style={styles.grid}>
          {STARTER.map(p => (
            <Pack key={p.id} pack={p} onPress={() => setOrder(p)} />
          ))}
        </View>

        <View style={styles.head}>
          <Txt style={styles.title}>⚡ Flash deal</Txt>
          <View style={styles.headRight}>
            <Clock size={15} color={colors.textMuted} />
            <Txt style={styles.timer}>{clock(left)}</Txt>
          </View>
        </View>
        <View style={styles.grid}>
          {FLASH.map(p => (
            <Pack key={p.id} pack={p} onPress={() => setOrder(p)} />
          ))}
        </View>
        <Txt variant="tiny" center style={styles.note}>
          Coins are used for calls, messages and gifts. Prices include GST.
        </Txt>
      </ScrollView>

      <PaymentSheet
        visible={!!order}
        onClose={() => setOrder(null)}
        amount={order ? num(order.price) : ''}
        description={
          order ? `${num(total)} coins (incl. ${order.extra}% bonus)` : ''
        }
        successText={
          order ? `${num(total)} coins have been added to your wallet.` : ''
        }
        onResult={onResult}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.md, paddingBottom: 32 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 14,
  },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  timer: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pack: {
    width: '31.5%',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tag: {
    position: 'absolute',
    top: -10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 20,
    borderRadius: 6,
  },
  tagGold: { backgroundColor: '#FFD54F' },
  tagRed: { backgroundColor: colors.primary },
  tagText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.ink },
  tagTextLight: { color: colors.white },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  amountText: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  extra: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: colors.text,
    marginTop: 2,
  },
  art: { fontSize: 46, lineHeight: 58, marginVertical: 8 },
  price: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFF6DA',
  },
  priceText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  note: { marginTop: 18 },
});
