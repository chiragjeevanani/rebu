// A host's live video room: viewers watch, chat, send gifts and can ask to join.
// The host can take up to 2 guests on video (shown as small windows on the right).
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  ChevronLeft,
  Eye,
  Gem,
  Gift,
  MessageCircleMore,
  Mic,
  MicOff,
  Plus,
  Send,
  Share2,
  Video,
  X,
} from 'lucide-react-native';
import { colors, fonts } from '../../theme';
import { GIFTS } from '../../data/mock';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Txt from '../../components/Txt';
import GiftSheet from '../../components/GiftSheet';
import { CoinIcon } from '../../components/CoinPill';
import { BIG_GIFT_COINS, useGiftFx } from '../../components/GiftFx';
import { compact } from '../../components/Live';
import { useSecureScreen } from '../../utils/secure';
import { RtcSurfaceView, RtcTextureView } from 'react-native-agora';
import { del, get, post } from '../../api/client';
import { useSocketEvent } from '../../api/socket';
import { useAgoraChannel } from '../../media/agora';

const MAX_GUESTS = 2;
const GOAL = 10000;

export default function LiveRoomScreen({ navigation, route }) {
  useSecureScreen();
  const { host } = route.params;
  const insets = useSafeAreaInsets();
  const fx = useGiftFx();
  const { user, following, toggleFollow, setCoinsFromServer } = useApp();
  const liveId = route.params.liveId || host.liveId;
  const [live, setLive] = useState(null);
  const [agora, setAgora] = useState(null);
  const [viewers, setViewers] = useState(0);
  const [diamonds, setDiamonds] = useState(0);
  const [chat, setChat] = useState([
    {
      id: 'w',
      system: true,
      text: `Welcome to ${host.name}'s live. Be respectful — rude chats are removed.`,
    },
  ]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [giftSheet, setGiftSheet] = useState(false);
  const [goal, setGoal] = useState(0);
  const [guests, setGuests] = useState([]);
  const [request, setRequest] = useState('idle'); // idle | pending
  const [muted, setMuted] = useState(false);
  const scroll = useRef(null);
  const left = useRef(false);

  const rtc = useAgoraChannel(agora, { video: live?.mode !== 'audio' });
  const ownerUid = live?.ownerUid;
  const hostUid = rtc.remoteUids.includes(ownerUid)
    ? ownerUid
    : rtc.remoteUids[0];

  const followingHost = following.includes(host.id);
  const meOnCall = guests.some(g => g.me);
  const maxGuests = live?.maxGuests || MAX_GUESTS;
  const seatsFull = guests.length >= maxGuests;

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
  const toGuests = list =>
    (list || []).map(g => ({
      id: g.user.id,
      name: g.user.id === user.id ? 'You' : g.user.name,
      photo: g.user.photo,
      me: g.user.id === user.id,
      uid: g.uid,
      muted: g.muted,
    }));

  // Join: the server charges premium tickets once, returns a viewer token.
  useEffect(() => {
    if (!liveId) return;
    (async () => {
      try {
        const j = await post(`/lives/${liveId}/join`);
        if (typeof j.balance === 'number') setCoinsFromServer(j.balance);
        const { live: d } = await get(`/lives/${liveId}`);
        setLive({ ...j.live, ...d });
        setViewers(d.viewers);
        setDiamonds(d.diamonds);
        setGuests(toGuests(d.guests));
        setChat(c => [...c, ...(d.chat || []).map(fromServer)]);
        setAgora(j.agora);
      } catch (e) {
        if (e.code === 'insufficient_coins') {
          navigation.replace('Wallet');
          return;
        }
        Alert.alert('Live unavailable', e.message);
        navigation.goBack();
      }
    })();
    return () => {
      if (!left.current) post(`/lives/${liveId}/leave`).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);

  const here = p => p?.liveId === liveId;
  useSocketEvent(
    'live:chat',
    p =>
      here(p) && p.message.user?.id !== user.id && say(fromServer(p.message)),
  );
  useSocketEvent('live:viewer_joined', p => {
    if (!here(p)) return;
    setViewers(p.viewers);
    if (p.user?.id !== user.id)
      say({ name: p.user?.name, photo: p.user?.photo, joined: true });
  });
  useSocketEvent('live:viewer_left', p => here(p) && setViewers(p.viewers));
  useSocketEvent('live:gift', p => {
    if (!here(p)) return;
    setDiamonds(p.diamonds);
    setGoal(g => g + (p.gift?.coins || 0));
    if (p.from?.id !== user.id)
      say({ name: p.from?.name, photo: p.from?.photo, gift: p.gift });
  });
  useSocketEvent('live:guests', p => here(p) && setGuests(toGuests(p.guests)));
  useSocketEvent('live:accepted', p => {
    if (!here(p)) return;
    setRequest('idle');
    setAgora(p.agora); // publisher token: camera + mic on
    say({
      system: true,
      text: `${host.name} accepted your request 🎉 You’re on video.`,
    });
  });
  useSocketEvent('live:declined', p => {
    if (!here(p)) return;
    setRequest('idle');
    say({
      system: true,
      text: `${host.name} can’t take you on video right now.`,
    });
  });
  useSocketEvent('live:removed', p => {
    if (!here(p)) return;
    if (p.agora) setAgora(p.agora);
    say({ system: true, text: 'You’re back to watching.' });
  });
  useSocketEvent('live:ended', p => {
    if (!here(p)) return;
    left.current = true;
    Alert.alert('Live ended', `${host.name} ended the live.`);
    navigation.goBack();
  });

  const leave = async note => {
    await post(`/lives/${liveId}/guests/${user.id}/remove`).catch(() => {});
    say({ system: true, text: note || 'You left the call.' });
  };

  const askToJoin = async () => {
    try {
      if (request === 'pending') {
        await del(`/lives/${liveId}/requests`);
        setRequest('idle');
        say({ system: true, text: 'Join request cancelled.' });
        return;
      }
      await post(`/lives/${liveId}/requests`);
      setRequest('pending');
      say({ system: true, text: `You asked to join ${host.name} on video.` });
    } catch (e) {
      say({ system: true, text: e.message });
    }
  };

  const sendGift = async g => {
    try {
      const r = await post('/gifts', {
        toId: host.id,
        giftKey: g.key,
        context: { type: 'live', id: liveId },
      });
      setCoinsFromServer(r.balance);
      onGiftSent(g);
      if (g.coins >= BIG_GIFT_COINS) fx.play(g, { to: host.name });
    } catch (e) {
      if (e.code === 'insufficient_coins') navigation.navigate('Wallet');
      else say({ system: true, text: e.message });
    }
  };
  const onGiftSent = g => say({ name: 'You', photo: user.photos[0], gift: g });

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await post(`/lives/${liveId}/chat`, { text: t });
      say({ name: 'You', photo: user.photos[0], text: t });
    } catch (e) {
      setText(t);
      say({ system: true, text: e.message });
    }
  };

  return (
    <View style={styles.root}>
      {rtc.live && hostUid ? (
        <RtcSurfaceView
          canvas={{ uid: hostUid }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Image
          source={{ uri: host.photos?.[1] || host.photo }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.45)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.7)',
        ]}
        locations={[0, 0.18, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top bar */}
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <ChevronLeft size={30} color={colors.white} />
        </Pressable>
        <View style={styles.flex} />
        <View style={styles.viewers}>
          <Eye size={17} color={colors.white} />
          <Txt style={styles.viewersText}>{viewers}</Txt>
        </View>
        <Pressable hitSlop={8} style={styles.topIcon}>
          <Share2 size={22} color={colors.white} />
        </Pressable>
      </View>

      {/* Gift goal + guest windows */}
      <View style={[styles.stage, { top: insets.top + 56 }]}>
        <View style={styles.goal}>
          <Txt style={styles.goalTitle}>Gift goal 🎯</Txt>
          <Txt style={styles.goalNum}>
            {num(Math.min(goal, GOAL))} / {num(GOAL)}
          </Txt>
          <View style={styles.goalTrack}>
            <View
              style={[
                styles.goalFill,
                { width: `${Math.min(goal / GOAL, 1) * 100}%` },
              ]}
            />
          </View>
        </View>
        <View style={styles.flex} />
        <View style={styles.guests}>
          {guests.map(g => (
            <View key={g.id} style={styles.guest}>
              {g.me && rtc.live ? (
                <RtcTextureView
                  canvas={{ uid: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : rtc.live && g.uid && rtc.remoteUids.includes(g.uid) ? (
                <RtcTextureView
                  canvas={{ uid: g.uid }}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                // Photo until their video arrives.
                <Image
                  source={{ uri: g.photo }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View style={styles.guestName}>
                <Txt style={styles.guestNameText}>{g.name}</Txt>
              </View>
              {g.me ? (
                <>
                  <Pressable
                    style={styles.guestClose}
                    onPress={() => leave()}
                    hitSlop={6}
                  >
                    <X size={14} color={colors.white} strokeWidth={3} />
                  </Pressable>
                  <Pressable
                    style={styles.guestMic}
                    onPress={() =>
                      setMuted(m => {
                        rtc.setMuted(!m);
                        return !m;
                      })
                    }
                    hitSlop={6}
                  >
                    {muted ? (
                      <MicOff size={14} color={colors.white} />
                    ) : (
                      <Mic size={14} color={colors.white} />
                    )}
                  </Pressable>
                </>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.bottom}>
        {/* Join request */}
        {!meOnCall ? (
          <Pressable
            style={[
              styles.join,
              request === 'pending' && styles.joinPending,
              seatsFull && styles.joinFull,
            ]}
            onPress={seatsFull ? undefined : askToJoin}
          >
            {request === 'pending' ? (
              <Check size={16} color={colors.ink} />
            ) : (
              <Video size={16} color={colors.white} />
            )}
            <Txt
              style={[
                styles.joinText,
                request === 'pending' && styles.joinTextPending,
              ]}
            >
              {seatsFull
                ? 'Seats full'
                : request === 'pending'
                ? 'Requested · tap to cancel'
                : 'Request to join'}
            </Txt>
          </Pressable>
        ) : null}

        {/* Live chat */}
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
                <View style={styles.flex}>
                  {m.joined ? (
                    <Txt style={styles.joined}>
                      <Txt style={styles.msgName}>{m.name}</Txt> started
                      watching
                    </Txt>
                  ) : (
                    <>
                      <Txt style={styles.msgName}>{m.name}</Txt>
                      <Txt style={[styles.msgText, m.gift && styles.msgGift]}>
                        {m.gift
                          ? `sent ${m.gift.emoji} ${m.gift.name}`
                          : m.text}
                      </Txt>
                    </>
                  )}
                </View>
              </View>
            ),
          )}
        </ScrollView>

        {/* Quick gifts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gifts}
        >
          {GIFTS.slice(0, 9).map(g => (
            <Pressable
              key={g.key}
              style={styles.giftItem}
              onPress={() => sendGift(g)}
            >
              <Txt style={styles.giftEmoji}>{g.emoji}</Txt>
              <View style={styles.giftPrice}>
                <CoinIcon size={11} />
                <Txt style={styles.giftPriceText}>{g.coins}</Txt>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {/* Bottom bar */}
        <View
          style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}
        >
          {typing ? (
            <>
              <TextInput
                autoFocus
                value={text}
                onChangeText={setText}
                onSubmitEditing={send}
                onBlur={() => !text && setTyping(false)}
                placeholder={`Say something to ${host.name}…`}
                placeholderTextColor="rgba(255,255,255,0.6)"
                style={styles.input}
              />
              <Pressable style={styles.circle} onPress={send}>
                <Send size={20} color={colors.white} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={styles.circle} onPress={() => setTyping(true)}>
                <MessageCircleMore size={22} color={colors.white} />
              </Pressable>
              <Pressable
                style={styles.hostPill}
                onPress={() => navigation.navigate('HostProfile', { host })}
              >
                <Image source={{ uri: host.photo }} style={styles.hostAvatar} />
                <View style={styles.flex}>
                  <Txt style={styles.hostName} numberOfLines={1}>
                    {host.name} {host.emoji || ''}
                  </Txt>
                  <View style={styles.hostDiamonds}>
                    <Gem size={11} color="rgba(255,255,255,0.8)" />
                    <Txt style={styles.hostDiamondText}>
                      {compact(diamonds)}
                    </Txt>
                  </View>
                </View>
                <Pressable
                  style={[styles.follow, followingHost && styles.followOn]}
                  onPress={() => toggleFollow(host.id)}
                  hitSlop={6}
                >
                  {followingHost ? (
                    <Check size={18} color={colors.ink} />
                  ) : (
                    <Plus size={20} color={colors.white} />
                  )}
                </Pressable>
              </Pressable>
              <Pressable
                style={[styles.circle, styles.giftBtn]}
                onPress={() => setGiftSheet(true)}
              >
                <Gift size={24} color={colors.ink} />
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <GiftSheet
        visible={giftSheet}
        to={host.name}
        onClose={() => setGiftSheet(false)}
        onSend={onGiftSent}
        toId={host.id}
        context={{ type: 'live', id: liveId }}
        onRecharge={() => {
          setGiftSheet(false);
          navigation.navigate('Wallet');
        }}
      />
    </View>
  );
}

const glass = 'rgba(0,0,0,0.35)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 14,
  },
  viewers: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  viewersText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
  },
  topIcon: { padding: 2 },
  stage: {
    position: 'absolute',
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  goal: { width: 120, padding: 10, borderRadius: 12, backgroundColor: glass },
  goalTitle: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  goalNum: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  goalTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 6,
    overflow: 'hidden',
  },
  goalFill: { height: 4, backgroundColor: colors.coin },
  guests: { gap: 8 },
  guest: {
    width: 118,
    height: 168,
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
  guestMic: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  join: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  joinPending: { backgroundColor: colors.white },
  joinFull: { backgroundColor: 'rgba(0,0,0,0.5)' },
  joinText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  joinTextPending: { color: colors.ink },
  chat: { maxHeight: 250, width: '82%' },
  chatContent: { paddingHorizontal: 12, gap: 8, paddingBottom: 6 },
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
  },
  msg: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  msgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  msgName: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.75)',
  },
  msgText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 19,
    color: colors.white,
  },
  msgGift: { color: '#FFD54F' },
  joined: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
  },
  gifts: { gap: 4, paddingHorizontal: 10, paddingTop: 8 },
  giftItem: { width: 54, alignItems: 'center' },
  giftEmoji: { fontSize: 30, lineHeight: 38 },
  giftPrice: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  giftPriceText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.white,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftBtn: { backgroundColor: colors.white },
  hostPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
    paddingRight: 4,
    height: 50,
    borderRadius: 25,
    backgroundColor: glass,
  },
  hostAvatar: { width: 42, height: 42, borderRadius: 21 },
  hostName: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  hostDiamonds: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hostDiamondText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.8)',
  },
  follow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followOn: { backgroundColor: colors.white },
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
});
