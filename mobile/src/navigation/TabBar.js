import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BadgeIndianRupee,
  CircleStar,
  MessageCircleMore,
  Search,
  ThumbsUp,
  UsersRound,
} from 'lucide-react-native';
import { colors, fonts } from '../theme';
import Txt from '../components/Txt';

const TABS = {
  ForYou: { label: 'For You', icon: ThumbsUp, fill: true },
  Following: { label: 'Following', icon: UsersRound, fill: true },
  Explore: { label: 'Explore', icon: Search, fill: false },
  Coins: { label: 'Coins', icon: CircleStar, fill: false },
  HostTab: { label: 'Host', icon: BadgeIndianRupee, fill: false },
  Chats: { label: 'Chats', icon: MessageCircleMore, fill: true },
};
const BADGES = { Chats: '1' };
const LINE_W = 28;

// `position` is the pager's live page offset (e.g. 1.37 mid-swipe), driven on the
// native thread, so everything interpolated from it follows the finger exactly.
const closeness = (position, index) =>
  position.interpolate({
    inputRange: [index - 1, index, index + 1],
    outputRange: [0, 1, 0],
    extrapolate: 'clamp',
  });

function TabItem({ route, index, position, onPress }) {
  const tab = TABS[route.name];
  const Icon = tab.icon;
  const active = closeness(position, index);
  const inactive = RNAnimated.subtract(1, active);

  return (
    // Switch on touch-down (not release) so tabs feel instant.
    <Pressable onPressIn={onPress} style={styles.item} hitSlop={4}>
      <View style={styles.iconBox}>
        <RNAnimated.View
          style={[
            StyleSheet.absoluteFill,
            styles.center,
            { opacity: inactive },
          ]}
        >
          <Icon size={26} color={colors.text} strokeWidth={1.7} />
        </RNAnimated.View>
        <RNAnimated.View
          style={[StyleSheet.absoluteFill, styles.center, { opacity: active }]}
        >
          <Icon
            size={26}
            color={colors.ink}
            fill={tab.fill ? colors.ink : 'transparent'}
            strokeWidth={tab.fill ? 1.7 : 2.6}
          />
        </RNAnimated.View>
        {BADGES[route.name] ? (
          <View style={styles.badge}>
            <Txt style={styles.badgeText}>{BADGES[route.name]}</Txt>
          </View>
        ) : null}
      </View>
      <View style={styles.labelBox}>
        <RNAnimated.Text
          numberOfLines={1}
          style={[styles.label, { opacity: inactive }]}
        >
          {tab.label}
        </RNAnimated.Text>
        <RNAnimated.Text
          style={[styles.label, styles.labelActive, { opacity: active }]}
        >
          {tab.label}
        </RNAnimated.Text>
      </View>
    </Pressable>
  );
}

export default function TabBar({ state, navigation, position: pagerPosition }) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const tabW = width / state.routes.length;

  // Fallback for navigators that don't provide a live position.
  const fallback = useRef(new RNAnimated.Value(state.index)).current;
  useEffect(() => {
    if (!pagerPosition) fallback.setValue(state.index);
  }, [pagerPosition, fallback, state.index]);
  const position = pagerPosition || fallback;

  const indices = state.routes.map((_, i) => i);
  const translateX = position.interpolate({
    inputRange: indices,
    outputRange: indices.map(i => i * tabW + (tabW - LINE_W) / 2),
    extrapolate: 'clamp',
  });

  return (
    <View>
      <View
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      >
        {width ? (
          <RNAnimated.View
            pointerEvents="none"
            style={[styles.line, { transform: [{ translateX }] }]}
          />
        ) : null}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const onPress = () => {
            const e = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !e.defaultPrevented)
              navigation.navigate(route.name);
          };
          return (
            <TabItem
              key={route.key}
              route={route}
              index={i}
              position={position}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  line: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: LINE_W,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  iconBox: { width: 34, height: 30 },
  center: { alignItems: 'center', justifyContent: 'center' },
  labelBox: { alignSelf: 'stretch' },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
  },
  labelActive: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 13,
    color: colors.white,
  },
});
