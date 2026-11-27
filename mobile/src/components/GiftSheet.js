import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors, fonts, radius } from '../theme';
import { GIFTS } from '../data/mock';
import { useApp } from '../context/AppContext';
import Sheet from './Sheet';
import Txt from './Txt';
import Button from './Button';
import CoinPill, { CoinIcon } from './CoinPill';
import { BIG_GIFT_COINS, useGiftFx, warmGift } from './GiftFx';
import GiftArt from './GiftArt';

// Gift panel tabs, in this order (a gift's category is its tab).
const TAB_ORDER = ['Popular', 'Love', 'Premium', 'Luxury', 'Royal', 'Festival'];
const QUICK = [1, 10, 50, 100];
import { post } from '../api/client';

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
  const tabs = useMemo(() => {
    const have = [...new Set(gifts.map(g => g.category).filter(Boolean))];
    return [...TAB_ORDER.filter(t => have.includes(t)), ...have.filter(t => !TAB_ORDER.includes(t))];
  }, [gifts]);
  const [tab, setTab] = useState(null);
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const shown = tabs.length ? gifts.filter(g => g.category === activeTab) : gifts;
  const [selected, setSelected] = useState(gifts[0]?.key || 'rose');
  // How many of the selected gift (one gift type per send).
  const [qty, setQty] = useState(1);
  // The limit comes from the admin panel. A server that doesn't send one can't
  // do bulk sends, and an admin can switch it off with 1: no stepper either way.
  const limit = config?.economy?.maxGiftQuantity;
  const max = Number.isFinite(limit) ? Math.max(1, limit) : 1;
  const quick = QUICK.filter(n => n <= max);
  const multi = quick.length > 1;
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
  // Download the chosen gift's animation now, so it plays the moment it's sent.
  useEffect(() => {
    if (visible) warmGift(gift?.lottie || gift?.animation, gift?.key);
  }, [visible, gift?.lottie, gift?.animation, gift?.key]);

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
      {tabs.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map(t => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, t === activeTab && styles.tabOn]}>
              <Txt style={[styles.tabText, { color: t === activeTab ? colors.white : dark ? 'rgba(255,255,255,0.7)' : colors.textMuted }]}>{t}</Txt>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
        {shown.map(g => {
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
              {(g.fullScreen ?? g.coins >= BIG_GIFT_COINS) ? (
                <View style={styles.fxTag}>
                  <Txt style={styles.fxTagText}>FX</Txt>
                </View>
              ) : null}
              <GiftArt gift={g} size={52} />
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
      </ScrollView>
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
              Send several of the same gift at once
            </Txt>
          </View>
          <View style={styles.quick}>
            {quick.map(n => (
              <Pressable key={n} onPress={() => setQty(n)} style={[styles.qBtn, dark && styles.qBtnDark, qty === n && styles.qOn]}>
                <Txt style={[styles.qText, { color: qty === n ? colors.white : dark ? colors.white : colors.ink }]}>×{n}</Txt>
              </Pressable>
            ))}
          </View>
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
  quick: { flexDirection: 'row', gap: 6 },
  qBtn: { minWidth: 44, height: 34, paddingHorizontal: 8, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  qBtnDark: { backgroundColor: 'rgba(255,255,255,0.12)' },
  qOn: { backgroundColor: colors.primary },
  qText: { fontFamily: fonts.bold, fontSize: 13 },
  tabs: { gap: 6, paddingBottom: 10 },
  tab: { paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontFamily: fonts.semibold, fontSize: 13 },
  gridScroll: { maxHeight: 300 },
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
  name: { fontFamily: fonts.semibold, fontSize: 11.5, marginTop: 2 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  coins: { fontFamily: fonts.bold, fontSize: 11, color: colors.coin },
});
