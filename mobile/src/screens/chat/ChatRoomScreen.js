import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban,
  CheckCheck,
  ChevronLeft,
  EllipsisVertical,
  Flag,
  Gift,
  Image as ImageIcon,
  Phone,
  PhoneMissed,
  Send,
  Smile,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { GIFTS, MESSAGE_COST } from '../../data/mock';
import { get, post } from '../../api/client';
import { toBubble } from '../../api/chat';
import { findHost, toAppHost } from '../../api/hosts';
import { useSocketEvent } from '../../api/socket';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import IconButton from '../../components/IconButton';
import GiftSheet from '../../components/GiftSheet';
import Sheet from '../../components/Sheet';
import ListRow from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';

const EMOJIS = [
  '😀',
  '😂',
  '😍',
  '🥰',
  '😘',
  '😎',
  '🤩',
  '😜',
  '🙈',
  '🔥',
  '❤️',
  '💕',
  '👍',
  '🙏',
  '🎉',
  '🌹',
  '☕',
  '🍕',
  '✨',
  '😇',
  '🤗',
  '😅',
  '😢',
  '😡',
];

function Bubble({ m, photo, name }) {
  if (m.type === 'system') {
    return (
      <View style={styles.system}>
        <LinearGradient colors={colors.gradient} style={styles.systemIcon}>
          <Sparkles size={16} color={colors.white} />
        </LinearGradient>
        <Txt variant="small" center color={colors.ink}>
          {m.text.replace('Aanya', name)}
        </Txt>
      </View>
    );
  }
  if (m.type === 'earned') {
    return (
      <View style={styles.earned}>
        <Txt style={styles.earnedText}>{m.text}</Txt>
      </View>
    );
  }
  if (m.type === 'call') {
    return (
      <View style={styles.callPill}>
        <PhoneMissed size={14} color={colors.danger} />
        <Txt variant="small" color={colors.danger}>
          {m.text} · {m.time}
        </Txt>
      </View>
    );
  }
  const mine = m.from === 'me';
  if (m.type === 'gift') {
    const g = GIFTS.find(x => x.key === m.gift);
    return (
      <View style={[styles.line, mine && styles.lineMine]}>
        {!mine ? <Avatar uri={photo} size={28} /> : null}
        <LinearGradient colors={['#FFF6DA', '#FFF6DA']} style={styles.gift}>
          <Txt style={{ fontSize: 44, lineHeight: 52 }}>{g.emoji}</Txt>
          <Txt variant="label">
            {mine ? `You sent a ${g.name}` : `Sent you a ${g.name}`}
          </Txt>
          <Txt variant="tiny" color={colors.coin}>
            {g.coins} coins
          </Txt>
        </LinearGradient>
      </View>
    );
  }
  const body =
    m.type === 'image' ? (
      <>
        <Image source={{ uri: m.uri }} style={styles.image} />
        {m.text ? (
          <Txt style={[styles.msg, styles.imageCaption]}>{m.text}</Txt>
        ) : null}
      </>
    ) : (
      <Txt style={[styles.msg, mine && { color: colors.white }]}>{m.text}</Txt>
    );

  return (
    <View style={[styles.line, mine && styles.lineMine]}>
      {!mine ? <Avatar uri={photo} size={28} /> : null}
      <View
        style={{
          maxWidth: '76%',
          alignItems: mine ? 'flex-end' : 'flex-start',
        }}
      >
        {mine ? (
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bubble, styles.bubbleMine]}
          >
            {body}
          </LinearGradient>
        ) : (
          <View
            style={[
              styles.bubble,
              styles.bubbleThem,
              m.type === 'image' && { padding: 6 },
            ]}
          >
            {body}
          </View>
        )}
        <View style={styles.meta}>
          <Txt variant="tiny" color={colors.textFaint}>
            {m.time}
          </Txt>
          {mine && m.read ? (
            <CheckCheck size={14} color={colors.secondary} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function ChatRoomScreen({ navigation, route }) {
  useSecureScreen();
  const chat = route.params.chat;
  // Opened from a notification we only know the id; the history call returns the profile.
  const [peer, setPeer] = useState(null);
  const host = findHost(chat.userId) ||
    (peer?.isHost ? toAppHost(peer) : null) || {
      ...chat,
      ...(peer && { name: peer.name, photo: peer.photo, photos: peer.photos }),
      id: chat.userId,
    };
  const { user: me, isHost, setCoinsFromServer, config, greet } = useApp();
  const messageCost = config?.economy?.messageCost ?? MESSAGE_COST;
  const [needCoins, setNeedCoins] = useState(false);
  const [notice, setNotice] = useState('');
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [gift, setGift] = useState(false);
  const [menu, setMenu] = useState(false);
  const list = useRef(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const scrollDown = () =>
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  const append = m =>
    setMessages(ms => (ms.some(x => x.id === m.id) ? ms : [...ms, m]));

  // History (opening the chat also marks it read on the server).
  useEffect(() => {
    (route.params?.greet
      ? greet(chat.userId).catch(e => setNotice(e.message))
      : Promise.resolve()
    )
      .then(() => get(`/chats/${chat.userId}/messages?limit=50`))
      .then(r => {
        setPeer(r.peer);
        setMessages(r.items.map(m => toBubble(m, me.id)));
      })
      .catch(e => setNotice(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.userId]);

  // Live messages in this conversation (theirs and my other devices').
  useSocketEvent('chat:message', p => {
    const m = p?.message;
    if (!m) return;
    const inThisChat =
      (m.from === chat.userId && m.to === me.id) ||
      (m.from === me.id && m.to === chat.userId);
    if (!inThisChat) return;
    append(toBubble(m, me.id));
    if (m.from === chat.userId)
      post(`/chats/${chat.userId}/read`).catch(() => {});
    scrollDown();
  });

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardOpen(true);
      list.current?.scrollToEnd({ animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardOpen(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Users pay per message to a host; the server charges and credits the host.
  const sendMessage = async m => {
    setNotice('');
    try {
      const r = await post(`/chats/${chat.userId}/messages`, {
        type: m.type,
        text: m.text,
        imageUrl: m.uri,
      });
      append(toBubble(r.message, me.id));
      if (typeof r.balance === 'number') setCoinsFromServer(r.balance);
      setNeedCoins(false);
      scrollDown();
      return true;
    } catch (e) {
      if (e.code === 'insufficient_coins') setNeedCoins(true);
      else setNotice(e.message);
      return false;
    }
  };
  const paidPush = m => sendMessage(m);
  const push = paidPush;

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    if (!(await sendMessage({ type: 'text', text: t }))) setText(t);
  };

  const callUser = video => navigation.navigate('Call', { user: host, video });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton
          icon={ChevronLeft}
          size={38}
          iconSize={22}
          variant="plain"
          shadowed={false}
          onPress={() => navigation.goBack()}
        />
        <Pressable
          style={styles.who}
          onPress={() => navigation.navigate('HostProfile', { host })}
        >
          <Avatar uri={chat.photo} size={42} ring online={chat.online} />
          <View>
            <Txt variant="h3">{chat.name}</Txt>
            <Txt
              variant="tiny"
              color={chat.online ? colors.success : colors.textFaint}
            >
              {chat.online ? 'Active now' : 'Last seen 2h ago'}
            </Txt>
          </View>
        </Pressable>
        <IconButton
          icon={Phone}
          size={38}
          iconSize={18}
          variant="tint"
          shadowed={false}
          onPress={() => callUser(false)}
        />
        <IconButton
          icon={Video}
          size={38}
          iconSize={18}
          variant="gradient"
          shadowed={false}
          onPress={() => callUser(true)}
        />
        <IconButton
          icon={EllipsisVertical}
          size={34}
          iconSize={20}
          variant="plain"
          shadowed={false}
          onPress={() => setMenu(true)}
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // Edge-to-edge Android doesn't resize the window for the keyboard,
        // so pad on both platforms.
        behavior="padding"
      >
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.today}>
              <Txt variant="tiny" color={colors.secondary}>
                TODAY
              </Txt>
            </View>
          }
          renderItem={({ item }) => (
            <Bubble m={item} photo={chat.photo} name={chat.name} />
          )}
          onContentSizeChange={() =>
            list.current?.scrollToEnd({ animated: false })
          }
        />

        {notice ? (
          <View style={styles.needCoins}>
            <Txt variant="small" color={colors.ink} style={styles.flex}>
              {notice}
            </Txt>
          </View>
        ) : null}
        {needCoins ? (
          <View style={styles.needCoins}>
            <Txt variant="small" color={colors.ink} style={styles.flex}>
              You need {messageCost} coins to send a message.
            </Txt>
            <Txt
              variant="label"
              color={colors.primary}
              onPress={() => navigation.navigate('Wallet')}
            >
              Recharge
            </Txt>
          </View>
        ) : null}

        {emoji ? (
          <View style={styles.emojiPanel}>
            {EMOJIS.map(e => (
              <Pressable
                key={e}
                onPress={() => setText(t => t + e)}
                style={styles.emojiBtn}
              >
                <Txt style={{ fontSize: 26 }}>{e}</Txt>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View
          style={[
            styles.composer,
            { paddingBottom: (keyboardOpen ? 0 : insets.bottom) + 10 },
          ]}
        >
          <IconButton
            icon={Smile}
            size={38}
            iconSize={22}
            variant="plain"
            shadowed={false}
            color={emoji ? colors.primary : colors.textMuted}
            onPress={() => setEmoji(e => !e)}
          />
          <IconButton
            icon={ImageIcon}
            size={38}
            iconSize={21}
            variant="plain"
            shadowed={false}
            color={colors.textMuted}
            onPress={() =>
              paidPush({
                type: 'image',
                uri: 'https://picsum.photos/id/1062/600/450',
              })
            }
          />
          <IconButton
            icon={Gift}
            size={38}
            iconSize={21}
            variant="tint"
            shadowed={false}
            color={colors.warning}
            onPress={() => setGift(true)}
          />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={
              isHost ? 'Type a message…' : `Message · ${messageCost} coins`
            }
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            multiline
            onFocus={() => setEmoji(false)}
          />
          <Pressable onPress={send}>
            <LinearGradient colors={colors.gradient} style={styles.send}>
              <Send size={18} color={colors.white} />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <GiftSheet
        visible={gift}
        onClose={() => setGift(false)}
        to={chat.name}
        // The server stores the gift as a chat message; it arrives over the socket.
        toId={chat.userId}
        context={{ type: 'chat' }}
        onRecharge={() => {
          setGift(false);
          navigation.navigate('Wallet');
        }}
        dark={false}
      />
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <ListRow
          icon={Flag}
          title={`Report ${chat.name}`}
          onPress={() => {
            setMenu(false);
            navigation.navigate('Report', {
              name: host.name,
              targetType: host.isHost ? 'host' : 'user',
              targetId: chat.userId,
            });
          }}
        />
        <ListRow
          icon={Trash2}
          title="Clear chat"
          iconColor={colors.textMuted}
          iconBg={colors.surfaceMuted}
          onPress={() => {
            setMessages([]);
            setMenu(false);
          }}
        />
        <ListRow
          icon={Ban}
          title={`Block ${chat.name}`}
          danger
          last
          onPress={() => {
            setMenu(false);
            navigation.goBack();
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  needCoins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: '#FFF4DB',
    borderTopWidth: 1,
    borderTopColor: '#FFE7B3',
  },
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { padding: spacing.md, gap: 12 },
  today: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 4,
  },
  system: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '86%',
  },
  systemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earned: {
    alignSelf: 'center',
    backgroundColor: '#E6F6EE',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  earnedText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.success,
  },
  callPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFE8EC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  lineMine: { justifyContent: 'flex-end' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleMine: { borderBottomRightRadius: 6 },
  bubbleThem: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  msg: {
    fontFamily: fonts.medium,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.ink,
  },
  image: { width: 230, height: 170, borderRadius: 16 },
  imageCaption: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    maxWidth: 230,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  gift: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 20,
    gap: 2,
  },
  emojiPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  emojiBtn: { width: '12.5%', alignItems: 'center', paddingVertical: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingHorizontal: 8,
    paddingTop: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 42,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 4,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
