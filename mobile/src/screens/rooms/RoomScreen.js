import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  Flag,
  Gift,
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
import { HOSTS } from '../../data/mock';
import { ROOM_CHAT } from '../../data/social';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import IconButton from '../../components/IconButton';
import GiftSheet from '../../components/GiftSheet';
import Sheet from '../../components/Sheet';
import ListRow from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';

const SEATS = 8;
const LISTENERS = HOSTS.slice(1, 6);

function Seat({ index, person, speaking, onPress }) {
  return (
    <Pressable style={styles.seat} onPress={onPress}>
      <View style={[styles.seatRing, speaking && styles.seatSpeaking]}>
        {person ? (
          <Image source={{ uri: person.photo }} style={styles.seatImg} />
        ) : (
          <View style={styles.seatEmpty}>
            <Plus size={20} color="rgba(255,255,255,0.7)" />
          </View>
        )}
        {person?.muted ? (
          <View style={styles.seatMuted}>
            <MicOff size={10} color={colors.white} />
          </View>
        ) : null}
      </View>
      <Txt style={styles.seatName} numberOfLines={1}>
        {person ? person.name : `No.${index + 1}`}
      </Txt>
    </Pressable>
  );
}

export default function RoomScreen({ navigation, route }) {
  useSecureScreen();
  const { room } = route.params;
  const { user } = useApp();
  const insets = useSafeAreaInsets();
  const owner = room.host || {
    name: user.name.split(' ')[0],
    photo: user.photos[0],
  };
  const mine = !room.host;

  // Seats 0–2 start occupied by listeners in other people's rooms.
  const [seats, setSeats] = useState(() =>
    Array.from({ length: SEATS }, (_, i) =>
      !mine && i < 3 ? { ...LISTENERS[i], muted: i === 2 } : null,
    ),
  );
  const mySeat = seats.findIndex(s => s?.me);
  const [muted, setMuted] = useState(false);
  const [chat, setChat] = useState(ROOM_CHAT);
  const [text, setText] = useState('');
  const [gift, setGift] = useState(false);
  const [menu, setMenu] = useState(false);
  const [speaking, setSpeaking] = useState(0);
  const list = useRef(null);

  // Fake "who is talking" highlight so the room feels live.
  useEffect(() => {
    const t = setInterval(() => setSpeaking(s => (s + 1) % 4), 1600);
    return () => clearInterval(t);
  }, []);

  const say = entry => {
    setChat(c => [...c, { id: String(Date.now()), ...entry }]);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };

  const takeSeat = i => {
    if (seats[i] || mySeat >= 0) return;
    setSeats(s =>
      s.map((x, j) =>
        j === i ? { name: 'You', photo: user.photos[0], me: true } : x,
      ),
    );
    say({
      name: 'System',
      text: 'You took a seat. Tap the mic to talk.',
      system: true,
    });
  };
  const leaveSeat = () => setSeats(s => s.map(x => (x?.me ? null : x)));

  const send = () => {
    if (!text.trim()) return;
    say({ name: 'You', text: text.trim() });
    setText('');
  };

  const isVideo = room.kind === 'video';

  return (
    <LinearGradient colors={['#121212', '#121212']} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Image source={{ uri: room.cover }} style={styles.headerCover} />
        <View style={styles.flex}>
          <Txt style={styles.title} numberOfLines={1}>
            {room.title}
          </Txt>
          <View style={styles.headerMeta}>
            <Users size={12} color="rgba(255,255,255,0.75)" />
            <Txt style={styles.headerMetaText}>
              {room.count + (mySeat >= 0 ? 1 : 0)} online · {room.category}
            </Txt>
          </View>
        </View>
        <IconButton icon={Share2} variant="glass" size={36} iconSize={16} />
        <IconButton
          icon={ChevronDown}
          variant="glass"
          size={36}
          iconSize={18}
          onPress={() => navigation.goBack()}
        />
      </View>

      {/* Owner stage */}
      <View style={styles.stage}>
        {isVideo ? (
          <View style={styles.videoStage}>
            <Image
              source={{ uri: owner.photo }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.liveTag}>
              <Video size={12} color={colors.white} />
              <Txt style={styles.liveText}>LIVE</Txt>
            </View>
          </View>
        ) : (
          <View
            style={[styles.ownerRing, speaking === 0 && styles.seatSpeaking]}
          >
            <Image source={{ uri: owner.photo }} style={styles.ownerImg} />
          </View>
        )}
        <Txt style={styles.ownerName}>👑 {owner.name}</Txt>
      </View>

      <View style={styles.seats}>
        {seats.map((p, i) => (
          <Seat
            key={i}
            index={i}
            person={p}
            speaking={p && !p.muted && speaking === i + 1}
            onPress={() => (p?.me ? leaveSeat() : takeSeat(i))}
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
          {mySeat >= 0 ? (
            <IconButton
              icon={muted ? MicOff : Mic}
              variant={muted ? 'light' : 'glass'}
              color={muted ? colors.ink : undefined}
              size={42}
              iconSize={19}
              onPress={() => {
                setMuted(m => !m);
                setSeats(s =>
                  s.map(x => (x?.me ? { ...x, muted: !muted } : x)),
                );
              }}
            />
          ) : null}
          <IconButton
            icon={Gift}
            variant="gradient"
            gradient={colors.gradientWarm}
            size={42}
            iconSize={19}
            onPress={() => setGift(true)}
          />
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
        to={owner.name}
        visible={gift}
        onClose={() => setGift(false)}
        onSend={g =>
          say({
            name: 'You',
            text: `sent ${g.emoji} ${g.name} to ${owner.name}`,
            gift: true,
          })
        }
        onRecharge={() => {
          setGift(false);
          navigation.navigate('Wallet');
        }}
      />
      <Sheet visible={menu} onClose={() => setMenu(false)} dark>
        {mySeat >= 0 ? (
          <ListRow
            dark
            icon={Mic}
            title="Leave my seat"
            subtitle="Stay in the room as a listener"
            onPress={() => {
              leaveSeat();
              setMenu(false);
            }}
          />
        ) : null}
        <ListRow
          dark
          icon={Flag}
          title="Report room"
          onPress={() => {
            setMenu(false);
            navigation.navigate('Report', { name: room.title });
          }}
        />
        <ListRow
          dark
          icon={LogOut}
          title="Exit room"
          danger
          last
          onPress={() => {
            setMenu(false);
            navigation.goBack();
          }}
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
  seatSpeaking: { borderColor: '#22C55E' },
  seatImg: { width: 54, height: 54, borderRadius: 27 },
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
