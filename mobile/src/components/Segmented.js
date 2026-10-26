import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, fonts, radius } from '../theme';
import Txt from './Txt';

export default function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.wrap, style]}>
      {options.map(o => {
        const key = o.key ?? o;
        const label = o.label ?? o;
        const active = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.item, active && styles.active]}
          >
            <Txt
              style={[
                styles.text,
                { color: active ? colors.ink : colors.textMuted },
              ]}
            >
              {label}
              {o.count ? (
                <Txt
                  style={[styles.text, { color: colors.primary }]}
                >{`  ${o.count}`}</Txt>
              ) : null}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    padding: 4,
  },
  item: {
    flex: 1,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    backgroundColor: colors.surface,
    shadowColor: '#1A1325',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  text: { fontFamily: fonts.bold, fontSize: 13.5 },
});
