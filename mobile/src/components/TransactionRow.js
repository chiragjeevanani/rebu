import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleX,
  Gift,
  Hourglass,
  Phone,
  RefreshCcw,
} from 'lucide-react-native';
import { colors, fonts, spacing } from '../theme';
import { num } from '../utils/format';
import Txt from './Txt';

const STATUS = {
  pending: {
    label: 'Pending',
    color: colors.warning,
    bg: '#FFF4DB',
    icon: Hourglass,
  },
  failed: {
    label: 'Failed',
    color: colors.danger,
    bg: '#FFE8EC',
    icon: CircleX,
  },
  refunded: {
    label: 'Refunded',
    color: '#0EA5E9',
    bg: '#E0F4FE',
    icon: RefreshCcw,
  },
};

export default function TransactionRow({ tx, last }) {
  const status = STATUS[tx.status];
  const credit = tx.amount > 0;
  let Icon = credit ? ArrowDownLeft : ArrowUpRight;
  let tint = credit ? ['#DFF7EE', colors.success] : ['#FFECF2', colors.primary];
  if (tx.type === 'gift') Icon = Gift;
  if (tx.type === 'call') Icon = Phone;
  if (status) {
    Icon = status.icon;
    tint = [status.bg, status.color];
  }

  return (
    <View style={[styles.row, !last && styles.divider]}>
      <View style={[styles.icon, { backgroundColor: tint[0] }]}>
        <Icon size={18} color={tint[1]} />
      </View>
      <View style={styles.text}>
        <Txt variant="label">{tx.title}</Txt>
        <Txt variant="small">
          {tx.sub} · {tx.time}
        </Txt>
        {tx.note ? (
          <Txt variant="small" color={status?.color} style={styles.note}>
            {tx.note}
          </Txt>
        ) : null}
      </View>
      <View style={styles.right}>
        {tx.amount ? (
          <Txt variant="label" color={credit ? colors.success : colors.ink}>
            {credit ? '+' : '−'}
            {num(Math.abs(tx.amount))}
          </Txt>
        ) : null}
        {status ? (
          <View style={[styles.badge, { backgroundColor: status.bg }]}>
            <Txt style={[styles.badgeText, { color: status.color }]}>
              {status.label}
            </Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: spacing.md - 2,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  note: { marginTop: 4 },
  right: { alignItems: 'flex-end', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontFamily: fonts.bold, fontSize: 10.5 },
});
