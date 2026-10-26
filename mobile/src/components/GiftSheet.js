import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius } from '../theme';
import { GIFTS } from '../data/mock';
import { useApp } from '../context/AppContext';
import Sheet from './Sheet';
import Txt from './Txt';
import Button from './Button';
import CoinPill, { CoinIcon } from './CoinPill';
import { BIG_GIFT_COINS, useGiftFx } from './GiftFx';
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
  const [selected, setSelected] = useState('rose');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const gift = gifts.find(g => g.key === selected) || gifts[0];
  const enough = coins >= gift.coins;

  const done = () => {
    onSend?.(gift);
    onClose();
    if (gift.coins >= BIG_GIFT_COINS) fx.play(gift, { to });
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
          context: context || { type: 'chat' },
        });
        setCoinsFromServer(r.balance);
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
              onPress={() => setSelected(g.key)}
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
      <Button
        title={
          enough
            ? `Send ${gift.name} · ${gift.coins} coins`
            : 'Not enough coins · Recharge'
        }
        onPress={send}
        loading={sending}
        style={{ marginTop: 16 }}
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
