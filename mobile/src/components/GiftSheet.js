import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { colors, fonts, radius } from '../theme';
import { GIFTS } from '../data/mock';
import { useApp } from '../context/AppContext';
import Sheet from './Sheet';
import Txt from './Txt';
import Button from './Button';
import CoinPill, { CoinIcon } from './CoinPill';
import { BIG_GIFT_COINS, useGiftFx } from './GiftFx';
import { post } from '../api/client';

/** − / + for the quantity; hold a button to keep counting. */
function Stepper({ value, onChange, max, dark }) {
  const timers = useRef({});
  const latest = useRef(value);
  latest.current = value;
  const stop = () => {
    clearTimeout(timers.current.wait);
    clearInterval(timers.current.run);
  };
  useEffect(() => stop, []);
  const bump = d => onChange(v => Math.min(max, Math.max(1, v + d)));
  const hold = d => {
    bump(d);
    stop();
    timers.current.wait = setTimeout(() => {
      timers.current.run = setInterval(() => {
        // Reached an end: nothing more to count.
        if ((d > 0 && latest.current >= max) || (d < 0 && latest.current <= 1))
          stop();
        else bump(d);
      }, 90);
    }, 350);
  };
  const tone = dark ? colors.white : colors.ink;
  // A plain function (not a component defined here) so the buttons keep their
  // identity between renders and a held press isn't torn down mid-hold.
  const button = (Icon, d, off) => (
    <Pressable
      onPressIn={() => hold(d)}
      onPressOut={stop}
      disabled={off}
      hitSlop={6}
      style={[
        styles.stepBtn,
        dark && styles.stepBtnDark,
        off && styles.stepOff,
      ]}
    >
      <Icon size={18} color={tone} />
    </Pressable>
  );
  return (
    <View style={styles.stepper}>
      {button(Minus, -1, value <= 1)}
      <Txt style={[styles.qty, { color: tone }]}>{value}</Txt>
      {button(Plus, 1, value >= max)}
    </View>
  );
}

export default function GiftSheet({
  visible,
  onClose,
  onSend,
  onRecharge,
  dark = true,
  to, // recipient name shown in the premium-gift animation
  toId, // recipient host id → the server charges and credits the host
  context, // { type: 'call'|'live'|'chat', id }
}) {
  const { coins, setCoinsFromServer, config } = useApp();
  // Admin-edited catalog from the server; the bundled list is only a fallback.
  const gifts = config?.gifts?.length ? config.gifts : GIFTS;
  const fx = useGiftFx();
  const [selected, setSelected] = useState('rose');
  // How many of the selected gift (one gift type per send).
  const [qty, setQty] = useState(1);
  // The limit comes from the admin panel. A server that doesn't send one can't
  // do bulk sends, and an admin can switch it off with 1: no stepper either way.
  const limit = config?.economy?.maxGiftQuantity;
  const max = Number.isFinite(limit) ? Math.max(1, limit) : 1;
  const multi = max > 1;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const gift = gifts.find(g => g.key === selected) || gifts[0];
  const total = gift.coins * qty;
  const enough = coins >= total;
  const sent = { ...gift, count: qty };

  const pick = key => {
    // A new gift type starts again at 1, so 10 roses can't turn into 10 rockets.
    if (key !== selected) setQty(1);
    setSelected(key);
  };

  const done = () => {
    onSend?.(sent);
    onClose();
    fx.play(sent, { to });
    setQty(1);
  };

  const send = async () => {
    if (!enough) return onRecharge?.();
    setError('');
    if (toId) {
      setSending(true);
      try {
        const r = await post('/gifts', {
          toId,
          giftKey: gift.key,
          quantity: qty,
          context: context || { type: 'chat' },
        });
        setCoinsFromServer(r.balance);
        // An older server would ignore quantity and charge for one.
        if (qty > 1 && r.quantity !== qty) {
          setError('Update needed: this server can’t send several at once.');
          return;
        }
        done();
      } catch (e) {
        if (e.code === 'insufficient_coins') onRecharge?.();
        else setError(e.message);
      } finally {
        setSending(false);
      }
      return;
    }
    setError('Pick who to send it to.');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Send a gift"
      dark={dark}
      right={<CoinPill amount={coins} onPress={onRecharge} light={!dark} />}
    >
      <View style={styles.grid}>
        {gifts.map(g => {
          const active = g.key === selected;
          return (
            <Pressable
              key={g.key}
              onPress={() => pick(g.key)}
              style={[
                styles.item,
                dark && styles.itemDark,
                active && styles.itemActive,
              ]}
            >
              {g.coins >= BIG_GIFT_COINS ? (
                <View style={styles.fxTag}>
                  <Txt style={styles.fxTagText}>FX</Txt>
                </View>
              ) : null}
              <Txt style={styles.emoji}>{g.emoji}</Txt>
              <Txt
                style={[
                  styles.name,
                  { color: dark ? colors.white : colors.ink },
                ]}
                numberOfLines={1}
              >
                {g.name}
              </Txt>
              <View style={styles.price}>
                <CoinIcon size={12} />
                <Txt style={styles.coins}>{g.coins}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
      {multi ? (
        <View style={styles.qtyRow}>
          <View style={styles.qtyText}>
            <Txt
              style={[
                styles.qtyLabel,
                { color: dark ? colors.white : colors.ink },
              ]}
            >
              Quantity
            </Txt>
            <Txt
              variant="tiny"
              color={dark ? 'rgba(255,255,255,0.6)' : colors.textMuted}
            >
              One gift at a time · up to {max}
            </Txt>
          </View>
          <Stepper value={qty} onChange={setQty} max={max} dark={dark} />
        </View>
      ) : null}
      <Button
        title={
          enough
            ? `Send ${qty > 1 ? `${qty} × ` : ''}${gift.name} · ${total} coins`
            : 'Not enough coins · Recharge'
        }
        onPress={send}
        loading={sending}
        style={{ marginTop: 12 }}
      />
      {error ? (
        <Txt variant="small" center color={colors.danger} style={styles.error}>
          {error}
        </Txt>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  qtyText: { flex: 1 },
  qtyLabel: { fontFamily: fonts.semibold, fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  stepBtnDark: { backgroundColor: 'rgba(255,255,255,0.12)' },
  stepOff: { opacity: 0.35 },
  qty: {
    minWidth: 46,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 20,
  },
  fxTag: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 5,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  fxTagText: { fontFamily: fonts.bold, fontSize: 9, color: colors.white },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: {
    width: '22.6%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  itemDark: { backgroundColor: 'rgba(255,255,255,0.06)' },
  itemActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(255,61,119,0.14)',
  },
  emoji: { fontSize: 30, lineHeight: 38 },
  name: { fontFamily: fonts.semibold, fontSize: 11.5, marginTop: 2 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  coins: { fontFamily: fonts.bold, fontSize: 11, color: colors.coin },
});
