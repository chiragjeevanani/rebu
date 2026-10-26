import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing } from '../../theme';
import { get } from '../../api/client';
import { timeLabel } from '../../data/economy';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Chip from '../../components/Chip';
import TransactionRow from '../../components/TransactionRow';
import { useSecureScreen } from '../../utils/secure';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'recharge', label: 'Recharges' },
  { key: 'call', label: 'Calls' },
  { key: 'chat', label: 'Messages' },
  { key: 'gift', label: 'Gifts' },
  { key: 'purchase', label: 'Store & VIP' },
  { key: 'issues', label: 'Failed & refunds' },
];

// Server ledger type → the row's type + a short subtitle.
const KIND = {
  purchase: ['recharge', 'Recharge'],
  signup_bonus: ['bonus', 'Welcome bonus'],
  call: ['call', 'Call'],
  chat: ['chat', 'Message'],
  gift: ['gift', 'Gift'],
  ticket: ['ticket', 'Premium live'],
  vip: ['purchase', 'VIP'],
  royal: ['purchase', 'Royal Club'],
  store: ['purchase', 'Store'],
  family: ['family', 'Family'],
  exchange: ['exchange', 'Diamonds swap'],
  task_reward: ['bonus', 'Task reward'],
  refund: ['refund', 'Refund'],
  admin_adjust: ['bonus', 'Adjustment by REBU'],
};

const fromLedger = t => ({
  id: t._id,
  type: KIND[t.type]?.[0] || t.type,
  title: t.title || KIND[t.type]?.[1] || 'Coins',
  sub: KIND[t.type]?.[1] || '',
  amount: t.coins,
  status: t.type === 'refund' ? 'refunded' : 'success',
  time: timeLabel(t.createdAt),
  ts: new Date(t.createdAt).getTime(),
});

// Recharges that never turned into coins only exist as orders.
const fromOrder = o => ({
  id: `o${o.id}`,
  type: 'recharge',
  title: `Recharge · ${num(o.coins + (o.bonus || 0))} coins`,
  sub: `${o.method || 'Payment'} · ₹${num(o.amount)}`,
  amount: 0,
  status: o.status === 'failed' ? 'failed' : 'pending',
  note:
    o.status === 'failed'
      ? o.failureReason ||
        'Payment failed. Any amount debited is refunded in 5–7 working days.'
      : 'Waiting for bank confirmation.',
  time: timeLabel(o.createdAt),
  ts: new Date(o.createdAt).getTime(),
});

const matches = (tx, filter) => {
  if (filter === 'all') return true;
  if (filter === 'issues')
    return ['failed', 'pending', 'refunded'].includes(tx.status);
  return tx.type === filter;
};

export default function TransactionsScreen() {
  useSecureScreen();
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ledger, orders] = await Promise.all([
        get('/me/coins?limit=100'),
        get('/wallet/orders?limit=50'),
      ]);
      const issues = orders.items.filter(
        o =>
          o.kind === 'coins' &&
          (o.status === 'failed' || (o.status === 'created' && o.method)),
      );
      setList(
        [...ledger.items.map(fromLedger), ...issues.map(fromOrder)].sort(
          (a, b) => b.ts - a.ts,
        ),
      );
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const data = (list || []).filter(t => matches(t, filter));

  return (
    <Screen>
      <Header
        title="Transaction history"
        subtitle="Recharges, calls, gifts & refunds"
      />
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map(f => (
            <Chip
              key={f.key}
              small
              label={f.label}
              selected={filter === f.key}
              onPress={() => setFilter(f.key)}
            />
          ))}
        </ScrollView>
      </View>
      {!list && !error ? (
        <ActivityIndicator color={colors.primary} style={styles.empty} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={t => t.id}
          contentContainerStyle={data.length ? styles.list : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              colors={[colors.primary]}
            />
          }
          renderItem={({ item, index }) => (
            <TransactionRow tx={item} last={index === data.length - 1} />
          )}
          ListEmptyComponent={
            <Txt
              variant="body"
              color={error ? colors.danger : colors.textMuted}
              center
              style={styles.empty}
            >
              {error || 'Nothing here yet.'}
            </Txt>
          }
          ListFooterComponent={
            <Txt variant="tiny" center style={styles.help}>
              Paid but didn’t get coins? Failed payments are refunded
              automatically within 5–7 working days. Still missing? Contact
              support from Help.
            </Txt>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 8, paddingHorizontal: spacing.md, paddingBottom: 12 },
  list: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  empty: { padding: 32 },
  help: { padding: spacing.md, lineHeight: 17 },
});
