import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {
  Ban,
  ChevronDown,
  Flag,
  Gift,
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  PhoneOff,
  SkipForward,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  TriangleAlert,
  WandSparkles,
  WifiOff,
} from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme';
import { GIFTS, SONGS } from '../../data/mock';
import { inr, netPerMinute, split } from '../../data/economy';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import IconButton from '../../components/IconButton';
import GiftSheet from '../../components/GiftSheet';
import Sheet from '../../components/Sheet';
import { CoinIcon } from '../../components/CoinPill';
import ListRow from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';

const FILTERS = [
  { key: 'none', label: 'Natural', tint: 'transparent' },
  { key: 'glow', label: 'Glow', tint: 'rgba(255,170,200,0.18)' },
  { key: 'warm', label: 'Warm', tint: 'rgba(255,150,60,0.18)' },
  { key: 'cool', label: 'Cool', tint: 'rgba(80,140,255,0.18)' },
  { key: 'mono', label: 'Noir', tint: 'rgba(40,40,40,0.35)' },
  { key: 'dream', label: 'Dreamy', tint: 'rgba(160,110,255,0.2)' },
];

const fmt = s =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(
    2,
    '0',
  )}`;

function SideButton({ icon: Icon, label, active, onPress, badge }) {
  return (
    <Pressable onPress={onPress} style={styles.side}>
      <View
        style={[
          styles.sideIcon,
          active && {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
          },
        ]}
      >
        <Icon size={20} color={colors.white} />
        {badge ? <View style={styles.sideBadge} /> : null}
      </View>
      <Txt style={styles.sideLabel}>{label}</Txt>
    </Pressable>
  );
}

// How long we keep trying to reconnect before the call is ended as dropped.
const RECONNECT_TIMEOUT = 20;
// How long an outgoing call rings before it counts as not answered.
const RING_TIMEOUT = 8000;

export default function CallScreen({ navigation, route }) {
  useSecureScreen();
  const {
    user: other,
    video: startVideo = true,
    random,
    incoming, // host answering a user's call: the host earns, nobody is charged here
  } = route.params;
  const {
    user: me,
    spendCoins,
    getCoins,
    addCall,
    addTransaction,
    addEarning,
    hostRates,
    hostAgency,
  } = useApp();
  const insets = useSafeAreaInsets();
  const rate = startVideo ? other.videoRate || 40 : other.voiceRate || 20;
  // Host side: the caller pays the host's own price; this is the host's take.
  const hostType = startVideo ? 'video' : 'voice';
  const earnRate = netPerMinute(hostRates[hostType], hostType, hostAgency);

  // phase: ringing → connected ⇄ reconnecting
  const [phase, setPhase] = useState(incoming ? 'connected' : 'ringing');
  const connected = phase === 'connected';
  const [secs, setSecs] = useState(0); // connected seconds only
  const [charged, setCharged] = useState(0);
  const [lowBalance, setLowBalance] = useState(false);
  const [offlineFor, setOfflineFor] = useState(0);
  const [menu, setMenu] = useState(false);
  const ended = useRef(false);
  const paidMinutes = useRef(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [video, setVideo] = useState(startVideo);
  const [invisible, setInvisible] = useState(false);
  const [filter, setFilter] = useState('none');
  const [sheet, setSheet] = useState(null); // 'filters' | 'music' | 'gift'
  const [song, setSong] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [toast, setToast] = useState(null);
  const toastAnim = useRef(new Animated.Value(0)).current;

  const finish = (status, extra = {}) => {
    if (ended.current) return;
    ended.current = true;
    const minutes = Math.ceil(secs / 60);
    const type = video ? 'video' : 'voice';
    const duration = secs > 0 ? fmt(secs) : null;
    const photo = other.photo || other.photos?.[0];

    if (incoming) {
      if (secs > 0) {
        addEarning({
          source: type,
          from: other.name,
          photo,
          minutes,
          coins: minutes * hostRates[type],
          agency: hostAgency,
          detail: `${minutes} min × ${hostRates[type]} coins`,
        });
      }
      addCall({
        name: other.name,
        photo,
        type,
        dir: 'incoming',
        status,
        duration,
        coins: 0,
      });
    } else {
      addCall({
        name: random ? 'Random match' : other.name,
        photo,
        type,
        dir: 'outgoing',
        status,
        duration,
        coins: charged,
        random,
      });
      if (charged > 0) {
        addTransaction({
          type: 'call',
          title: `${video ? 'Video' : 'Voice'} call · ${other.name}`,
          sub: `${minutes} min × ${rate} coins`,
          amount: -charged,
        });
      }
    }
    navigation.replace('CallEnded', {
      user: other,
      status,
      duration,
      coins: charged,
      earned: incoming
        ? split({
            source: type,
            coins: minutes * hostRates[type],
            agency: hostAgency,
          }).net
        : 0,
      incoming,
      video,
      random,
      ...extra,
    });
  };

  // Ringing → connected, or not answered when the host is offline/busy.
  useEffect(() => {
    if (phase !== 'ringing') return;
    const answers = random || other.online !== false;
    const t = setTimeout(
      () => (answers ? setPhase('connected') : finish('no_answer')),
      answers ? 2000 : RING_TIMEOUT,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Call timer: only counts while actually connected.
  useEffect(() => {
    if (!connected) return;
    const i = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(i);
  }, [connected]);

  // Billing: each connected minute is paid at its start (0:00, 1:00, 2:00 …).
  // If the next minute can't be paid, the call ends on its own.
  useEffect(() => {
    const minute = Math.floor(secs / 60) + 1;
    if (!connected || incoming || minute <= paidMinutes.current) return;
    paidMinutes.current = minute;
    if (!spendCoins(rate)) {
      finish('balance');
      return;
    }
    setCharged(c => c + rate);
    setLowBalance(getCoins() < rate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secs, connected]);

  // Network loss: pause the call (and billing), give it time to recover.
  useEffect(() => {
    return NetInfo.addEventListener(state => {
      const online = state.isConnected && state.isInternetReachable !== false;
      setPhase(p => {
        if (p === 'connected' && !online) return 'reconnecting';
        if (p === 'reconnecting' && online) return 'connected';
        return p;
      });
    });
  }, []);

  useEffect(() => {
    if (phase !== 'reconnecting') {
      setOfflineFor(0);
      return;
    }
    const i = setInterval(() => setOfflineFor(s => s + 1), 1000);
    return () => clearInterval(i);
  }, [phase]);

  useEffect(() => {
    if (offlineFor >= RECONNECT_TIMEOUT) finish('dropped');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineFor]);

  useEffect(() => {
    if (!connected) return;
    const t = setTimeout(() => showGift(GIFTS[0], other.name), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  const showGift = (g, from) => {
    setToast({ g, from });
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToast(null));
  };

  // Hanging up while still ringing is a cancelled call (never charged).
  const end = () => finish(phase === 'ringing' ? 'cancelled' : 'completed');
  const block = () => {
    setMenu(false);
    finish(phase === 'ringing' ? 'cancelled' : 'completed', { blocked: true });
  };
  const statusText =
    phase === 'ringing'
      ? random
        ? 'Connecting…'
        : 'Ringing…'
      : phase === 'reconnecting'
      ? 'Reconnecting…'
      : fmt(secs);
  const tint = FILTERS.find(f => f.key === filter).tint;
  const photo = other.photo || other.photos?.[0];

  return (
    <View style={styles.root}>
      {/* Remote stream placeholder */}
      {video ? (
        <Image
          source={{ uri: photo }}
          style={StyleSheet.absoluteFill}
          blurRadius={connected ? 0 : 18}
        />
      ) : (
        <LinearGradient
          colors={['#121212', '#121212']}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: tint }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.55)',
          'transparent',
          'transparent',
          'rgba(0,0,0,0.7)',
        ]}
        locations={[0, 0.25, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {!video ? (
        <View style={styles.audioCenter}>
          <Avatar uri={photo} size={150} ring />
          <Txt style={styles.audioName}>{other.name}</Txt>
          <Txt variant="body" color="rgba(255,255,255,0.75)">
            {statusText}
          </Txt>
        </View>
      ) : null}

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton
          icon={ChevronDown}
          variant="glass"
          size={38}
          onPress={end}
        />
        <View style={styles.who}>
          <Avatar uri={photo} size={36} online />
          <View>
            <Txt style={styles.whoName}>
              {other.name}
              {other.age ? `, ${other.age}` : ''}
            </Txt>
            <Txt style={styles.whoSub}>{statusText}</Txt>
          </View>
        </View>
        <View style={styles.rate}>
          {incoming ? (
            <Txt style={styles.rateText}>Earning {inr(earnRate)}/min</Txt>
          ) : (
            <>
              <CoinIcon size={14} />
              <Txt style={styles.rateText}>{rate}/min</Txt>
            </>
          )}
        </View>
        <IconButton
          icon={Flag}
          variant="glass"
          size={34}
          iconSize={16}
          onPress={() => setMenu(true)}
        />
      </View>

      {/* Self view */}
      {video ? (
        <View style={[styles.pip, { top: insets.top + 64 }]}>
          {invisible ? (
            <View style={styles.pipOff}>
              <VideoOff size={22} color={colors.white} />
              <Txt style={styles.pipOffText}>Invisible</Txt>
            </View>
          ) : (
            <Image
              source={{ uri: me.photos[0] }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.pipTag}>
            <Txt style={styles.pipTagText}>YOU</Txt>
          </View>
        </View>
      ) : null}

      {/* Right rail */}
      <View style={[styles.rail, !connected && styles.hidden]}>
        {video ? (
          <SideButton
            icon={WandSparkles}
            label="Filter"
            active={filter !== 'none'}
            onPress={() => setSheet('filters')}
          />
        ) : null}
        {video ? (
          <SideButton
            icon={invisible ? VideoOff : Video}
            label={invisible ? 'Hidden' : 'Camera'}
            active={invisible}
            onPress={() => setInvisible(v => !v)}
          />
        ) : null}
        <SideButton
          icon={Music}
          label="Music"
          active={playing}
          badge={playing}
          onPress={() => setSheet('music')}
        />
        <SideButton icon={Gift} label="Gift" onPress={() => setSheet('gift')} />
      </View>

      {/* Gift toast */}
      {toast ? (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateX: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-260, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Txt style={{ fontSize: 30 }}>{toast.g.emoji}</Txt>
          <View>
            <Txt style={styles.toastTitle}>
              {toast.from} sent a {toast.g.name}!
            </Txt>
            <Txt style={styles.toastSub}>+{toast.g.coins} coins</Txt>
          </View>
        </Animated.View>
      ) : null}

      {/* Now playing */}
      {song ? (
        <View style={styles.nowPlaying}>
          <Music size={14} color={colors.white} />
          <Txt style={styles.npText} numberOfLines={1}>
            {song.title} · {song.artist}
          </Txt>
          <Pressable onPress={() => setPlaying(p => !p)} hitSlop={8}>
            {playing ? (
              <Pause size={16} color={colors.white} />
            ) : (
              <Play size={16} color={colors.white} />
            )}
          </Pressable>
        </View>
      ) : null}

      {/* Reconnecting */}
      {phase === 'reconnecting' ? (
        <View style={styles.reconnect}>
          <WifiOff size={30} color={colors.white} />
          <Txt style={styles.reconnectTitle}>Weak connection</Txt>
          <Txt style={styles.reconnectSub}>
            Reconnecting… billing is paused. Call ends in{' '}
            {RECONNECT_TIMEOUT - offlineFor}s if the network doesn't return.
          </Txt>
        </View>
      ) : null}

      {/* Low balance */}
      {lowBalance && connected && !incoming ? (
        <View style={[styles.lowBalance, { top: insets.top + 64 }]}>
          <TriangleAlert size={16} color="#FFB020" />
          <Txt style={styles.lowBalanceText}>
            Low balance: this is your last paid minute.
          </Txt>
          <Txt
            style={styles.lowBalanceLink}
            onPress={() => navigation.navigate('Wallet')}
          >
            Recharge
          </Txt>
        </View>
      ) : null}

      {/* Controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.controlBar}>
          <IconButton
            icon={muted ? MicOff : Mic}
            variant={muted ? 'light' : 'glass'}
            color={muted ? colors.ink : undefined}
            size={52}
            onPress={() => setMuted(m => !m)}
          />
          <IconButton
            icon={Volume2}
            variant={speaker ? 'glass' : 'light'}
            color={speaker ? undefined : colors.ink}
            size={52}
            onPress={() => setSpeaker(s => !s)}
          />
          {video ? (
            <IconButton icon={SwitchCamera} variant="glass" size={52} />
          ) : (
            <IconButton
              icon={Video}
              variant="glass"
              size={52}
              onPress={() => setVideo(true)}
            />
          )}
          <IconButton
            icon={PhoneOff}
            variant="gradient"
            gradient={['#E5383B', '#E5383B']}
            size={64}
            iconSize={28}
            onPress={end}
          />
        </View>
      </View>

      <Sheet
        visible={sheet === 'filters'}
        onClose={() => setSheet(null)}
        title="Beauty filters"
        dark
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingBottom: 8 }}
        >
          {FILTERS.map(f => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={{ alignItems: 'center', gap: 6 }}
            >
              <View
                style={[
                  styles.filterThumb,
                  filter === f.key && { borderColor: colors.primary },
                ]}
              >
                <Image
                  source={{ uri: me.photos[0] }}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  style={[StyleSheet.absoluteFill, { backgroundColor: f.tint }]}
                />
              </View>
              <Txt
                style={[
                  styles.filterLabel,
                  filter === f.key && { color: colors.primary },
                ]}
              >
                {f.label}
              </Txt>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={sheet === 'music'}
        onClose={() => setSheet(null)}
        title="Play music"
        dark
      >
        <Txt
          variant="small"
          color="rgba(255,255,255,0.6)"
          style={{ marginTop: -8, marginBottom: 10 }}
        >
          Both of you will hear the song during the call.
        </Txt>
        {SONGS.map(s => {
          const active = song?.id === s.id;
          return (
            <Pressable
              key={s.id}
              style={[
                styles.song,
                active && { backgroundColor: 'rgba(255,61,119,0.16)' },
              ]}
              onPress={() => {
                setSong(s);
                setPlaying(true);
              }}
            >
              <LinearGradient colors={colors.gradient} style={styles.songArt}>
                <Music size={18} color={colors.white} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Txt style={styles.songTitle}>{s.title}</Txt>
                <Txt style={styles.songArtist}>
                  {s.artist} · {s.duration}
                </Txt>
              </View>
              {active && playing ? (
                <Pause size={20} color={colors.primary} />
              ) : (
                <Play size={20} color="rgba(255,255,255,0.7)" />
              )}
            </Pressable>
          );
        })}
        <Pressable style={styles.uploadSong}>
          <SkipForward size={16} color={colors.white} />
          <Txt style={styles.songTitle}>Choose MP3 from device</Txt>
        </Pressable>
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)} dark>
        <ListRow
          icon={Flag}
          title={`Report ${other.name}`}
          subtitle="Nudity, abuse, harassment, fake profile…"
          onPress={() => {
            setMenu(false);
            navigation.navigate('Report', { name: other.name });
          }}
          dark
        />
        <ListRow
          icon={Ban}
          title={`Block ${other.name}`}
          subtitle="Ends the call. They can't call or message you again."
          danger
          last
          onPress={block}
          dark
        />
      </Sheet>

      <GiftSheet
        visible={sheet === 'gift'}
        onClose={() => setSheet(null)}
        to={other.name}
        onSend={g => showGift(g, 'You')}
        onRecharge={() => {
          setSheet(null);
          navigation.navigate('Wallet');
        }}
      />
    </View>
  );
}

const glass = {
  backgroundColor: 'rgba(17,10,26,0.42)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.14)',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14091F' },
  audioCenter: {
    position: 'absolute',
    top: '24%',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 6,
  },
  audioName: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    lineHeight: 36,
    color: colors.white,
    marginTop: 14,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  who: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...glass,
    borderRadius: 24,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
  },
  whoName: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  whoSub: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.8)',
  },
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    ...glass,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
  },
  rateText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.white },
  pip: {
    position: 'absolute',
    right: 14,
    width: 104,
    height: 146,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: '#2A2035',
  },
  pipOff: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pipOffText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.white },
  pipTag: {
    position: 'absolute',
    left: 6,
    top: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  pipTagText: { fontFamily: fonts.bold, fontSize: 9, color: colors.white },
  rail: { position: 'absolute', right: 12, bottom: 150, gap: 14 },
  hidden: { opacity: 0 },
  reconnect: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '36%',
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(17,10,26,0.82)',
  },
  reconnectTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.white,
  },
  reconnectSub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  lowBalance: {
    position: 'absolute',
    left: 14,
    right: 130,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(17,10,26,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.5)',
  },
  lowBalanceText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.white,
  },
  lowBalanceLink: { fontFamily: fonts.bold, fontSize: 12, color: '#FFB020' },
  side: { alignItems: 'center', gap: 4 },
  sideIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...glass,
  },
  sideBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.online,
  },
  sideLabel: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    color: colors.white,
  },
  toast: {
    position: 'absolute',
    left: 14,
    bottom: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 30,
    backgroundColor: 'rgba(255,61,119,0.85)',
  },
  toastTitle: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.white },
  toastSub: { fontFamily: fonts.semibold, fontSize: 11, color: '#FFE7B3' },
  nowPlaying: {
    position: 'absolute',
    left: 14,
    bottom: 140,
    maxWidth: '62%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...glass,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
  },
  npText: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.white,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    ...glass,
    borderRadius: 40,
    paddingVertical: 10,
  },
  filterThumb: {
    width: 70,
    height: 90,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  filterLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.white,
  },
  song: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
  },
  songArt: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  songTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  songArtist: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  uploadSong: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderStyle: 'dashed',
  },
});
