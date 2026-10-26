import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Clock, Flame, ReceiptText, ThumbsUp } from 'lucide-react-native';
import { colors, fonts, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Sheet from '../../components/Sheet';
import Button from '../../components/Button';
import RazorpayCheckout from '../../components/RazorpayCheckout';
import { CoinIcon } from '../../components/CoinPill';
import { TopBar } from '../../components/Live';
import { get, post } from '../../api/client';

// Pack art by position (the packs themselves come from the server / admin panel).
const ART = ['🪙', '💰', '🎁', '💎', '🏆', '👑'];
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
        <Txt style={styles.amountText}>{num(pack.total)}</Txt>
      </View>
      <Txt style={styles.extra}>
        {pack.extra ? `${pack.extra}% bonus` : ' '}
      </Txt>
      <Txt style={styles.art}>{pack.art}</Txt>
      <View style={styles.price}>
        <Txt style={styles.priceText}>₹{num(pack.price)}</Txt>
      </View>
    </Pressable>
  );
}

export default function CoinsScreen({ navigation, stack }) {
  const { user, setCoinsFromServer } = useApp();
  const [left, setLeft] = useState(FLASH_SECONDS);
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState(null); // { order, pack }
  const [result, setResult] = useState(null); // { kind, text }

  const load = useCallback(() => {
    get('/wallet/packs')
      .then(r => {
        setError('');
        setPacks(r.packs);
        setCoinsFromServer(r.balance);
      })
      .catch(e => setError(e.message));
    // setCoinsFromServer is recreated each render; loading once per focus is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(load);

  useEffect(() => {
    const t = setInterval(
      () => setLeft(s => (s > 0 ? s - 1 : FLASH_SECONDS)),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  const toCard = (p, i) => ({
    ...p,
    total: p.coins + (p.bonus || 0),
    extra: p.coins ? Math.round(((p.bonus || 0) / p.coins) * 100) : 0,
    art: ART[Math.min(i, ART.length - 1)],
  });
  const first = (packs || []).filter(p => p.firstRecharge).map(toCard);
  const regular = (packs || []).filter(p => !p.firstRecharge).map(toCard);

  const confirm = async (order, body, pack) => {
    setCheckout(null);
    setBusy(true);
    try {
      const r = await post(`/wallet/orders/${order.id}/confirm`, body);
      setCoinsFromServer(r.balance);
      if (r.order.status === 'success') {
        setResult({
          kind: 'success',
          text: `${num(pack.total)} coins have been added to your wallet.`,
        });
        load();
      } else {
        setResult({
          kind: 'failed',
          text: r.order.failureReason || 'Payment failed.',
        });
      }
    } catch (e) {
      setResult({ kind: 'failed', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const buy = async pack => {
    if (busy) return;
    setBusy(true);
    try {
      const { order } = await post('/wallet/orders', { packId: pack.id });
      if (order.checkout) {
        setBusy(false);
        setCheckout({ order, pack });
      } else {
        // Server without Razorpay keys: its mock gateway settles directly.
        await confirm(order, { result: 'success' }, pack);
      }
    } catch (e) {
      setBusy(false);
      setResult({ kind: 'failed', text: e.message });
    }
  };

  return (
    <Screen>
      {stack ? (
        <Header
          title="Recharge"
          right={
            <Pressable
              onPress={() => navigation.navigate('Transactions')}
              hitSlop={8}
            >
              <ReceiptText size={23} color={colors.ink} strokeWidth={1.9} />
            </Pressable>
          }
        />
      ) : (
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
      )}
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {!packs && !error ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : null}
        {error ? (
          <Txt
            variant="small"
            color={colors.danger}
            center
            style={styles.loading}
          >
            {error}
          </Txt>
        ) : null}

        {first.length ? (
          <>
            <View style={styles.head}>
              <Txt style={styles.title}>First recharge bonus 🎁</Txt>
              <View style={styles.headRight}>
                <Clock size={15} color={colors.textMuted} />
                <Txt variant="small">one time</Txt>
              </View>
            </View>
            <View style={styles.grid}>
              {first.map(p => (
                <Pack key={p.id} pack={p} onPress={() => buy(p)} />
              ))}
            </View>
          </>
        ) : null}

        {regular.length ? (
          <>
            <View style={styles.head}>
              <Txt style={styles.title}>⚡ Coin packs</Txt>
              <View style={styles.headRight}>
                <Clock size={15} color={colors.textMuted} />
                <Txt style={styles.timer}>{clock(left)}</Txt>
              </View>
            </View>
            <View style={styles.grid}>
              {regular.map(p => (
                <Pack key={p.id} pack={p} onPress={() => buy(p)} />
              ))}
            </View>
          </>
        ) : null}
        <Txt variant="tiny" center style={styles.note}>
          Coins are used for calls, messages and gifts. Prices include GST.
          Payments are processed securely by Razorpay.
        </Txt>
      </ScrollView>

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.white} size="large" />
        </View>
      ) : null}

      <RazorpayCheckout
        checkout={checkout?.order.checkout}
        prefill={{
          contact: user.phone ? `+91${user.phone}` : undefined,
          name: user.name,
        }}
        onDone={({ status, message }) => {
          const pack = checkout.pack;
          setCheckout(null);
          load(); // server already verified + credited; refresh balance
          setResult(
            status === 'success'
              ? {
                  kind: 'success',
                  text: `${num(
                    pack.total,
                  )} coins have been added to your wallet.`,
                }
              : { kind: 'failed', text: message || 'Payment failed.' },
          );
        }}
        onDismiss={() => setCheckout(null)}
      />

      <Sheet visible={!!result} onClose={() => setResult(null)}>
        <View style={styles.result}>
          <Txt style={styles.resultEmoji}>
            {result?.kind === 'success' ? '🎉' : '⚠️'}
          </Txt>
          <Txt variant="h2" center>
            {result?.kind === 'success'
              ? 'Payment successful'
              : 'Payment not completed'}
          </Txt>
          <Txt
            variant="body"
            center
            color={colors.textMuted}
            style={styles.resultText}
          >
            {result?.text}
          </Txt>
          <Button title="Done" onPress={() => setResult(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.md, paddingBottom: 32 },
  loading: { marginTop: 40 },
  busy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  result: { alignItems: 'center', gap: 6 },
  resultEmoji: { fontSize: 48, lineHeight: 58 },
  resultText: { marginBottom: 14 },
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
