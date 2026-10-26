import React from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

/** Page wrapper handling safe areas, background and optional scrolling. */
export default function Screen({
  children,
  scroll = false,
  edges = ['top'],
  bg = colors.background,
  dark = false,
  contentStyle,
  style,
  footer,
}) {
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  };
  return (
    <View style={[styles.root, { backgroundColor: bg }, pad, style]}>
      <StatusBar
        barStyle={dark ? 'light-content' : 'dark-content'}
        translucent
        backgroundColor="transparent"
      />
      {scroll ? (
        <ScrollView
          style={styles.root}
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, contentStyle]}>{children}</View>
      )}
      {/* Breathing room under bottom buttons so they never sit on the nav bar. */}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 32 },
  footer: {
    paddingBottom: 24,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
