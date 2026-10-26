import React from 'react';
import { Text } from 'react-native';
import { type as typography } from '../theme';

export default function Txt({
  variant = 'body',
  color,
  center,
  style,
  children,
  ...rest
}) {
  return (
    <Text
      {...rest}
      style={[
        typography[variant],
        color && { color },
        center && { textAlign: 'center' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
