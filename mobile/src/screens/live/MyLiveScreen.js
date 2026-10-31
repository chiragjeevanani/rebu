// Your own live broadcast: camera, viewer chat, gifts, join requests
// (accept up to 2 guests on video) and an end-live confirmation.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  ChevronRight,
  Ellipsis,
  Eye,
  Gem,
  Hand,
  MessageCircleMore,
  Mic,
  MicOff,
  Send,
  Share2,
  SwitchCamera,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react-native';
import { colors, fonts } from '../../theme';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Avatar from '../../components/Avatar';
import Txt from '../../components/Txt';
import Sheet from '../../components/Sheet';
import Button from '../../components/Button';
import ListRow from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';
import { giftText } from '../../utils/gifts';
import { RtcSurfaceView, RtcTextureView } from 'react-native-agora';
import { get, post } from '../../api/client';
import { useSocketEvent } from '../../api/socket';
import { useAgoraChannel } from '../../media/agora';
import { hapticLight } from '../../utils/haptics';

const MAX_GUESTS = 2;

// Demo audience until the streaming backend exists.
const clock = s =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(
    2,
    '0',
  )}`;

export default function MyLiveScreen({ navigation, route }) {
  useSecureScreen();
  const insets = useSafeAreaInsets();
  const { user, refreshHostMoney } = useApp();
  const { title, premium, ticket, allowGuests, cover } = route.params;

  const [liveId, setLiveId] = useState(null);
  const [agora, setAgora] = useState(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [gifters, setGifters] = useState({});
  const [chat, setChat] = useState([
    {
      id: 's',
      system: true,
      text: 'You started a live. Be kind and keep it safe — it’s moderated.',
    },
  ]);
  const [requests, setRequests] = useState([]);
  const [guests, setGuests] = useState([]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(null); // requests | more | end | gifters
  const [ending, setEnding] = useState(false);
  const scroll = useRef(null);
  const liveRef = useRef(null);
  const done = useRef(false);

  const rtc = useAgoraChannel(agora, { video: true });

  const say = entry =>
    setChat(c => [
      ...c.slice(-40),
      { id: entry.id || `${Date.now()}${Math.random()}`, ...entry },
    ]);
  const fromServer = m =>
    m.kind === 'gift'
      ? { id: m.id, name: m.user?.name, photo: m.user?.photo, gift: m.gift }
      : m.kind === 'system'
      ? { id: m.id, system: true, text: m.text }
      : { id: m.id, name: m.user?.name, photo: m.user?.photo, text: m.text };
  const person = (u, extra) => ({
    id: u.id,
    name: u.name,
    photo: u.photo,
    level: u.vip || 0,
    ...extra,
  });

  // Start the live on the server; it hands back a publisher token.
  useEffect(() => {
    (async () => {
      try {
        const r = await post('/lives', {
          mode: premium ? 'premium' : 'live',
          title,
          // A live this phone lost track of (app killed) is closed first.
          replace: true,
          allowGuests,
          ...(premium && { ticket }),
          ...(/^https?:/.test(cover || '') && { cover }),
        });
        liveRef.current = r.live.id;
        setLiveId(r.live.id);
        setAgora(r.agora);
      } catch (e) {
        Alert.alert('Couldn’t go live', e.message);
        navigation.goBack();
      }
    })();
    // Leaving the screen any other way still ends the live.
    return () => {
      if (!done.current && liveRef.current) {
        post(`/lives/${liveRef.current}/end`).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live timer
  useEffect(() => {
    if (!liveId) return;
    const t = setInterval(() => setSeconds(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [liveId]);

  const here = p => p?.liveId === liveRef.current;
  useSocketEvent('live:viewer_joined', p => {
    if (!here(p)) return;
    setViewers(p.viewers);
    say({ name: p.user?.name, photo: p.user?.photo, joined: true });
  });
  useSocketEvent('live:viewer_left', p => here(p) && setViewers(p.viewers));
  useSocketEvent('live:chat', p => {
    if (!here(p) || p.message.user?.id === user.id) return;
    say(fromServer(p.message));
  });
  useSocketEvent('live:gift', p => {
    if (!here(p)) return;
    setDiamonds(p.diamonds);
    say({ name: p.from?.name, photo: p.from?.photo, gift: p.gift });
    const id = p.from?.id;
    if (id) {
      setGifters(m => ({
        ...m,
        [id]: { ...person(p.from), coins: (m[id]?.coins || 0) + p.gift.coins },
      }));
    }
  });
  useSocketEvent('live:request', p => {
    if (!here(p)) return;
    say({ system: true, text: `${p.user.name} asked to join you on video.` });
  });
  useSocketEvent('live:requests', p => {
    if (!here(p)) return;
    setRequests(p.requests.map(r => person(r.user)));
  });
  useSocketEvent('live:guests', p => {
    if (!here(p)) return;
    setGuests(p.guests.map(g => person(g.user, { uid: g.uid, muted: g.muted })));
  });
  useSocketEvent('live:ended', p => {
    // Ended by moderation (or another device): show the summary.
    if (here(p) && !done.current) finishWith(null);
  });
  useSocketEvent('live:warning', p => {
    if (here(p)) Alert.alert('Warning from REBU', p.message || p.reason);
  });

  // Hardware back asks before ending.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSheet('end');
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const act = (path, okText) =>
    post(`/lives/${liveId}${path}`)
      .then(() => okText && say({ system: true, text: okText }))
      .catch(e => say({ system: true, text: e.message }));

  const accept = r => {
    if (guests.length >= MAX_GUESTS) return;
    hapticLight();
    act(`/requests/${r.id}/accept`, `${r.name} joined you on video 🎥`);
  };
  const decline = r => act(`/requests/${r.id}/decline`);
  const removeGuest = g =>
    act(`/guests/${g.id}/remove`, `${g.name} left the stage.`);

  const send = async () => {
    const t = text.trim();
    if (!t || !liveId) return;
    setText('');
    try {
      await post(`/lives/${liveId}/chat`, { text: t });
      say({ name: user.name.split(' ')[0], photo: user.photos[0], text: t, me: true });
    } catch (e) {
      setText(t);
      say({ system: true, text: e.message });
    }
  };

  const finishWith = async summary => {
    done.current = true;
    let sum = summary;
    if (!sum) {
      sum = await get(`/lives/${liveRef.current}/summary`)
        .then(r => r.summary)
        .catch(() => null);
    }
    refreshHostMoney();
    navigation.replace('LiveSummary', {
      ...(sum || { title, premium, seconds, diamonds }),
      cover,
    });
  };

  const end = async () => {
    setSheet(null);
    if (!liveId) {
      navigation.goBack();
      return;
    }
    setEnding(true);
    try {
      const r = await post(`/lives/${liveId}/end`);
      finishWith(r.summary);
    } catch (e) {
      setEnding(false);
      Alert.alert('Couldn’t end the live', e.message);
    }
  };

  const topGifters = Object.values(gifters).sort((a, b) => b.coins - a.coins);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {rtc.live ? (
        <RtcSurfaceView canvas={{ uid: 0 }} style={StyleSheet.absoluteFill} />
      ) : (
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.35)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.6)',
        ]}
        locations={[0, 0.18, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <View style={styles.me}>
          <Image source={{ uri: user.photos[0] }} style={styles.meAvatar} />
          <View style={styles.counts}>
            <View style={styles.count}>
              <Eye size={15} color={colors.white} />
              <Txt style={styles.countText}>{viewers}</Txt>
            </View>
            <Pressable
              style={styles.count}
              onPress={() => setSheet('gifters')}
              hitSlop={6}
            >
              <Gem size={14} color={colors.coin} />
              <Txt style={styles.countText}>{num(diamonds)}</Txt>
              <ChevronRight size={15} color={colors.white} />
            </Pressable>
          </View>
        </View>
        <View style={styles.flex} />
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Txt style={styles.liveText}>LIVE {clock(seconds)}</Txt>
        </View>
        <Pressable
          hitSlop={8}
          onPress={() =>
            Share.share({
              message: `I’m live on REBU now: “${title}”. Come say hi!`,
            })
          }
        >
          <Share2 size={23} color={colors.white} />
        </Pressable>
        <Pressable hitSlop={8} onPress={() => setSheet('end')}>
          <X size={27} color={colors.white} />
        </Pressable>
      </View>

      {premium ? (
        <View style={[styles.ticket, { top: insets.top + 64 }]}>
          <Txt style={styles.ticketText}>🎟 Premium · {ticket} coins</Txt>
        </View>
      ) : null}

      {/* Guests on video */}
      <View style={[styles.guests, { top: insets.top + 100 }]}>
        {guests.map(g => (
          <View key={g.id} style={styles.guest}>
            <Image source={{ uri: g.photo }} style={StyleSheet.absoluteFill} />
            {rtc.live && rtc.remoteUids.includes(g.uid) ? (
              <RtcTextureView
                canvas={{ uid: g.uid }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <View style={styles.guestName}>
              <Txt style={styles.guestNameText}>{g.name}</Txt>
            </View>
            <Pressable
              style={styles.guestClose}
              onPress={() => removeGuest(g)}
              hitSlop={6}
            >
              <X size={14} color={colors.white} strokeWidth={3} />
            </Pressable>
          </View>
        ))}
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.bottom}>
        <ScrollView
          ref={scroll}
          style={styles.chat}
          contentContainerStyle={styles.chatContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scroll.current?.scrollToEnd({ animated: true })
          }
        >
          {chat.map(m =>
            m.system ? (
              <Txt key={m.id} style={styles.system}>
                {m.text}
              </Txt>
            ) : (
              <View key={m.id} style={styles.msg}>
                <Image source={{ uri: m.photo }} style={styles.msgAvatar} />
                <Txt style={styles.msgLine}>
                  <Txt style={[styles.msgName, m.me && styles.msgNameMe]}>
                    {m.name}{' '}
                  </Txt>
                  {m.joined ? (
                    <Txt style={styles.msgMuted}>joined</Txt>
                  ) : m.followed ? (
                    <Txt style={styles.msgMuted}>followed you ❤️</Txt>
                  ) : m.gift ? (
                    <Txt style={styles.msgGift}>
                      sent {giftText(m.gift)}
                    </Txt>
                  ) : (
                    <Txt style={styles.msgText}>{m.text}</Txt>
                  )}
                </Txt>
              </View>
            ),
          )}
        </ScrollView>

        {typing ? (
          <View
            style={[
              styles.inputRow,
              { paddingBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <TextInput
              autoFocus
              value={text}
              onChangeText={setText}
              onSubmitEditing={send}
              onBlur={() => !text && setTyping(false)}
              placeholder="Say something…"
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.input}
            />
            <Pressable style={styles.sendBtn} onPress={send}>
              <Send size={19} color={colors.white} />
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable style={styles.say} onPress={() => setTyping(true)}>
              <MessageCircleMore size={20} color="rgba(255,255,255,0.8)" />
              <Txt style={styles.sayText}>Say something…</Txt>
            </Pressable>
            <View
              style={[
                styles.tools,
                { paddingBottom: Math.max(insets.bottom, 10) },
              ]}
            >
              {[
                {
                  key: 'invite',
                  label: 'Invite',
                  icon: UserPlus,
                  onPress: () =>
                    Share.share({
                      message: `Join my live on REBU: “${title}”`,
                    }),
                },
                {
                  key: 'requests',
                  label: 'Requests',
                  icon: Hand,
                  badge: requests.length,
                  onPress: () => setSheet('requests'),
                  disabled: !allowGuests,
                },
                {
                  key: 'flip',
                  label: 'Flip',
                  icon: SwitchCamera,
                  onPress: () =>
                    rtc.switchCamera(),
                },
                {
                  key: 'mic',
                  label: muted ? 'Unmute' : 'Mute',
                  icon: muted ? MicOff : Mic,
                  onPress: () =>
                    setMuted(m => {
                      rtc.setMuted(!m);
                      return !m;
                    }),
                },
                {
                  key: 'more',
                  label: 'More',
                  icon: Ellipsis,
                  onPress: () => setSheet('more'),
                },
              ]
                .filter(t => !t.disabled)
                .map(t => (
                  <Pressable
                    key={t.key}
                    style={styles.tool}
                    onPress={t.onPress}
                  >
                    <View>
                      <t.icon size={25} color={colors.white} />
                      {t.badge ? (
                        <View style={styles.badge}>
                          <Txt style={styles.badgeText}>{t.badge}</Txt>
                        </View>
                      ) : null}
                    </View>
                    <Txt style={styles.toolText}>{t.label}</Txt>
                  </Pressable>
                ))}
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Join requests */}
      <Sheet
        visible={sheet === 'requests'}
        onClose={() => setSheet(null)}
        title={`Join requests · ${guests.length}/${MAX_GUESTS} on stage`}
        dark
      >
        {requests.length === 0 ? (
          <Txt style={styles.sheetEmpty}>No requests right now.</Txt>
        ) : (
          requests.map(r => (
            <View key={r.id} style={styles.reqRow}>
              <Avatar uri={r.photo} size={44} />
              <View style={styles.flex}>
                <Txt style={styles.reqName}>{r.name}</Txt>
                <Txt style={styles.reqSub}>
                  {r.level ? `VIP ${r.level}` : 'Viewer'}
                </Txt>
              </View>
              <Pressable style={styles.decline} onPress={() => decline(r)}>
                <Txt style={styles.declineText}>Decline</Txt>
              </Pressable>
              <Pressable
                style={[
                  styles.accept,
                  guests.length >= MAX_GUESTS && styles.acceptOff,
                ]}
                onPress={() => accept(r)}
                disabled={guests.length >= MAX_GUESTS}
              >
                <Txt style={styles.acceptText}>
                  {guests.length >= MAX_GUESTS ? 'Full' : 'Accept'}
                </Txt>
              </Pressable>
            </View>
          ))
        )}
      </Sheet>

      {/* Top gifters */}
      <Sheet
        visible={sheet === 'gifters'}
        onClose={() => setSheet(null)}
        title="Top gifters"
        dark
      >
        {topGifters.length === 0 ? (
          <Txt style={styles.sheetEmpty}>
            No gifts yet — say hi to your viewers!
          </Txt>
        ) : (
          topGifters.map((g, i) => (
            <View key={g.id} style={styles.reqRow}>
              <Txt style={styles.rank}>{i + 1}</Txt>
              <Avatar uri={g.photo} size={44} />
              <Txt style={[styles.reqName, styles.flex]}>{g.name}</Txt>
              <Gem size={14} color={colors.coin} />
              <Txt style={styles.reqName}>{num(g.coins)}</Txt>
            </View>
          ))
        )}
      </Sheet>

      {/* More */}
      <Sheet
        visible={sheet === 'more'}
        onClose={() => setSheet(null)}
        title="More"
        dark
      >
        <ListRow
          dark
          icon={Trash2}
          iconColor={colors.white}
          title="Clear chat"
          onPress={() => {
            setChat([]);
            setSheet(null);
          }}
        />
        <ListRow
          dark
          icon={X}
          iconColor={colors.white}
          title="End live"
          last
          onPress={() => setSheet('end')}
        />
      </Sheet>

      {/* End live */}
      <Sheet visible={sheet === 'end'} onClose={() => setSheet(null)} dark>
        <Txt style={styles.endTitle}>End your live?</Txt>
        <View style={styles.endStats}>
          {[
            ['Time', clock(seconds)],
            ['Viewers', viewers],
            ['Diamonds', num(diamonds)],
          ].map(([k, v]) => (
            <View key={k} style={styles.endStat}>
              <Txt style={styles.endValue}>{v}</Txt>
              <Txt style={styles.endLabel}>{k}</Txt>
            </View>
          ))}
        </View>
        <Button title="End live" onPress={end} loading={ending} />
        <Button
          title="Keep going"
          variant="outline"
          color={colors.white}
          style={styles.keep}
          onPress={() => setSheet(null)}
        />
      </Sheet>
    </View>
  );
}

const glass = 'rgba(0,0,0,0.35)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingHorizontal: 14,
  },
  me: { gap: 8 },
  meAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.white,
  },
  counts: { gap: 6 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  live: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: glass,
    marginTop: -2,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  liveText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.white },
  ticket: {
    position: 'absolute',
    right: 14,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: glass,
    justifyContent: 'center',
  },
  ticketText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  guests: { position: 'absolute', right: 10, gap: 8 },
  guest: {
    width: 112,
    height: 160,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#222',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  guestName: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: glass,
  },
  guestNameText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.white,
  },
  guestClose: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  chat: { maxHeight: 260, width: '80%' },
  chatContent: { paddingHorizontal: 12, gap: 7, paddingBottom: 8 },
  system: {
    alignSelf: 'flex-start',
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#FFE08A',
    backgroundColor: glass,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  msg: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  msgAvatar: { width: 28, height: 28, borderRadius: 14 },
  msgLine: { flex: 1 },
  msgName: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.75)',
  },
  msgNameMe: { color: '#FFD54F' },
  msgText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  msgMuted: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.85)',
  },
  msgGift: { fontFamily: fonts.bold, fontSize: 14, color: '#FFD54F' },
  say: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 10,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: glass,
  },
  sayText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
  },
  tools: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    paddingHorizontal: 6,
  },
  tool: { alignItems: 'center', gap: 4, minWidth: 56 },
  toolText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.white },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.white },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  input: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 16,
    backgroundColor: glass,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.white,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetEmpty: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    paddingVertical: 18,
    textAlign: 'center',
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  reqAvatar: { width: 44, height: 44, borderRadius: 22 },
  reqName: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  reqSub: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.6)',
  },
  rank: { width: 18, fontFamily: fonts.bold, fontSize: 15, color: colors.coin },
  decline: { paddingHorizontal: 12, height: 34, justifyContent: 'center' },
  declineText: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.7)',
  },
  accept: {
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  acceptOff: { backgroundColor: 'rgba(255,255,255,0.15)' },
  acceptText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.white },
  endTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.white,
    textAlign: 'center',
    marginTop: 4,
  },
  endStats: { flexDirection: 'row', marginVertical: 22 },
  endStat: { flex: 1, alignItems: 'center', gap: 2 },
  endValue: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.white },
  endLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.6)',
  },
  keep: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
