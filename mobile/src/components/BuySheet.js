import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, fonts } from '../theme';
import { useApp } from '../context/AppContext';
import { num } from '../utils/format';
import Sheet from './Sheet';
import Txt from './Txt';
import Button from './Button';
import { CoinIcon } from './CoinPill';

/**
 * Confirms a coin purchase. item = { title, emoji, price, note }.
 * Spends coins, records the transaction, then calls onBought().
 */
export default function BuySheet({ item, onClose, onBought, onRecharge }) {
  const { coins, spendCoins, addTransaction } = useApp();
  if (!item) return <Sheet visible={false} onClose={onClose} />;
  const enough = coins >= item.price;

  const buy = () => {
    if (!enough) return onRecharge?.();
    spendCoins(item.price);
    addTransaction({
      type: 'purchase',
      title: item.title,
      sub: 'Purchase',
      amount: -item.price,
    });
    onBought?.();
    onClose();
  };

  return (
    <Sheet visible onClose={onClose}>
      <View style={styles.body}>
        {item.emoji ? <Txt style={styles.emoji}>{item.emoji}</Txt> : null}
        <Txt variant="h2" center>
          {item.title}
        </Txt>
        {item.note ? (
          <Txt variant="small" center style={styles.note}>
            {item.note}
          </Txt>
        ) : null}
        <View style={styles.price}>
          <CoinIcon size={20} />
          <Txt style={styles.priceText}>{num(item.price)}</Txt>
        </View>
        <Txt variant="small" center>
          Your balance: {num(coins)} coins
        </Txt>
        <Button
          title={enough ? 'Confirm purchase' : 'Not enough coins · Recharge'}
          onPress={buy}
          style={styles.cta}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingBottom: 6 },
  emoji: { fontSize: 54, lineHeight: 64, marginBottom: 6 },
  note: { marginTop: 6, paddingHorizontal: 12 },
  price: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
  },
  priceText: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.ink },
  cta: { marginTop: 18 },
});
