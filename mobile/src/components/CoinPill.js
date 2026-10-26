import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Plus } from 'lucide-react-native';
import { colors, fonts, shadow } from '../theme';
import { num } from '../utils/format';
import Txt from './Txt';

export function CoinIcon({ size = 18 }) {
  return (
    <LinearGradient
      colors={colors.gradientGold}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: size,
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.85)',
        }}
      />
    </LinearGradient>
  );
}

export default function CoinPill({ amount, onPress, light }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        light ? styles.light : styles.glass,
        light && shadow.soft,
      ]}
    >
      <CoinIcon />
      <Txt style={[styles.text, { color: light ? colors.ink : colors.white }]}>
        {num(amount)}
      </Txt>
      <View style={styles.plus}>
        <Plus size={12} color={colors.white} strokeWidth={3} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 6,
    paddingRight: 5,
    height: 34,
    borderRadius: 17,
  },
  light: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#FFE7B3',
  },
  glass: { backgroundColor: 'rgba(0,0,0,0.3)' },
  text: { fontFamily: fonts.bold, fontSize: 14 },
  plus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
