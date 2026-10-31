// Small building blocks shared by the social screens (Home, Moments, Rooms…).
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  ChevronLeft,
  Crown,
  Gem,
  Hand,
  MessageCircle,
  User,
} from 'lucide-react-native';
import { colors, fonts, radius } from '../theme';
import Txt from './Txt';

/** Big text tabs at the top of a screen ("For You  Nearby  New"). */
export function TopTabs({ tabs, value, onChange, right, style, onBack }) {
  return (
    <View style={[styles.topTabs, style]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} style={styles.back}>
          <ChevronLeft size={28} color={colors.ink} />
        </Pressable>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.topTabsScroll}
        style={styles.flex}
      >
        {tabs.map(t => {
          const key = t.key ?? t;
          const active = key === value;
          return (
            <Pressable key={key} onPress={() => onChange(key)} hitSlop={6}>
              <Txt style={[styles.topTab, active && styles.topTabActive]}>
                {t.label ?? t}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      {right ? <View style={styles.topRight}>{right}</View> : null}
    </View>
  );
}

/** Pink pill with the age (♀ 24). */
export function AgeBadge({ age, gender = 'f' }) {
  // 'f' / 'Female' (hosts default to female), 'Male' → blue.
  const female = !gender || /^f/i.test(gender);
  if (!age && !gender) return null;
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: female ? '#FF8FB8' : '#7EC8FF' },
      ]}
    >
      <Txt style={styles.badgeText}>
        {female ? '♀' : '♂'} {age}
      </Txt>
    </View>
  );
}

export function VipBadge({ level }) {
  if (!level) return null;
  const svip = level >= 4;
  return (
    <LinearGradient
      colors={svip ? ['#1C1C1E', '#1C1C1E'] : ['#F5B301', '#F5B301']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.badge}
    >
      <Crown size={10} color={colors.white} />
      <Txt style={styles.badgeText}>{svip ? 'ELITE' : `VIP${level}`}</Txt>
    </LinearGradient>
  );
}

/** Host category from gift levels (Iron … Diamond), in the admin-set colour. */
export function HostCategoryBadge({ category, level, large }) {
  if (!category) return null;
  return (
    <View
      style={[
        styles.badge,
        large && styles.badgeLarge,
        { backgroundColor: category.color },
      ]}
    >
      <Gem size={large ? 13 : 10} color={colors.white} />
      <Txt style={[styles.badgeText, large && styles.badgeTextLarge]}>
        {category.name}
        {level ? ` · Lv ${level}` : ''}
      </Txt>
    </View>
  );
}

/** "Say Hi" pill in brand colours; becomes a chat button after greeting. */
export function HiButton({ greeted, onPress }) {
  if (greeted) {
    return (
      <Pressable onPress={onPress} style={styles.chatBtn} hitSlop={6}>
        <MessageCircle size={16} color={colors.primary} />
        <Txt style={styles.chatText}>Chat</Txt>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hiBtn}
      >
        <Hand size={16} color={colors.white} strokeWidth={2.4} />
        <Txt style={styles.hiText}>Say Hi</Txt>
      </LinearGradient>
    </Pressable>
  );
}

/** One host in a vertical list: avatar, name + badges, a subtitle and an action. */
export function HostRow({ host, subtitle, right, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View>
        {host.photo ? (
          <Image source={{ uri: host.photo }} style={styles.rowAvatar} />
        ) : (
          <View style={[styles.rowAvatar, styles.rowAvatarEmpty]}>
            <User size={28} color={colors.textFaint} />
          </View>
        )}
        {host.online ? <View style={styles.rowOnline} /> : null}
      </View>
      <View style={styles.rowText}>
        <Txt variant="h3" numberOfLines={1}>
          {host.name} {host.emoji || ''}
        </Txt>
        <View style={styles.badges}>
          <AgeBadge age={host.age} gender={host.gender} />
          <VipBadge level={host.vip} />
        </View>
        {subtitle ? (
          <Txt variant="small" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/** Rounded gradient tile used for feature shortcuts (Spark, Live Lounge…). */
export function FeatureTile({
  title,
  sub,
  colors: tint,
  icon,
  onPress,
  style,
}) {
  return (
    <Pressable onPress={onPress} style={[styles.flex, style]}>
      <LinearGradient
        colors={tint}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.tile}
      >
        <View style={styles.flex}>
          <Txt style={styles.tileTitle}>{title}</Txt>
          <Txt style={styles.tileSub} numberOfLines={1}>
            {sub}
          </Txt>
        </View>
        {icon ? <Txt style={styles.tileIcon}>{icon}</Txt> : null}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { marginRight: 6, marginLeft: -6 },
  flex: { flex: 1 },
  topTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    minHeight: 56,
  },
  topTabsScroll: { alignItems: 'baseline', gap: 16, paddingRight: 8 },
  topTab: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 24,
    color: colors.textFaint,
  },
  topTabActive: {
    fontFamily: fonts.extrabold,
    fontSize: 21,
    lineHeight: 28,
    color: colors.ink,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 18,
    borderRadius: 9,
  },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.white,
  },
  badgeLarge: { height: 26, borderRadius: 13, paddingHorizontal: 10, gap: 5 },
  badgeTextLarge: { fontSize: 12.5, lineHeight: 16 },
  badges: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  hiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
  },
  hiText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  chatText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowAvatarEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  rowAvatar: {
    width: 76,
    height: 76,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
  },
  rowOnline: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.online,
    borderWidth: 3,
    borderColor: colors.white,
  },
  rowText: { flex: 1 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 76,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  tileTitle: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.white },
  tileSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  tileIcon: { fontSize: 34, lineHeight: 42 },
});
