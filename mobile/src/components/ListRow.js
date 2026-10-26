import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing } from '../theme';
import Txt from './Txt';

export default function ListRow({
  icon: Icon,
  iconColor = colors.ink,
  iconBg = colors.surfaceMuted,
  title,
  subtitle,
  value,
  onPress,
  toggle,
  onToggle,
  danger,
  right,
  last,
  dark, // for rows inside dark sheets (e.g. during a call)
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && toggle === undefined}
      style={({ pressed }) => [
        styles.row,
        !last && styles.divider,
        !last && dark && styles.dividerDark,
        pressed && { opacity: 0.7 },
      ]}
    >
      {Icon ? (
        <View
          style={[
            styles.icon,
            {
              backgroundColor: dark
                ? 'rgba(255,255,255,0.08)'
                : danger
                ? '#FFE8EC'
                : iconBg,
            },
          ]}
        >
          <Icon
            size={19}
            color={danger ? colors.danger : iconColor}
            strokeWidth={2.1}
          />
        </View>
      ) : null}
      <View style={styles.text}>
        <Txt
          variant="label"
          color={danger ? colors.danger : dark ? colors.white : colors.ink}
        >
          {title}
        </Txt>
        {subtitle ? (
          <Txt
            variant="small"
            color={dark ? 'rgba(255,255,255,0.6)' : undefined}
            style={{ marginTop: 2 }}
          >
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {value ? <Txt variant="small">{value}</Txt> : null}
      {right}
      {toggle !== undefined ? (
        <Switch
          value={toggle}
          onValueChange={onToggle}
          trackColor={{ false: '#E4DDEA', true: colors.primary }}
          thumbColor={colors.white}
        />
      ) : onPress && !danger ? (
        <ChevronRight size={18} color={colors.textFaint} />
      ) : null}
    </Pressable>
  );
}

export function Card({ children, style, padded = true }) {
  return (
    <View style={[styles.card, padded && { padding: spacing.md }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dividerDark: { borderBottomColor: 'rgba(255,255,255,0.08)' },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A1325',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 24,
    elevation: 1,
  },
});
