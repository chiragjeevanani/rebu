import React, { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
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
  { key: 'issues', label: 'Failed & refunds' },
];

const matches = (tx, filter) => {
  if (filter === 'all') return true;
  if (filter === 'issues')
    return ['failed', 'pending', 'refunded'].includes(tx.status);
  return tx.type === filter;
};

export default function TransactionsScreen() {
  useSecureScreen();
  const { transactions } = useApp();
  const [filter, setFilter] = useState('all');
  const data = transactions.filter(t => matches(t, filter));

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
      <FlatList
        data={data}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item, index }) => (
          <TransactionRow tx={item} last={index === data.length - 1} />
        )}
        ListEmptyComponent={
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={styles.empty}
          >
            Nothing here yet.
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
