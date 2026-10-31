import React, { useEffect, useRef, useState } from 'react';
import {
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
  MessageCircle,
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
  X,
} from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme';
import { SONGS } from '../../data/mock';
import { RtcSurfaceView } from 'react-native-agora';
import { post } from '../../api/client';
import { useSocketEvent } from '../../api/socket';
import { useAgoraChannel } from '../../media/agora';
import { inr, netPerMinute } from '../../data/economy';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import IconButton from '../../components/IconButton';
import GiftSheet from '../../components/GiftSheet';
import { useGiftFx } from '../../components/GiftFx';
import Sheet from '../../components/Sheet';
import { CoinIcon } from '../../components/CoinPill';
import ListRow from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';
import { OUTCOME } from '../../utils/calls';
import { activeCall } from '../../utils/callState';

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

export default function CallScreen({ navigation, route }) {
  useSecureScreen();
  const {
    user: firstUser,
    video: startVideo = true,
    random,
    incoming, // host side: the call was accepted on IncomingCallScreen
  } = route.params;
  const { user: me, hostRates, hostAgency } = useApp();
  const [other, setOther] = useState(firstUser);
  const insets = useSafeAreaInsets();
  const rate = startVideo ? other.videoRate || 40 : other.voiceRate || 20;
  const hostType = startVideo ? 'video' : 'voice';
  const earnRate = netPerMinute(hostRates[hostType], hostType, hostAgency);

  // The server owns the call: it rings the host, bills each minute and ends it.
  const [call, setCall] = useState(route.params.call || null);
  const [agora, setAgora] = useState(route.params.agora || null);
  const [phase, setPhase] = useState(incoming ? 'connected' : 'ringing');
  const connected = phase === 'connected';
  const [secs, setSecs] = useState(0);
  const [charged, setCharged] = useState(0);
  const [earned, setEarned] = useState(0);
  const [lowBalance, setLowBalance] = useState(false);
  const [netDown, setNetDown] = useState(false);
  const [menu, setMenu] = useState(false);
  const ended = useRef(false);
  const callRef = useRef(call);
  callRef.current = call;
  const pendingAcceptRef = useRef(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [video] = useState(startVideo);
  const [invisible, setInvisible] = useState(false);
  const [filter, setFilter] = useState('none');
  const [sheet, setSheet] = useState(null); // 'filters' | 'music' | 'gift'
  const fx = useGiftFx();
  const [song, setSong] = useState(null);
  const [playing, setPlaying] = useState(false);

  // Host side: more callers can join this call (same channel, billed separately).
  const [extras, setExtras] = useState([]); // [{ call, user, phase }]
  const extrasRef = useRef(extras);
  extrasRef.current = extras;
  const joinedExtras = extras.filter(x => x.phase === 'connected');
  const asking = extras.find(x => x.phase === 'ringing');
  // Chat messages that arrive during the call: a toast plus an inbox button.
  const [inbox, setInbox] = useState([]); // [{ user, text, count }]
  const [chatToast, setChatToast] = useState(null);
  const chatTimer = useRef(null);

  // Callers play only the host (other callers may share the host's channel).
  const rtc = useAgoraChannel(agora, {
    video: startVideo,
    only: incoming ? null : call?.hostUid,
  });
  const has = uid => (uid && rtc.remoteUids.includes(uid) ? uid : null);
  const remoteUid = incoming
    ? has(call?.callerUid) || rtc.remoteUids[0]
    : has(call?.hostUid);
  useEffect(() => {
    activeCall.hostInCall = !!incoming;
    return () => {
      activeCall.hostInCall = false;
      clearTimeout(chatTimer.current);
    };
  }, [incoming]);

  const finish = (status, extra = {}) => {
    if (ended.current) return;
    ended.current = true;
    navigation.replace('CallEnded', {
      user: other,
      status,
      duration: secs > 0 ? fmt(secs) : null,
      coins: extra.charged ?? charged,
      earned: extra.earned ?? earned,
      incoming,
      video,
      random,
      callId: callRef.current?.id,
      ...extra,
    });
  };

  // Start the call (caller side). Random matches arrive already started.
  useEffect(() => {
    if (incoming || route.params.call) return;
    let gone = false;
    (async () => {
      try {
        const r = random
          ? await post('/calls/random', { type: hostType })
          : await post('/calls', { hostId: other.id, type: hostType });
        if (gone) {
          post(`/calls/${r.call.id}/cancel`).catch(() => {});
          return;
        }
        setCall(r.call);
        setAgora(r.agora);
        if (pendingAcceptRef.current?.call?.id === r.call.id) {
          setCall(pendingAcceptRef.current.call);
          setPhase('connected');
        }
      } catch (e) {
        if (gone) return;
        if (e.code === 'insufficient_coins') {
          ended.current = true;
          navigation.replace('Wallet');
          return;
        }
        finish(
          e.code === 'host_busy' || e.code === 'host_offline'
            ? 'no_answer'
            : 'failed',
          {
            note: e.message,
          },
        );
      }
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving this screen any other way (back gesture, app reload) must never
  // leave a call running on the server and billing the user.
  useEffect(
    () => () => {
      for (const x of extrasRef.current) {
        const how = x.phase === 'ringing' ? 'decline' : 'end';
        post(`/calls/${x.call.id}/${how}`).catch(() => {});
      }
      const c = callRef.current;
      if (c && !ended.current) {
        // Connected → end; still ringing → cancel (the server rejects the other).
        post(`/calls/${c.id}/end`).catch(() =>
          post(`/calls/${c.id}/cancel`).catch(() => {}),
        );
      }
    },
    [],
  );

  const mine = p => p && callRef.current && p.callId === callRef.current.id;
  useSocketEvent('call:accepted', p => {
    if (callRef.current) {
      if (p?.call?.id === callRef.current.id) {
        setCall(p.call);
        setPhase('connected');
      }
    } else {
      pendingAcceptRef.current = p;
    }
  });
  useSocketEvent('call:tick', p => {
    if (!mine(p)) return;
    setCharged(p.charged);
    setLowBalance(p.balance < p.rate);
  });
  useSocketEvent('call:low_balance', p => mine(p) && setLowBalance(true));
  useSocketEvent('call:ended', p => {
    const extra = extrasRef.current.find(x => x.call.id === p?.callId);
    if (extra) {
      setExtras(l => l.filter(x => x !== extra));
      return;
    }
    if (!mine(p)) return;
    const next = extrasRef.current.find(x => x.phase === 'connected');
    if (incoming && next) {
      setExtras(l => l.filter(x => x !== next));
      setOther(next.user);
      setCall(next.call);
      setCharged(0);
      return;
    }
    finish(
      p.status === 'ended'
        ? OUTCOME[p.reason] || 'completed'
        : OUTCOME[p.reason] || p.status,
      {
        charged: p.charged ?? charged,
        earned: p.earned ?? earned,
        // The server's connected time is the one that was billed.
        ...(p.duration > 0 && { duration: fmt(p.duration) }),
      },
    );
  });
  useSocketEvent('call:incoming', p => {
    if (!incoming || !p?.joining || ended.current) return;
    const user = {
      ...p.caller,
      photos: p.caller.photos?.length ? p.caller.photos : [p.caller.photo],
    };
    setExtras(l =>
      l.some(x => x.call.id === p.call.id)
        ? l
        : [...l, { call: p.call, user, phase: 'ringing' }],
    );
  });
  useSocketEvent('chat:message', p => {
    const m = p?.message;
    if (!m || m.from === me.id || !p.from) return;
    const text =
      m.text || (m.imageUrl ? '📷 Photo' : m.gift ? '🎁 Gift' : 'New message');
    setInbox(l => [
      {
        user: p.from,
        text,
        count: (l.find(x => x.user.id === p.from.id)?.count || 0) + 1,
      },
      ...l.filter(x => x.user.id !== p.from.id),
    ]);
    setChatToast({ user: p.from, text });
    clearTimeout(chatTimer.current);
    chatTimer.current = setTimeout(() => setChatToast(null), 4000);
  });
  useSocketEvent('gift:received', p => {
    if (p?.context?.type !== 'call' || !incoming) return;
    fx.play(p.gift, { from: p.from?.name, photo: p.from?.photo });
  });

  // Connected time comes from the server's connect timestamp.
  useEffect(() => {
    if (!connected) return;
    const from = call?.connectedAt
      ? new Date(call.connectedAt).getTime()
      : Date.now();
    const tick = () =>
      setSecs(Math.max(0, Math.floor((Date.now() - from) / 1000)));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [connected, call?.connectedAt]);

  // Network banner only; the server ends the call if we stay away too long.
  useEffect(
    () =>
      NetInfo.addEventListener(st =>
        setNetDown(!(st.isConnected && st.isInternetReachable !== false)),
      ),
    [],
  );

  useEffect(() => {
    if (incoming && connected) setEarned(e => e);
  }, [incoming, connected]);

  const acceptExtra = async x => {
    try {
      const r = await post(`/calls/${x.call.id}/accept`);
      setExtras(l =>
        l.map(e =>
          e.call.id === x.call.id
            ? { ...e, call: r.call || e.call, phase: 'connected' }
            : e,
        ),
      );
    } catch {
      setExtras(l => l.filter(e => e.call.id !== x.call.id));
    }
  };
  const dropExtra = x => {
    setExtras(l => l.filter(e => e.call.id !== x.call.id));
    const how = x.phase === 'ringing' ? 'decline' : 'end';
    post(`/calls/${x.call.id}/${how}`).catch(() => {});
  };
  // Opens the chat on top of the call; the call keeps running underneath.
  const openChat = u => {
    setSheet(null);
    setChatToast(null);
    setInbox(l => l.map(x => (x.user.id === u.id ? { ...x, count: 0 } : x)));
    navigation.navigate('ChatRoom', {
      chat: {
        userId: u.id,
        name: u.name,
        photo: u.photo,
        online: !!u.host?.online,
        peer: u,
      },
    });
  };
  // Ending the first caller only: call:ended then hands over to a joined one.
  const dropFirst = () => {
    const c = callRef.current;
    if (c) post(`/calls/${c.id}/end`).catch(() => {});
  };
  const unread = inbox.reduce((n, x) => n + x.count, 0);

  // Hanging up: cancel while ringing, end once connected. The server's
  // call:ended event (or this response) moves us to the summary.
  const end = async () => {
    for (const x of extrasRef.current) dropExtra(x);
    const c = callRef.current;
    if (!c) return finish('cancelled');
    try {
      const r = await post(
        `/calls/${c.id}/${phase === 'ringing' && !incoming ? 'cancel' : 'end'}`,
      );
      const st = r.call?.status;
      if (st && st !== 'ringing' && st !== 'connected') {
        finish(phase === 'ringing' && !incoming ? 'cancelled' : 'completed', {
          charged: r.call.chargedCoins ?? charged,
        });
      }
    } catch {
      finish(phase === 'ringing' ? 'cancelled' : 'completed');
    }
  };
  const block = () => {
    setMenu(false);
    if (other.id) post(`/me/blocked/${other.id}`).catch(() => {});
    end();
  };
  const statusText =
    phase === 'ringing'
      ? random
        ? 'Connecting…'
        : 'Ringing…'
      : netDown
      ? 'Reconnecting…'
      : fmt(secs);
  const tint = FILTERS.find(f => f.key === filter).tint;
  const photo = other.photo || other.photos?.[0];

  return (
    <View style={styles.root}>
      {/* Remote stream placeholder; split screen when callers joined */}
      {video && connected && joinedExtras.length ? (
        <View style={StyleSheet.absoluteFill}>
          {[
            { user: other, uid: remoteUid },
            ...joinedExtras.map(x => ({
              user: x.user,
              uid: has(x.call.callerUid),
              extra: x,
            })),
          ].map(t => (
            <View key={t.user.id} style={styles.tile}>
              {t.uid ? (
                <RtcSurfaceView
                  canvas={{ uid: t.uid }}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Image
                  source={{ uri: t.user.photo || t.user.photos?.[0] }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              {/* Joined callers' tags sit at the top, clear of the controls. */}
              <View style={[styles.tileTag, t.extra && styles.tileTagTop]}>
                <Txt style={styles.tileName} numberOfLines={1}>
                  {t.user.name}
                </Txt>
                <Pressable
                  hitSlop={8}
                  onPress={() => (t.extra ? dropExtra(t.extra) : dropFirst())}
                >
                  <X size={14} color={colors.white} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : video && connected && remoteUid ? (
        <RtcSurfaceView
          canvas={{ uid: remoteUid }}
          style={StyleSheet.absoluteFill}
        />
      ) : video ? (
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
          <Avatar uri={photo} size={150} ring frame={other.senderTier} />
          <Txt style={styles.audioName}>{other.name}</Txt>
          {joinedExtras.length ? (
            <Txt variant="body" color={colors.white}>
              + {joinedExtras.map(x => x.user.name).join(', ')}
            </Txt>
          ) : null}
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
          <Avatar uri={photo} size={36} online frame={other.senderTier} />
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

      {/* Another caller wants to join (host side) */}
      {asking ? (
        <View
          style={[styles.joinCard, { top: insets.top + (video ? 222 : 60) }]}
        >
          <Avatar
            uri={asking.user.photo}
            size={40}
            frame={asking.user.senderTier}
          />
          <View style={styles.flex}>
            <Txt style={styles.joinName} numberOfLines={1}>
              {asking.user.name}
            </Txt>
            <Txt style={styles.joinSub}>Wants to join · billed separately</Txt>
          </View>
          <Pressable
            style={[styles.joinBtn, styles.joinNo]}
            onPress={() => dropExtra(asking)}
          >
            <X size={18} color={colors.white} />
          </Pressable>
          <Pressable
            style={[styles.joinBtn, styles.joinYes]}
            onPress={() => acceptExtra(asking)}
          >
            <Txt style={styles.joinYesText}>Accept</Txt>
          </Pressable>
        </View>
      ) : null}

      {/* Message toast */}
      {chatToast && !asking ? (
        <Pressable
          style={[styles.joinCard, { top: insets.top + (video ? 222 : 60) }]}
          onPress={() => openChat(chatToast.user)}
        >
          <Avatar uri={chatToast.user.photo} size={36} />
          <View style={styles.flex}>
            <Txt style={styles.joinName} numberOfLines={1}>
              {chatToast.user.name}
            </Txt>
            <Txt style={styles.joinSub} numberOfLines={1}>
              {chatToast.text}
            </Txt>
          </View>
          <MessageCircle size={18} color={colors.white} />
        </Pressable>
      ) : null}

      {/* Self view */}
      {video ? (
        <View style={[styles.pip, { top: insets.top + 64 }]}>
          {invisible ? (
            <View style={styles.pipOff}>
              <VideoOff size={22} color={colors.white} />
              <Txt style={styles.pipOffText}>Invisible</Txt>
            </View>
          ) : rtc.live ? (
            <RtcSurfaceView
              canvas={{ uid: 0 }}
              zOrderMediaOverlay
              style={StyleSheet.absoluteFill}
            />
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
            onPress={() =>
              setInvisible(v => {
                rtc.setCameraOn(v);
                return !v;
              })
            }
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
        {inbox.length ? (
          <SideButton
            icon={MessageCircle}
            label="Inbox"
            badge={unread > 0}
            onPress={() =>
              inbox.length === 1 ? openChat(inbox[0].user) : setSheet('inbox')
            }
          />
        ) : null}
      </View>

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
      {netDown && connected ? (
        <View style={styles.reconnect}>
          <WifiOff size={30} color={colors.white} />
          <Txt style={styles.reconnectTitle}>Weak connection</Txt>
          <Txt style={styles.reconnectSub}>
            Reconnecting… if the network doesn’t come back soon the call ends
            and you’re only charged for connected minutes.
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
            onPress={() =>
              setMuted(m => {
                rtc.setMuted(!m);
                return !m;
              })
            }
          />
          <IconButton
            icon={Volume2}
            variant={speaker ? 'glass' : 'light'}
            color={speaker ? undefined : colors.ink}
            size={52}
            onPress={() =>
              setSpeaker(sp => {
                rtc.setSpeaker(!sp);
                return !sp;
              })
            }
          />
          {video ? (
            <IconButton
              icon={SwitchCamera}
              variant="glass"
              size={52}
              onPress={rtc.switchCamera}
            />
          ) : null}
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
            navigation.navigate('Report', {
              name: other.name,
              targetType: incoming ? 'user' : 'host',
              targetId: other.id,
            });
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

      <Sheet
        visible={sheet === 'inbox'}
        onClose={() => setSheet(null)}
        title="Messages"
      >
        {inbox.map((x, i) => (
          <ListRow
            key={x.user.id}
            title={x.user.name}
            subtitle={x.text}
            right={
              x.count ? (
                <View style={styles.unread}>
                  <Txt style={styles.unreadText}>{x.count}</Txt>
                </View>
              ) : null
            }
            onPress={() => openChat(x.user)}
            last={i === inbox.length - 1}
          />
        ))}
      </Sheet>

      <GiftSheet
        visible={sheet === 'gift'}
        onClose={() => setSheet(null)}
        to={other.name}
        toId={incoming ? undefined : other.id}
        context={call ? { type: 'call', id: call.id } : undefined}
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
  tile: { flex: 1, overflow: 'hidden', backgroundColor: '#121212' },
  tileTag: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    maxWidth: '60%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  tileTagTop: { top: 12, bottom: undefined },
  tileName: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  joinCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(17,10,26,0.88)',
  },
  joinName: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  joinSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  joinBtn: {
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinNo: { width: 36, backgroundColor: '#E5383B' },
  joinYes: { paddingHorizontal: 16, backgroundColor: colors.success },
  joinYesText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  flex: { flex: 1 },
  unread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  unreadText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
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
