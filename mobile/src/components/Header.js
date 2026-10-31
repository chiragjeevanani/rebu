import React, { useLayoutEffect } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { colors, spacing } from '../theme';
import { useFrame, useRegisterSlot, useSlot } from '../navigation/headerSlots';
import IconButton from './IconButton';
import Txt from './Txt';

const HEIGHT = 60;

function Titles({ title, subtitle, light, large, back, grow }) {
  return (
    <View style={[styles.titles, grow && styles.grow, !back && styles.noBack]}>
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
  );
}

function BackButton({ onPress, light }) {
  return (
    <IconButton
      icon={ChevronLeft}
      onPress={onPress}
      variant={light ? 'glass' : 'light'}
      size={40}
      iconSize={22}
    />
  );
}

/** Drawn inside the page (screens outside the stack's shared header). */
function InlineHeader({
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
        <BackButton onPress={onBack || (() => nav.goBack())} light={light} />
      ) : null}
      <Titles
        title={title}
        subtitle={subtitle}
        light={light}
        large={large}
        back={back}
        grow
      />
      <View style={styles.right}>{right}</View>
    </View>
  );
}

/** Inside a stack screen with the shared header: hand everything to it. */
function HeaderBridge({ frame, title, subtitle, back = true, onBack, right }) {
  const nav = useNavigation();
  useLayoutEffect(() => {
    nav.setOptions({
      title: title || '',
      headerSubtitle: subtitle || '',
      headerBack: back,
    });
  }, [nav, title, subtitle, back]);
  useRegisterSlot(frame.routeKey, { right, onBack });
  return null;
}

export default function Header(props) {
  const frame = useFrame();
  if (frame?.kind === 'stack' && frame.headerShown) {
    return <HeaderBridge frame={frame} {...props} />;
  }
  return <InlineHeader {...props} />;
}

/**
 * The stack's shared ("float") header. One instance per visible screen is
 * stacked here; the navigator's interpolator fades the title and buttons
 * between them while the bar itself stays still.
 */
export function StackHeader({
  options,
  route,
  navigation,
  back,
  progress,
  styleInterpolator,
  layout,
}) {
  const insets = useSafeAreaInsets();
  const slot = useSlot(route.key);
  const height = insets.top + HEIGHT;
  const anim = styleInterpolator({
    current: { progress: progress.current },
    next: progress.next && { progress: progress.next },
    layouts: { header: { height, width: layout.width }, screen: layout },
  });
  const showBack = !!back && options.headerBack !== false;
  return (
    <View style={{ height }}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.bg, anim.backgroundStyle]}
      />
      <View style={[styles.row, { marginTop: insets.top }]}>
        {showBack ? (
          <Animated.View style={anim.leftButtonStyle}>
            <BackButton onPress={slot?.onBack || (() => navigation.goBack())} />
          </Animated.View>
        ) : null}
        <Animated.View style={[styles.titleBox, anim.titleStyle]}>
          <Titles
            title={options.title}
            subtitle={options.headerSubtitle}
            back={showBack}
          />
        </Animated.View>
        <Animated.View style={[styles.right, anim.rightButtonStyle]}>
          {slot?.right}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: HEIGHT,
  },
  bg: { backgroundColor: colors.background },
  titleBox: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  titles: { marginLeft: spacing.sm },
  grow: { flex: 1 },
  noBack: { marginLeft: 0 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
