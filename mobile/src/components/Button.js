import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, fonts, radius, shadow } from '../theme';
import Txt from './Txt';

const SIZES = {
  lg: { height: 56, paddingHorizontal: 24, fontSize: 16 },
  md: { height: 48, paddingHorizontal: 20, fontSize: 15 },
  sm: { height: 38, paddingHorizontal: 16, fontSize: 13 },
};

/**
 * variant: primary (brand gradient) | secondary (soft tint) | outline | ghost | dark | light | danger
 */
export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  full = true,
  style,
  textStyle,
  gradient,
  color,
}) {
  const s = SIZES[size];
  const fg =
    color ||
    {
      primary: colors.white,
      secondary: colors.primary,
      outline: colors.ink,
      ghost: colors.primary,
      dark: colors.white,
      light: colors.ink,
      danger: colors.white,
    }[variant];

  const content = (
    <View
      style={[
        styles.row,
        { height: s.height, paddingHorizontal: s.paddingHorizontal },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? (
            <Icon size={s.fontSize + 4} color={fg} strokeWidth={2.2} />
          ) : null}
          {title ? (
            <Txt
              variant="button"
              style={[
                { color: fg, fontSize: s.fontSize, fontFamily: fonts.bold },
                textStyle,
              ]}
            >
              {title}
            </Txt>
          ) : null}
          {IconRight ? (
            <IconRight size={s.fontSize + 4} color={fg} strokeWidth={2.2} />
          ) : null}
        </>
      )}
    </View>
  );

  const base = [
    styles.base,
    full && styles.full,
    { borderRadius: radius.pill },
    disabled && { opacity: 0.5 },
  ];

  if (variant === 'primary' || variant === 'danger') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        style={({ pressed }) => [
          base,
          variant === 'primary' && shadow.glow,
          style,
          pressed && styles.pressed,
        ]}
      >
        <LinearGradient
          colors={
            gradient ||
            (variant === 'danger' ? ['#E5383B', '#E5383B'] : colors.gradient)
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  const bg = {
    secondary: colors.surfaceAlt,
    outline: colors.surface,
    ghost: 'transparent',
    dark: colors.ink,
    light: colors.surface,
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        base,
        { backgroundColor: bg },
        variant === 'outline' && {
          borderWidth: 1.5,
          borderColor: colors.borderStrong,
        },
        variant === 'light' && shadow.soft,
        style,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'visible' },
  full: { alignSelf: 'stretch' },
  gradient: { borderRadius: radius.pill },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
