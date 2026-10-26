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

export default function GiftSheet({
  visible,
  onClose,
  onSend,
  onRecharge,
  dark = true,
  to, // recipient name shown in the premium-gift animation
}) {
  const { coins, spendCoins, addTransaction } = useApp();
  const fx = useGiftFx();
  const [selected, setSelected] = useState('rose');
  const gift = GIFTS.find(g => g.key === selected);
  const enough = coins >= gift.coins;

  const send = () => {
    if (!enough) return onRecharge?.();
    spendCoins(gift.coins);
    addTransaction({
      type: 'gift',
      title: `Gift · ${gift.name}`,
      sub: 'Gift sent',
      amount: -gift.coins,
    });
    onSend?.(gift);
    onClose();
    if (gift.coins >= BIG_GIFT_COINS) fx.play(gift, { to });
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
        {GIFTS.map(g => {
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
        style={{ marginTop: 16 }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
