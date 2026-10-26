import React, { useEffect, useState } from 'react';
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
 * onBuy() makes the purchase on the server and resolves with the new state
 * (it should include `balance`); the sheet shows progress and errors.
 */
export default function BuySheet({ item, onClose, onBuy, onRecharge }) {
  const { coins, setCoinsFromServer } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setError(''), [item]);
  if (!item) return <Sheet visible={false} onClose={onClose} />;
  const enough = coins >= item.price;

  const buy = async () => {
    if (!enough) return onRecharge?.();
    setBusy(true);
    setError('');
    try {
      const r = await onBuy();
      if (typeof r?.balance === 'number') setCoinsFromServer(r.balance);
      onClose();
    } catch (e) {
      if (e.code === 'insufficient_coins') onRecharge?.();
      else setError(e.message);
    } finally {
      setBusy(false);
    }
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
        {error ? (
          <Txt variant="small" center color={colors.danger} style={styles.note}>
            {error}
          </Txt>
        ) : null}
        <Button
          title={enough ? 'Confirm purchase' : 'Not enough coins · Recharge'}
          onPress={buy}
          loading={busy}
          disabled={busy}
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
