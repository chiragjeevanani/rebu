import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing } from '../theme';
import IconButton from './IconButton';
import Txt from './Txt';

export default function Header({
  title,
  subtitle,
  back = true,
  onBack,
  right,
  light,
  style,
  large,
}) {
  const nav = useNavigation();
  return (
    <View style={[styles.row, style]}>
      {back ? (
        <IconButton
          icon={ChevronLeft}
          onPress={onBack || (() => nav.goBack())}
          variant={light ? 'glass' : 'light'}
          size={40}
          iconSize={22}
        />
      ) : null}
      <View style={[styles.titles, !back && { marginLeft: 0 }]}>
        {title ? (
          <Txt
            variant={large ? 'h1' : 'h3'}
            color={light ? colors.white : colors.ink}
            numberOfLines={1}
          >
            {title}
          </Txt>
        ) : null}
        {subtitle ? (
          <Txt
            variant="small"
            color={light ? 'rgba(255,255,255,0.8)' : colors.textMuted}
            numberOfLines={1}
          >
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 60,
  },
  titles: { flex: 1, marginLeft: spacing.sm },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
