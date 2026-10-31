// Building blocks for the photo-led discovery screens (For You, Following, Explore).
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import {
  ChevronRight,
  Eye,
  Gem,
  Megaphone,
  Plus,
  Video,
} from 'lucide-react-native';
import { colors, fonts, spacing } from '../theme';
import { useApp } from '../context/AppContext';
import { canGoLive } from '../utils/hosting';
import { num } from '../utils/format';
import Txt from './Txt';
import { CoinIcon } from './CoinPill';
import { useFrame, useRegisterSlot, useSlot } from '../navigation/headerSlots';

// Deterministic demo stats so numbers don't jump between renders.
export const hostStats = h => {
  const seed = h.id.split('').reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    viewers: h.online ? 3 + ((seed * 37) % 180) : 0,
    diamonds: h.followers * (60 + (seed % 140)),
  };
};

export const compact = n => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};

/**
 * Avatar · coin balance · action icon(s). In the main tabs one shared bar sits
 * above the pages (see MainTabs); each tab's <TopBar right=…/> only supplies
 * its icons.
 */
export function TopBar(props) {
  const frame = useFrame();
  if (frame?.kind === 'tabs') return <TabIcons frame={frame} {...props} />;
  return <TopBarView {...props} />;
}

function TabIcons({ frame, right }) {
  useRegisterSlot(frame.routeKey, { right });
  return null;
}

/** The icons the focused tab registered (the Events megaphone by default). */
export function TabTopBarRight({ routeKey }) {
  const slot = useSlot(routeKey);
  return slot?.right || <EventsIcon />;
}

function EventsIcon() {
  const navigation = useNavigation();
  return (
    <Pressable onPress={() => navigation.navigate('Events')} hitSlop={8}>
      <Megaphone size={25} color={colors.ink} strokeWidth={1.9} />
    </Pressable>
  );
}

export function TopBarView({ right }) {
  const navigation = useNavigation();
  const { user, coins } = useApp();
  return (
    <View style={styles.top}>
      <Pressable onPress={() => navigation.navigate('Me')} hitSlop={6}>
        <Image source={{ uri: user.photos[0] }} style={styles.me} />
      </Pressable>
      <Pressable
        style={styles.coins}
        onPress={() => navigation.navigate('Wallet')}
      >
        <CoinIcon size={18} />
        <Txt style={styles.coinsText}>{num(coins)}</Txt>
        <View style={styles.coinsPlus}>
          <Plus size={14} color={colors.white} strokeWidth={3} />
        </View>
      </Pressable>
      <View style={styles.flex} />
      {right || <EventsIcon />}
    </View>
  );
}

/** The two big grey shortcuts under the top bar. */
export function QuickActions() {
  const navigation = useNavigation();
  return (
    <View style={styles.actions}>
      <Pressable
        style={styles.action}
        onPress={() => navigation.navigate('Rooms')}
      >
        <Txt style={styles.actionEmoji}>🎙️</Txt>
        <Txt style={styles.actionText}>Audio rooms</Txt>
      </Pressable>
      <Pressable
        style={styles.action}
        onPress={() => navigation.navigate('Spark')}
      >
        <Txt style={styles.actionEmoji}>⚡</Txt>
        <Txt style={styles.actionText}>Random call</Txt>
      </Pressable>
    </View>
  );
}

/** Tall photo card with viewer count, avatar, name and diamonds. */
export function LiveCard({ host, width, height = 266, onPress }) {
  const { viewers, diamonds } = hostStats(host);
  return (
    <Pressable onPress={onPress} style={[styles.card, { width, height }]}>
      <Image
        source={{ uri: host.photos?.[1] || host.photo }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
        style={styles.shadeTop}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
        style={styles.shadeBottom}
      />
      <View style={styles.cardTop}>
        {host.online ? (
          <>
            <Eye size={17} color={colors.white} />
            <Txt style={styles.viewers}>{viewers}</Txt>
          </>
        ) : (
          <Txt style={styles.offline}>Offline</Txt>
        )}
      </View>
      <View style={styles.cardBottom}>
        <Image source={{ uri: host.photo }} style={styles.cardAvatar} />
        <View style={styles.flex}>
          <Txt style={styles.cardName} numberOfLines={1}>
            {host.name} {host.emoji || ''}
          </Txt>
          <View style={styles.diamonds}>
            <Gem size={11} color="rgba(255,255,255,0.85)" />
            <Txt style={styles.diamondText}>{compact(diamonds)}</Txt>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** Floating camera button above the tab bar: opens the Go Live studio. */
export function CallFab() {
  const navigation = useNavigation();
  const { user, config } = useApp();
  // Going live is for women only.
  if (!canGoLive(user, config)) return null;
  return (
    <Pressable
      style={styles.fab}
      onPress={() => navigation.navigate('GoLive')}
      hitSlop={6}
    >
      <Video size={30} color={colors.white} fill={colors.white} />
    </Pressable>
  );
}

/** Titled horizontal row with a "More" link (Explore). */
export function Section({ title, onMore, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Txt style={styles.sectionTitle}>{title}</Txt>
        {onMore ? (
          <Pressable style={styles.more} onPress={onMore} hitSlop={8}>
            <Txt style={styles.moreText}>More</Txt>
            <ChevronRight size={20} color={colors.textFaint} />
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sectionRow}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 14,
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  me: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
  },
  coins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 4,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
  },
  coinsText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    marginRight: 4,
  },
  coinsPlus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  actionEmoji: { fontSize: 22, lineHeight: 28 },
  actionText: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  card: {
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  shadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 70,
  },
  shadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  cardTop: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewers: { fontFamily: fonts.semibold, fontSize: 15, color: colors.white },
  offline: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  cardBottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  cardName: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  diamonds: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  diamondText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  section: { marginTop: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
  },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreText: { fontFamily: fonts.medium, fontSize: 16, color: colors.textFaint },
  sectionRow: { gap: 3, paddingHorizontal: 3 },
});
