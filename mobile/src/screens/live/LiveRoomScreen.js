// A host's live video room: viewers watch, chat, send gifts and can ask to join.
// The host can take up to 2 guests on video (shown as small windows on the right).
import React, { useEffect, useRef, useState } from 'react';
import {
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
import { compact, hostStats } from '../../components/Live';
import { useSecureScreen } from '../../utils/secure';

const MAX_GUESTS = 2;
const GOAL = 10000;

// Demo viewers and lines so the room feels live until the backend exists.
const VIEWERS = [
  { name: 'Rahul', photo: 'https://i.pravatar.cc/200?img=11' },
  { name: 'Vikram', photo: 'https://i.pravatar.cc/200?img=13' },
  { name: 'Karan', photo: 'https://i.pravatar.cc/200?img=14' },
  { name: 'Aditya', photo: 'https://i.pravatar.cc/200?img=15' },
  { name: 'Sahil', photo: 'https://i.pravatar.cc/200?img=33' },
  { name: 'Dev', photo: 'https://i.pravatar.cc/200?img=52' },
];
const LINES = [
  'Hi 👋',
  'Hello from Pune!',
  'Your smile is so cute 😊',
  'Please accept my join request 🙏',
  'Which song are you listening to?',
  'Good evening everyone',
  'Miss you yaar ❤️',
  'Where are you from?',
  'Nice dress today ✨',
];
const pick = (list, n) => list[n % list.length];

export default function LiveRoomScreen({ navigation, route }) {
  useSecureScreen();
  const { host } = route.params;
  const insets = useSafeAreaInsets();
  const fx = useGiftFx();
  const {
    user,
    following,
    toggleFollow,
    spendCoins,
    getCoins,
    addTransaction,
  } = useApp();
  const { viewers: startViewers, diamonds } = hostStats(host);

  const [viewers, setViewers] = useState(startViewers || 12);
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
  const [goal, setGoal] = useState(2450);
  // One viewer already on video so the guest layout is visible.
  const [guests, setGuests] = useState([{ ...VIEWERS[1], id: 'g1' }]);
  const [request, setRequest] = useState('idle'); // idle | pending
  const [muted, setMuted] = useState(false);
  const tick = useRef(0);
  const scroll = useRef(null);

  const followingHost = following.includes(host.id);
  const meOnCall = guests.some(g => g.me);
  const seatsFull = guests.length >= MAX_GUESTS;

  const say = entry =>
    setChat(c => [
      ...c.slice(-30),
      { id: `${Date.now()}${Math.random()}`, ...entry },
    ]);

  // Simulated room activity.
  useEffect(() => {
    const t = setInterval(() => {
      tick.current += 1;
      const n = tick.current;
      const v = pick(VIEWERS, n * 3);
      if (n % 4 === 0) {
        say({ name: v.name, photo: v.photo, joined: true });
        setViewers(x => x + 1);
      } else {
        say({ name: v.name, photo: v.photo, text: pick(LINES, n * 7) });
      }
    }, 2600);
    return () => clearInterval(t);
  }, []);

  // Host accepts the join request (demo: after a short wait).
  useEffect(() => {
    if (request !== 'pending') return;
    const t = setTimeout(() => {
      setRequest('idle');
      if (guests.length >= MAX_GUESTS) {
        say({
          system: true,
          text: 'Both guest seats are taken. Try again in a bit.',
        });
        return;
      }
      setGuests(g => [
        ...g,
        { id: 'me', me: true, name: 'You', photo: user.photos[0] },
      ]);
      say({
        system: true,
        text: `${host.name} accepted your request 🎉 You’re on video.`,
      });
    }, 3200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Guests pay the host's video rate for every started minute on stage.
  useEffect(() => {
    if (!meOnCall) return;
    const charge = () => {
      if (!spendCoins(host.videoRate)) {
        leave('You ran out of coins, so you left the call.');
        return false;
      }
      addTransaction({
        type: 'call',
        title: `Live call · ${host.name}`,
        sub: '1 min on stage',
        amount: -host.videoRate,
      });
      return true;
    };
    if (!charge()) return;
    const t = setInterval(charge, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meOnCall]);

  const leave = note => {
    setGuests(g => g.filter(x => !x.me));
    say({ system: true, text: note || 'You left the call.' });
  };

  const askToJoin = () => {
    if (request === 'pending') {
      setRequest('idle');
      say({ system: true, text: 'Join request cancelled.' });
      return;
    }
    if (getCoins() < host.videoRate) {
      navigation.navigate('Wallet');
      return;
    }
    setRequest('pending');
    say({
      system: true,
      text: `You asked to join · ${host.videoRate} coins/min once accepted.`,
    });
  };

  const sendGift = g => {
    if (!spendCoins(g.coins)) {
      navigation.navigate('Wallet');
      return;
    }
    addTransaction({
      type: 'gift',
      title: `Gift · ${g.name} to ${host.name}`,
      sub: 'Live',
      amount: -g.coins,
    });
    onGiftSent(g);
    if (g.coins >= BIG_GIFT_COINS) fx.play(g, { to: host.name });
  };
  const onGiftSent = g => {
    setGoal(x => x + g.coins);
    say({ name: 'You', photo: user.photos[0], gift: g });
  };

  const send = () => {
    if (!text.trim()) return;
    say({ name: 'You', photo: user.photos[0], text: text.trim() });
    setText('');
  };

  return (
    <View style={styles.root}>
      <Image
        source={{ uri: host.photos?.[1] || host.photo }}
        style={StyleSheet.absoluteFill}
      />
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
              <Image
                source={{ uri: g.photo }}
                style={StyleSheet.absoluteFill}
              />
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
                    onPress={() => setMuted(m => !m)}
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
