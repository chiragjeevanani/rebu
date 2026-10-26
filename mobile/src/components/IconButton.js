import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, shadow } from '../theme';
import Txt from './Txt';

/**
 * Round icon button. variant: light | gradient | glass | dark | tint | plain
 */
export default function IconButton({
  icon: Icon,
  onPress,
  size = 44,
  iconSize,
  variant = 'light',
  color,
  fill,
  badge,
  gradient,
  style,
  shadowed = true,
}) {
  const is = iconSize || Math.round(size * 0.46);
  const fg =
    color ||
    {
      light: colors.ink,
      gradient: colors.white,
      glass: colors.white,
      dark: colors.white,
      tint: colors.primary,
      plain: colors.ink,
    }[variant];
  const dim = { width: size, height: size, borderRadius: size / 2 };

  const inner = (
    <View style={[styles.center, dim]}>
      <Icon
        size={is}
        color={fg}
        fill={fill || 'transparent'}
        strokeWidth={2.2}
      />
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [pressed && styles.pressed, style]}
    >
      {variant === 'gradient' ? (
        <LinearGradient
          colors={gradient || colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[dim, shadowed && shadow.glow]}
        >
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={[
            dim,
            variant === 'light' && { backgroundColor: colors.surface },
            variant === 'glass' && styles.glass,
            variant === 'dark' && { backgroundColor: 'rgba(17,10,26,0.55)' },
            variant === 'tint' && { backgroundColor: colors.surfaceAlt },
            variant === 'light' && shadowed && shadow.soft,
          ]}
        >
          {inner}
        </View>
      )}
      {badge ? (
        <View style={styles.badge}>
          <Txt variant="tiny" style={styles.badgeText}>
            {badge}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
  glass: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: { color: colors.white, fontSize: 9, lineHeight: 11 },
});
