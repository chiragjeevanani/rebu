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
import { GIFTS, HOSTS, MESSAGES, MESSAGE_COST } from '../../data/mock';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import IconButton from '../../components/IconButton';
import GiftSheet from '../../components/GiftSheet';
import Sheet from '../../components/Sheet';
import ListRow from '../../components/ListRow';
import { useSecureScreen } from '../../utils/secure';
import { inr, split } from '../../data/economy';

// Demo replies a user sends back to a host (each one is a paid message).
const USER_REPLIES = [
  'Haha 😄 tell me more',
  'You’re so sweet ❤️',
  'Can we video call later?',
  'What are you doing today?',
];

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
  const host =
    HOSTS.find(h => h.id === chat.userId || h.name === chat.name) || chat;
  const { isHost, hostAgency, spendCoins, addTransaction, addEarning } =
    useApp();
  const replies = useRef(0);
  const [needCoins, setNeedCoins] = useState(false);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(MESSAGES);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [gift, setGift] = useState(false);
  const [menu, setMenu] = useState(false);
  const list = useRef(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Tapping "Hi" sends a free first greeting.
  useEffect(() => {
    if (route.params?.greeting) push({ type: 'text', text: 'Hi 👋' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const push = m => {
    setMessages(ms => [
      ...ms,
      { id: String(Date.now()), from: 'me', time: 'now', ...m },
    ]);
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
  };

  // Users pay per message to a host; hosts reply for free (and earn).
  const paidPush = m => {
    if (!isHost) {
      if (!spendCoins(MESSAGE_COST)) {
        setNeedCoins(true);
        return false;
      }
      addTransaction({
        type: 'chat',
        title: `Message · ${chat.name}`,
        sub: 'Chat',
        amount: -MESSAGE_COST,
      });
    }
    setNeedCoins(false);
    push(m);
    if (isHost) userReplies();
    return true;
  };

  // Host side (demo): the user answers, paying per message — the host earns.
  const userReplies = () =>
    setTimeout(() => {
      const rec = {
        source: 'chat',
        from: chat.name,
        photo: chat.photo,
        coins: MESSAGE_COST,
        agency: hostAgency,
        detail: '1 paid message',
      };
      addEarning(rec);
      const n = replies.current++;
      setMessages(ms => [
        ...ms,
        {
          id: `r${Date.now()}`,
          from: chat.userId || 'them',
          time: 'now',
          type: 'text',
          text: USER_REPLIES[n % USER_REPLIES.length],
        },
        {
          id: `x${Date.now()}`,
          type: 'earned',
          text: `+${inr(split(rec).net)} earned from this message`,
        },
      ]);
      setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50);
    }, 2500);

  const send = () => {
    if (!text.trim()) return;
    if (paidPush({ type: 'text', text: text.trim() })) setText('');
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

        {needCoins ? (
          <View style={styles.needCoins}>
            <Txt variant="small" color={colors.ink} style={styles.flex}>
              You need {MESSAGE_COST} coins to send a message.
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
              isHost ? 'Type a message…' : `Message · ${MESSAGE_COST} coins`
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
        onSend={g => push({ type: 'gift', gift: g.key })}
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
            navigation.navigate('Report', { name: chat.name });
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
