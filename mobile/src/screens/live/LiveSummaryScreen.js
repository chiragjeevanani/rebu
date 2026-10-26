// Shown after ending a live: how it went, top gifters, what to do next.
import React from 'react';
import { Image, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crown, Gem } from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import { inr } from '../../data/economy';
import Avatar from '../../components/Avatar';
import Txt from '../../components/Txt';
import Button from '../../components/Button';

const duration = s => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
};

export default function LiveSummaryScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, isHost } = useApp();
  const p = route.params;

  const stats = [
    ['Duration', duration(p.seconds)],
    ['Viewers', num(p.totalViewers)],
    ['Peak', num(p.peak)],
    ['New followers', num(p.followers)],
  ];

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
      ]}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.body}>
        <Image
          source={{ uri: p.cover || user.photos[0] }}
          style={styles.avatar}
        />
        <Txt style={styles.title}>Live ended</Txt>
        <Txt style={styles.sub} numberOfLines={2}>
          “{p.title}”
        </Txt>

        <View style={styles.diamonds}>
          <Gem size={22} color={colors.coin} />
          <Txt style={styles.diamondsValue}>{num(p.diamonds)}</Txt>
          <Txt style={styles.diamondsLabel}>diamonds received</Txt>
          {isHost ? (
            <Pressable
              style={styles.earned}
              onPress={() => navigation.replace('HostDashboard')}
            >
              <Txt style={styles.earnedText}>
                {inr(p.earned || 0)} added to your earnings ›
              </Txt>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.grid}>
          {stats.map(([k, v]) => (
            <View key={k} style={styles.cell}>
              <Txt style={styles.cellValue}>{v}</Txt>
              <Txt style={styles.cellLabel}>{k}</Txt>
            </View>
          ))}
        </View>

        {p.gifters?.length ? (
          <View style={styles.gifters}>
            <Txt style={styles.section}>Top gifters</Txt>
            {p.gifters.map((g, i) => (
              <View key={g.id} style={styles.gifter}>
                <Txt style={styles.rank}>{i + 1}</Txt>
                <Avatar uri={g.photo} size={34} />
                <Txt style={styles.gName}>{g.name}</Txt>
                <Gem size={13} color={colors.coin} />
                <Txt style={styles.gCoins}>{num(g.coins)}</Txt>
              </View>
            ))}
          </View>
        ) : null}

        {!isHost && p.diamonds > 0 ? (
          <Pressable
            style={styles.host}
            onPress={() => navigation.replace('BecomeHost')}
          >
            <Crown size={20} color={colors.coin} />
            <Txt style={styles.hostText}>
              Become a host to turn diamonds into money ›
            </Txt>
          </Pressable>
        ) : null}
      </View>

      <Button
        title="Done"
        variant="light"
        onPress={() => navigation.popToTop()}
      />
      <Button
        title="Go live again"
        variant="outline"
        color={colors.white}
        style={styles.again}
        onPress={() => navigation.replace('GoLive')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111', paddingHorizontal: 20 },
  body: { flex: 1, alignItems: 'center' },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.white,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.white,
    marginTop: 16,
  },
  sub: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    textAlign: 'center',
  },
  diamonds: { alignItems: 'center', marginTop: 24, gap: 2 },
  diamondsValue: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    color: colors.white,
  },
  diamondsLabel: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 24,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignSelf: 'stretch',
  },
  cell: { width: '50%', alignItems: 'center', paddingVertical: 14 },
  cellValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
  cellLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.6)',
  },
  gifters: { alignSelf: 'stretch', marginTop: 20 },
  section: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
    marginBottom: 6,
  },
  gifter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  rank: { width: 16, fontFamily: fonts.bold, fontSize: 14, color: colors.coin },
  gName: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.white,
  },
  gCoins: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  host: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'stretch',
    marginTop: 18,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: 'rgba(245,179,1,0.12)',
  },
  hostText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.white,
  },
  earned: {
    marginTop: 12,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(30,158,90,0.18)',
    justifyContent: 'center',
  },
  earnedText: { fontFamily: fonts.bold, fontSize: 13.5, color: '#6EE7A8' },
  again: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
