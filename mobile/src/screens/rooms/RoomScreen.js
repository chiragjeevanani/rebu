import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RtcSurfaceView, RtcTextureView } from 'react-native-agora';
import {
  ChevronDown,
  Flag,
  Gift,
  Hand,
  LogOut,
  Mic,
  MicOff,
  Plus,
  Send,
  Share2,
  Users,
  Video,
} from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme';
import { useApp } from '../../context/AppContext';
import { del, get, post } from '../../api/client';
import { useSocketEvent } from '../../api/socket';
import { useAgoraChannel } from '../../media/agora';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import GiftSheet from '../../components/GiftSheet';
import { useGiftFx } from '../../components/GiftFx';
import Sheet from '../../components/Sheet';
import ListRow from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';
import { giftText } from '../../utils/gifts';

function Seat({ index, person, pending, video, rtc, onPress }) {
  const remote = person && rtc.live && rtc.remoteUids.includes(person.uid);
  return (
    <Pressable style={styles.seat} onPress={onPress}>
      <View style={[styles.seatRing, pending && styles.seatPending]}>
        {person ? (
          video && (person.me || remote) && rtc.live ? (
            <View style={styles.seatImg}>
              <RtcTextureView
                canvas={{ uid: person.me ? 0 : person.uid }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          ) : (
            <Avatar uri={person.photo} size={54} />
          )
        ) : (
          <View style={styles.seatEmpty}>
            {pending ? (
              <Hand size={18} color="rgba(255,255,255,0.8)" />
            ) : (
              <Plus size={20} color="rgba(255,255,255,0.7)" />
            )}
          </View>
        )}
        {person?.muted ? (
          <View style={styles.seatMuted}>
            <MicOff size={10} color={colors.white} />
          </View>
        ) : null}
      </View>
      <Txt style={styles.seatName} numberOfLines={1}>
        {person ? person.name : pending ? 'Asked…' : `No.${index + 1}`}
      </Txt>
    </Pressable>
  );
}

export default function RoomScreen({ navigation, route }) {
  useSecureScreen();
  const { room: start } = route.params;
  const roomId = start.id;
  const { user, setCoinsFromServer } = useApp();
  const fx = useGiftFx();
  const insets = useSafeAreaInsets();

  const [room, setRoom] = useState(null); // server live
  const [agora, setAgora] = useState(route.params.agora || null);
  const [viewers, setViewers] = useState(start.count || 0);
  const [seats, setSeats] = useState(Array(start.seats || 8).fill(null));
  const [requests, setRequests] = useState([]); // owner: who asked
  const [asked, setAsked] = useState(null); // seat I asked for
  const [muted, setMuted] = useState(false);
  const [chat, setChat] = useState([
    {
      id: 'w',
      system: true,
      text: start.welcome || 'Welcome! Be kind and have fun 💜',
    },
  ]);
  const [text, setText] = useState('');
  const [gift, setGift] = useState(null); // recipient
  const [menu, setMenu] = useState(false);
  const [reqSheet, setReqSheet] = useState(false);
  const list = useRef(null);
  const left = useRef(false);

  const owner = room?.owner || start.owner || {};
  const isOwner = owner.id === user.id;
  const isVideo = (room?.mode || start.mode) === 'party';
  const rtc = useAgoraChannel(agora, { video: isVideo });
  const mySeat = seats.findIndex(s => s?.me);

  const say = entry => {
    setChat(c => [
      ...c.slice(-60),
      { id: entry.id || `${Date.now()}${Math.random()}`, ...entry },
    ]);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };
  const fromServer = m =>
    m.kind === 'gift'
      ? {
          id: m.id,
          name: m.user?.name,
          text: `sent ${giftText(m.gift)}`,
          gift: true,
        }
      : m.kind === 'system'
      ? { id: m.id, system: true, text: m.text }
      : { id: m.id, name: m.user?.name, text: m.text };
  const toSeats = (arr, n) =>
    (arr || Array(n).fill(null)).map(g =>
      g
        ? {
            id: g.user.id,
            name: g.user.id === user.id ? 'You' : g.user.name,
            photo: g.user.photo,
            uid: g.uid,
            muted: g.muted,
            me: g.user.id === user.id,
          }
        : null,
    );

  // Join (owners get a publisher token; everyone else listens).
  useEffect(() => {
    (async () => {
      try {
        const j = await post(`/lives/${roomId}/join`);
        if (typeof j.balance === 'number') setCoinsFromServer(j.balance);
        const { live } = await get(`/lives/${roomId}`);
        setRoom(live);
        setViewers(live.viewers);
        setSeats(toSeats(live.seats, live.maxGuests));
        setChat(c => [...c, ...(live.chat || []).map(fromServer)]);
        setAgora(j.agora);
      } catch (e) {
        Alert.alert('Room unavailable', e.message);
        left.current = true;
        navigation.goBack();
      }
    })();
    return () => {
      if (left.current) return;
      // Owners close the room when they leave it; listeners just leave.
      post(`/lives/${roomId}/${isOwnerRef.current ? 'end' : 'leave'}`).catch(
        () => {},
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);
  const isOwnerRef = useRef(isOwner);
  isOwnerRef.current = isOwner;

  const here = p => p?.liveId === roomId;
  useSocketEvent('live:chat', p => {
    if (here(p) && p.message.user?.id !== user.id) say(fromServer(p.message));
  });
  useSocketEvent('live:viewer_joined', p => {
    if (!here(p)) return;
    setViewers(p.viewers);
    if (p.user?.id !== user.id)
      say({ system: true, text: `${p.user?.name} joined the room` });
  });
  useSocketEvent('live:viewer_left', p => here(p) && setViewers(p.viewers));
  useSocketEvent('live:gift', p => {
    if (!here(p) || p.from?.id === user.id) return;
    say({
      name: p.from?.name,
      text: `sent ${giftText(p.gift)}`,
      gift: true,
    });
    fx.play(p.gift, { from: p.from?.name, photo: p.from?.photo });
  });
  useSocketEvent('live:guests', p => {
    if (!here(p)) return;
    setSeats(toSeats(p.seats, seats.length));
  });
  useSocketEvent('live:requests', p => {
    if (here(p)) setRequests(p.requests);
  });
  useSocketEvent('live:request', p => {
    if (here(p)) say({ system: true, text: `${p.user.name} asked for a seat` });
  });
  useSocketEvent('live:accepted', p => {
    if (!here(p)) return;
    setAsked(null);
    setAgora(p.agora); // publisher: mic (and camera in party rooms) on
    say({ system: true, text: 'You’re on a seat. Tap the mic to mute.' });
  });
  useSocketEvent('live:declined', p => {
    if (!here(p)) return;
    setAsked(null);
    say({ system: true, text: 'The host didn’t give you a seat this time.' });
  });
  useSocketEvent('live:removed', p => {
    if (!here(p)) return;
    if (p.agora) setAgora(p.agora);
    say({ system: true, text: 'You’re back to listening.' });
  });
  useSocketEvent('live:ended', p => {
    if (!here(p) || isOwner) return;
    left.current = true;
    Alert.alert('Room closed', `${owner.name} closed the room.`);
    navigation.goBack();
  });

  const act = (path, method = post) =>
    method(`/lives/${roomId}${path}`).catch(e =>
      say({ system: true, text: e.message }),
    );

  const tapSeat = async (p, i) => {
    if (p) {
      if (p.me) return act(`/guests/${user.id}/remove`);
      if (isOwner) {
        return Alert.alert(p.name, 'Take them off the seat?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', onPress: () => act(`/guests/${p.id}/remove`) },
        ]);
      }
      return setGift(p);
    }
    if (isOwner || mySeat >= 0) return;
    if (asked != null) {
      setAsked(null);
      return act('/requests', del);
    }
    try {
      await post(`/lives/${roomId}/requests`, { seat: i });
      setAsked(i);
      say({ system: true, text: `You asked for seat ${i + 1}.` });
    } catch (e) {
      say({ system: true, text: e.message });
    }
  };

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      await post(`/lives/${roomId}/chat`, { text: t });
      say({ name: 'You', text: t });
    } catch (e) {
      setText(t);
      say({ system: true, text: e.message });
    }
  };

  const exit = async () => {
    setMenu(false);
    // Owners close the room before leaving so the rooms list is already
    // up to date; listeners leave in the unmount cleanup.
    if (isOwner) {
      left.current = true;
      await post(`/lives/${roomId}/end`).catch(() => {});
    }
    navigation.goBack();
  };

  return (
    <LinearGradient colors={['#121212', '#121212']} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Image
          source={{ uri: room?.cover || start.cover }}
          style={styles.headerCover}
        />
        <View style={styles.flex}>
          <Txt style={styles.title} numberOfLines={1}>
            {room?.title || start.title}
          </Txt>
          <View style={styles.headerMeta}>
            <Users size={12} color="rgba(255,255,255,0.75)" />
            <Txt style={styles.headerMetaText}>
              {viewers + 1} online · {room?.category || start.category}
            </Txt>
          </View>
        </View>
        <IconButton
          icon={Share2}
          variant="glass"
          size={36}
          iconSize={16}
          onPress={() =>
            Share.share({
              message: `Join my room “${room?.title || start.title}” on REBU!`,
            })
          }
        />
        <IconButton
          icon={ChevronDown}
          variant="glass"
          size={36}
          iconSize={18}
          onPress={() => setMenu(true)}
        />
      </View>

      {/* Owner stage */}
      <View style={styles.stage}>
        {isVideo ? (
          <View style={styles.videoStage}>
            {rtc.live &&
            (isOwner || rtc.remoteUids.includes(room?.ownerUid)) ? (
              <RtcSurfaceView
                canvas={{ uid: isOwner ? 0 : room.ownerUid }}
                style={StyleSheet.absoluteFill}
              />
            ) : (
              <Image
                source={{ uri: owner.photo }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <View style={styles.liveTag}>
              <Video size={12} color={colors.white} />
              <Txt style={styles.liveText}>LIVE</Txt>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.ownerRing}
            onPress={() => (isOwner ? null : setGift(owner))}
          >
            <Avatar uri={owner.photo} size={96} />
          </Pressable>
        )}
        <Txt style={styles.ownerName}>👑 {isOwner ? 'You' : owner.name}</Txt>
      </View>

      <View style={styles.seats}>
        {seats.map((p, i) => (
          <Seat
            key={i}
            index={i}
            person={p}
            pending={!p && asked === i}
            video={isVideo}
            rtc={rtc}
            onPress={() => tapSeat(p, i)}
          />
        ))}
      </View>

      <FlatList
        ref={list}
        data={chat}
        keyExtractor={m => m.id}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        renderItem={({ item }) => (
          <View style={[styles.msg, item.system && styles.msgSystem]}>
            <Txt style={styles.msgText}>
              {item.system ? null : (
                <Txt style={[styles.msgName, item.gift && styles.msgGift]}>
                  {item.name}:{' '}
                </Txt>
              )}
              {item.text}
            </Txt>
          </View>
        )}
      />

      <KeyboardAvoidingView behavior="padding">
        <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
            placeholder="Say something…"
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={styles.input}
          />
          <IconButton
            icon={Send}
            variant="glass"
            size={42}
            iconSize={18}
            onPress={send}
          />
          {isOwner || mySeat >= 0 ? (
            <IconButton
              icon={muted ? MicOff : Mic}
              variant={muted ? 'light' : 'glass'}
              color={muted ? colors.ink : undefined}
              size={42}
              iconSize={19}
              onPress={() =>
                setMuted(m => {
                  rtc.setMuted(!m);
                  return !m;
                })
              }
            />
          ) : null}
          {isOwner ? (
            <View>
              <IconButton
                icon={Hand}
                variant="glass"
                size={42}
                iconSize={18}
                onPress={() => setReqSheet(true)}
              />
              {requests.length ? (
                <View style={styles.badge}>
                  <Txt style={styles.badgeText}>{requests.length}</Txt>
                </View>
              ) : null}
            </View>
          ) : (
            <IconButton
              icon={Gift}
              variant="gradient"
              gradient={colors.gradientWarm}
              size={42}
              iconSize={19}
              onPress={() => setGift(owner)}
            />
          )}
          <IconButton
            icon={LogOut}
            variant="glass"
            size={42}
            iconSize={18}
            onPress={() => setMenu(true)}
          />
        </View>
      </KeyboardAvoidingView>

      <GiftSheet
        to={gift?.name}
        toId={gift?.id}
        context={{ type: 'live', id: roomId }}
        visible={!!gift}
        onClose={() => setGift(null)}
        onSend={g =>
          say({
            name: 'You',
            text: `sent ${giftText(g)} to ${gift?.name}`,
            gift: true,
          })
        }
        onRecharge={() => {
          setGift(null);
          navigation.navigate('Wallet');
        }}
      />
      <Sheet
        visible={reqSheet}
        onClose={() => setReqSheet(false)}
        dark
        title="Seat requests"
      >
        {requests.length ? (
          requests.map(r => (
            <View key={r.user.id} style={styles.reqRow}>
              <Avatar uri={r.user.photo} size={40} />
              <Txt style={[styles.flex, styles.reqName]} numberOfLines={1}>
                {r.user.name}
                {r.seat != null ? ` · seat ${r.seat + 1}` : ''}
              </Txt>
              <Button
                title="No"
                size="sm"
                variant="dark"
                full={false}
                onPress={() => act(`/requests/${r.user.id}/decline`)}
              />
              <Button
                title="Seat"
                size="sm"
                full={false}
                onPress={() => act(`/requests/${r.user.id}/accept`)}
              />
            </View>
          ))
        ) : (
          <Txt style={styles.reqEmpty}>
            No one is waiting. Listeners tap an empty seat to ask.
          </Txt>
        )}
      </Sheet>
      <Sheet visible={menu} onClose={() => setMenu(false)} dark>
        {mySeat >= 0 ? (
          <ListRow
            dark
            icon={Mic}
            title="Leave my seat"
            subtitle="Stay in the room as a listener"
            onPress={() => {
              act(`/guests/${user.id}/remove`);
              setMenu(false);
            }}
          />
        ) : null}
        {isOwner ? null : (
          <ListRow
            dark
            icon={Flag}
            title="Report room"
            onPress={() => {
              setMenu(false);
              navigation.navigate('Report', {
                name: room?.title || start.title,
                targetType: 'room',
                targetId: roomId,
              });
            }}
          />
        )}
        <ListRow
          dark
          icon={LogOut}
          title={isOwner ? 'Close room' : 'Exit room'}
          subtitle={isOwner ? 'Everyone in the room will be removed' : null}
          danger
          last
          onPress={exit}
        />
      </Sheet>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  headerCover: { width: 44, height: 44, borderRadius: 12 },
  title: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  headerMetaText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
  stage: { alignItems: 'center', marginTop: 18 },
  videoStage: {
    width: '86%',
    aspectRatio: 16 / 10,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#2A2035',
  },
  liveTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.danger,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
  },
  liveText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  ownerRing: {
    padding: 4,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  ownerImg: { width: 96, height: 96, borderRadius: 48 },
  ownerName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
    marginTop: 8,
  },
  seats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginTop: 14,
  },
  seat: { width: '25%', alignItems: 'center', marginBottom: 12 },
  seatRing: {
    padding: 3,
    borderRadius: 34,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  seatPending: { borderColor: '#FFC94D' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  reqName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  reqEmpty: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: 'rgba(255,255,255,0.7)',
    paddingVertical: 12,
  },
  seatImg: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden' },
  seatEmpty: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatMuted: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatName: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    maxWidth: 76,
  },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 14, gap: 6, paddingBottom: 8 },
  msg: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  msgSystem: { backgroundColor: 'rgba(255,61,119,0.25)' },
  msgText: {
    fontFamily: fonts.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.white,
  },
  msgName: { fontFamily: fonts.bold, fontSize: 13.5, color: '#FFC94D' },
  msgGift: { color: '#FF8FB8' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    fontFamily: fonts.medium,
    fontSize: 14.5,
    color: colors.white,
  },
});
