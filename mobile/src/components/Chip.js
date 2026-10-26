import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, fonts, radius } from '../theme';
import Txt from './Txt';

/** Selectable pill. variant: default | glass */
export default function Chip({
  label,
  emoji,
  icon: Icon,
  selected,
  onPress,
  variant = 'default',
  small,
  style,
}) {
  const glass = variant === 'glass';
  const fg = selected ? colors.white : glass ? colors.white : colors.ink;
  const body = (
    <>
      {emoji ? <Txt style={{ fontSize: small ? 12 : 14 }}>{emoji}</Txt> : null}
      {Icon ? (
        <Icon size={small ? 13 : 15} color={fg} strokeWidth={2.2} />
      ) : null}
      <Txt style={[styles.label, small && styles.small, { color: fg }]}>
        {label}
      </Txt>
    </>
  );
  const pad = small ? styles.padSmall : styles.pad;

  if (selected) {
    return (
      <Pressable onPress={onPress} style={style}>
        <LinearGradient
          colors={[colors.ink, colors.ink]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.base, pad]}
        >
          {body}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.base, pad, glass ? styles.glass : styles.default, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
  },
  pad: { paddingHorizontal: 14, paddingVertical: 9 },
  padSmall: { paddingHorizontal: 10, paddingVertical: 5 },
  default: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  label: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 18 },
  small: { fontSize: 11.5, lineHeight: 15 },
});
