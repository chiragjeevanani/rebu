import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, fonts, radius } from '../theme';
import Txt from './Txt';

export default function Input({
  label,
  icon: Icon,
  right,
  prefix,
  error,
  multiline,
  style,
  inputStyle,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      {label ? (
        <Txt variant="label" style={styles.label}>
          {label}
        </Txt>
      ) : null}
      <View
        style={[
          styles.box,
          multiline && styles.multiline,
          focused && styles.focused,
          error && { borderColor: colors.danger },
        ]}
      >
        {Icon ? (
          <Icon
            size={19}
            color={focused ? colors.primary : colors.textFaint}
            strokeWidth={2}
          />
        ) : null}
        {prefix}
        <TextInput
          placeholderTextColor={colors.textFaint}
          {...rest}
          multiline={multiline}
          onFocus={e => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, multiline && styles.inputMulti, inputStyle]}
        />
        {right}
      </View>
      {error ? (
        <Txt variant="small" color={colors.danger} style={{ marginTop: 6 }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 8 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: 12 },
  focused: { borderColor: colors.primary, backgroundColor: '#FFFBFD' },
  input: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15.5,
    color: colors.ink,
    paddingVertical: 0,
  },
  inputMulti: { minHeight: 110, textAlignVertical: 'top' },
});
