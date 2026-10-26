import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Star, Video } from 'lucide-react-native';
import { colors, fonts, radius } from '../theme';
import Txt from './Txt';
import { CoinIcon } from './CoinPill';

const status = host =>
  host.online
    ? { label: 'Online', color: colors.online }
    : host.busy
    ? { label: 'In a call', color: colors.warning }
    : { label: 'Offline', color: '#A49BB0' };

/** Photo card for a host in the Home grid, with a quick video-call button. */
export default function HostCard({ host, onPress, onCall }) {
  const st = status(host);
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Image source={{ uri: host.photo }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['transparent', 'rgba(17,10,26,0.85)']}
        style={styles.shade}
      />
      <View style={styles.top}>
        <View style={[styles.dot, { backgroundColor: st.color }]} />
        <Txt style={styles.status}>{st.label}</Txt>
      </View>
      <View style={styles.bottom}>
        <View style={styles.flex}>
          <Txt style={styles.name} numberOfLines={1}>
            {host.name}, {host.age} {host.country}
          </Txt>
          <View style={styles.meta}>
            <CoinIcon size={12} />
            <Txt style={styles.metaText}>{host.videoRate}/min</Txt>
            <Star size={11} color={colors.warning} fill={colors.warning} />
            <Txt style={styles.metaText}>{host.rating}</Txt>
          </View>
        </View>
        <Pressable onPress={onCall} disabled={!host.online} hitSlop={6}>
          <LinearGradient
            colors={host.online ? colors.gradient : ['#6B6178', '#6B6178']}
            style={styles.callBtn}
          >
            <Video size={17} color={colors.white} />
          </LinearGradient>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flex: 1,
    height: 240,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  top: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(17,10,26,0.45)',
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.white },
  bottom: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.9)',
    marginRight: 4,
  },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
