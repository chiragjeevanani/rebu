import React, { useRef, useState, useCallback } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Hand, Phone, Pin, Search, SquarePen } from 'lucide-react-native';
import { colors, fonts, spacing } from '../../theme';
import { useFocusEffect } from '@react-navigation/native';
import { del, get, patch as apiPatch } from '../../api/client';
import { toAppChat } from '../../api/chat';
import { useHosts } from '../../api/hosts';
import { useSocketEvent } from '../../api/socket';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import { LogoMark } from '../../components/Logo';
import { CoinIcon } from '../../components/CoinPill';
import { TopBar } from '../../components/Live';
import { useSecureScreen } from '../../utils/secure';
import { hapticHeavy } from '../../utils/haptics';
import ChatMenu from '../../components/ChatMenu';

const FILTERS = ['All', 'Unread', 'Online', 'Favourites'];
// Custom list a chat can be added to from the long-press menu.
const REGULARS = 'Regulars';

function Row({
  photo,
  logo,
  online,
  title,
  sub,
  subStyle,
  time,
  unread,
  right,
  pinned,
  selected,
  onPress,
  onLongPress,
}) {
  const ref = useRef(null);
  return (
    <Pressable
      ref={ref}
      style={[styles.row, selected && styles.rowSelected]}
      onPress={onPress}
      delayLongPress={350}
      onLongPress={
        onLongPress &&
        (() => {
          hapticHeavy();
          ref.current?.measureInWindow((x, y, w, height) =>
            onLongPress({ y, height }),
          );
        })
      }
    >
      <View>
        {logo ? (
          <LogoMark size={58} />
        ) : (
          <Image source={{ uri: photo }} style={styles.avatar} />
        )}
        {online ? <View style={styles.online} /> : null}
      </View>
      <View style={styles.rowText}>
        <Txt style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Txt>
        <Txt style={[styles.rowSub, subStyle]} numberOfLines={1}>
          {sub}
        </Txt>
      </View>
      {right || (
        <View style={styles.rowRight}>
          <Txt style={styles.time}>{time}</Txt>
          <View style={styles.rowIcons}>
            {pinned ? (
              <Pin size={15} color={colors.textFaint} fill={colors.textFaint} />
            ) : null}
            {unread ? (
              <View style={styles.badge}>
                <Txt style={styles.badgeText}>{unread}</Txt>
              </View>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function ChatListScreen({ navigation }) {
  useSecureScreen();
  const { following, greeted, toggleFollow } = useApp();
  const [items, setItems] = useState([]);
  const hosts = useHosts();

  const load = useCallback(() => {
    get('/chats?limit=50')
      .then(r => setItems(r.items.map(toAppChat)))
      .catch(() => {});
  }, []);
  useFocusEffect(load);
  // New messages (and read receipts) refresh the list.
  useSocketEvent('chat:message', load);
  const [regulars, setRegulars] = useState([]);
  const [menu, setMenu] = useState(null); // { chat, anchor }
  const [filter, setFilter] = useState('All');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');

  const online = hosts.filter(h => h.online);
  const spotlight = online[0];
  const unreadCount = items.filter(c => c.unread).length;
  const term = q.trim().toLowerCase();
  const filters = regulars.length ? [...FILTERS, REGULARS] : FILTERS;

  let chats = items.filter(c => c.name.toLowerCase().includes(term));
  if (filter === 'Unread') chats = chats.filter(c => c.unread);
  if (filter === 'Online') chats = chats.filter(c => c.online);
  if (filter === 'Favourites')
    chats = chats.filter(c => following.includes(c.userId));
  if (filter === REGULARS) chats = chats.filter(c => regulars.includes(c.id));
  chats = [...chats.filter(c => c.pinned), ...chats.filter(c => !c.pinned)];

  // Optimistic local update, mirrored to the server (pinned / unread).
  const update = (id, patch) => {
    setItems(list => list.map(c => (c.id === id ? { ...c, ...patch } : c)));
    const body = {};
    if ('pinned' in patch) body.pinned = patch.pinned;
    if ('unread' in patch) body.unread = !!patch.unread;
    apiPatch(`/chats/${id}`, body).catch(load);
  };

  const toggleList = (chat, name) => {
    if (name === 'Favourites') return toggleFollow(chat.userId);
    setRegulars(r =>
      r.includes(chat.id) ? r.filter(x => x !== chat.id) : [...r, chat.id],
    );
  };

  const confirmDelete = chat =>
    Alert.alert(
      `Delete chat with ${chat.name}?`,
      'Messages will be removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setItems(list => list.filter(c => c.id !== chat.id));
            del(`/chats/${chat.id}`).catch(load);
          },
        },
      ],
    );

  const chatIds = items.map(c => c.userId);
  const suggested = hosts.filter(h => !chatIds.includes(h.id));

  const sayHi = h => {
    navigation.navigate('ChatRoom', {
      chat: { userId: h.id, name: h.name, photo: h.photo, online: h.online },
      greet: !greeted.includes(h.id),
    });
  };

  return (
    <Screen>
      <TopBar
        right={
          <View style={styles.topIcons}>
            <Pressable onPress={() => setSearching(s => !s)} hitSlop={8}>
              <Search size={25} color={colors.ink} strokeWidth={1.9} />
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('CallHistory')}
              hitSlop={8}
            >
              <Phone size={23} color={colors.ink} strokeWidth={1.9} />
            </Pressable>
            <Pressable
              onPress={() =>
                navigation.navigate('HostList', { list: 'online' })
              }
              hitSlop={8}
            >
              <SquarePen size={24} color={colors.ink} strokeWidth={1.9} />
            </Pressable>
          </View>
        }
      />
      {searching ? (
        <Input
          icon={Search}
          autoFocus
          placeholder="Search chats"
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      ) : null}

      <FlatList
        data={chats}
        keyExtractor={c => c.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {spotlight && !term ? (
              <Pressable
                style={styles.banner}
                onPress={() =>
                  navigation.navigate('HostProfile', { host: spotlight })
                }
              >
                <Image
                  source={{ uri: spotlight.photos?.[1] || spotlight.photo }}
                  style={styles.bannerImg}
                />
                <View style={styles.flex}>
                  <Txt style={styles.bannerTitle}>Online right now</Txt>
                  <Txt variant="small" color={colors.text}>
                    {online.length} hosts are free to talk
                  </Txt>
                </View>
                <View style={styles.bannerBtn}>
                  <Txt style={styles.bannerBtnText}>Call {spotlight.name}</Txt>
                </View>
              </Pressable>
            ) : null}

            {!term ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stories}
              >
                {online.map(h => (
                  <Pressable
                    key={h.id}
                    style={styles.story}
                    onPress={() =>
                      navigation.navigate('HostProfile', { host: h })
                    }
                  >
                    <View style={styles.storyRing}>
                      <Image
                        source={{ uri: h.photo }}
                        style={styles.storyImg}
                      />
                    </View>
                    <View style={styles.storyTag}>
                      <Txt style={styles.storyTagText}>ONLINE</Txt>
                    </View>
                    <Txt style={styles.storyName} numberOfLines={1}>
                      {h.name} {h.emoji || ''}
                    </Txt>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
            >
              {filters.map(f => {
                const active = filter === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    style={[styles.filter, active && styles.filterOn]}
                  >
                    <Txt
                      style={[styles.filterText, active && styles.filterTextOn]}
                    >
                      {f}
                      {f === 'Unread' && unreadCount ? ` ${unreadCount}` : ''}
                    </Txt>
                  </Pressable>
                );
              })}
            </ScrollView>

            {filter === 'All' && !term ? (
              <Row
                logo
                title="REBU Team"
                sub="Welcome to REBU! 🎉 Tap to see offers & updates"
                time="10:35"
                unread={1}
                onPress={() => navigation.navigate('Notifications')}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={styles.empty}
          >
            No chats here.
          </Txt>
        }
        ListFooterComponent={
          filter === 'All' && !term && suggested.length ? (
            <>
              <Txt style={styles.suggestTitle}>Suggested hosts</Txt>
              {suggested.map((h, i) => (
                <Row
                  key={h.id}
                  photo={h.photo}
                  online={h.online}
                  title={`${h.name} ${h.emoji || ''}`}
                  sub={
                    h.online
                      ? 'Open for chatting'
                      : `${h.city} · ${h.languages?.[0] || ''}`
                  }
                  onPress={() =>
                    navigation.navigate('HostProfile', { host: h })
                  }
                  right={
                    i === 0 && h.online ? (
                      <Pressable
                        style={styles.outlineBtn}
                        onPress={() =>
                          navigation.navigate('Call', { user: h, video: true })
                        }
                      >
                        <Txt style={styles.outlineText}>Call</Txt>
                        <CoinIcon size={14} />
                        <Txt style={styles.outlineText}>{h.videoRate}/min</Txt>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={styles.outlineBtn}
                        onPress={() => sayHi(h)}
                      >
                        <Hand size={16} color={colors.ink} />
                        <Txt style={styles.outlineText}>
                          {greeted.includes(h.id) ? 'Chat' : 'Say Hi'}
                        </Txt>
                      </Pressable>
                    )
                  }
                />
              ))}
            </>
          ) : null
        }
        renderItem={({ item }) => (
          <Row
            photo={item.photo}
            online={item.online}
            title={item.name}
            sub={item.last}
            subStyle={[
              item.unread && styles.subUnread,
              item.typing && styles.subTyping,
              item.missed && styles.subMissed,
            ]}
            time={item.time}
            unread={item.unread}
            pinned={item.pinned}
            selected={menu?.chat.id === item.id}
            onPress={() => {
              update(item.id, { unread: 0 });
              navigation.navigate('ChatRoom', { chat: item });
            }}
            onLongPress={anchor => setMenu({ chat: item, anchor })}
          />
        )}
      />

      <ChatMenu
        chat={menu?.chat}
        anchor={menu?.anchor}
        lists={
          menu
            ? [
                {
                  name: 'Favourites',
                  has: following.includes(menu.chat.userId),
                },
                { name: REGULARS, has: regulars.includes(menu.chat.id) },
              ]
            : []
        }
        onClose={() => setMenu(null)}
        onToggleList={toggleList}
        onToggleRead={c => update(c.id, { unread: c.unread ? 0 : 1 })}
        onTogglePin={c => update(c.id, { pinned: !c.pinned })}
        onDelete={confirmDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topIcons: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  search: { marginHorizontal: spacing.md, marginBottom: 8 },
  list: { paddingBottom: 32 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 4,
    paddingRight: 12,
    height: 92,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#FFE9C7',
  },
  bannerImg: { width: 110, height: '100%' },
  bannerTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 19,
    lineHeight: 24,
    color: colors.ink,
  },
  bannerBtn: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  bannerBtnText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  stories: {
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingTop: 16,
    paddingBottom: 6,
  },
  story: { alignItems: 'center', width: 78 },
  storyRing: {
    padding: 2,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  storyImg: { width: 66, height: 66, borderRadius: 33 },
  storyTag: {
    position: 'absolute',
    top: -6,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  storyTagText: {
    fontFamily: fonts.bold,
    fontSize: 9.5,
    color: colors.white,
    letterSpacing: 0.5,
  },
  storyName: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
    marginTop: 6,
  },
  filters: { gap: 8, paddingHorizontal: spacing.md, paddingVertical: 14 },
  filter: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  filterOn: { backgroundColor: colors.ink },
  filterText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  filterTextOn: { color: colors.white },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.surfaceMuted,
  },
  online: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.white,
  },
  rowSelected: { backgroundColor: colors.surfaceMuted },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
  rowSub: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.textMuted,
  },
  subUnread: { color: colors.ink, fontFamily: fonts.medium },
  subTyping: { color: colors.primary },
  subMissed: { color: colors.danger },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 22,
  },
  time: { fontFamily: fonts.regular, fontSize: 12, color: colors.textFaint },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  empty: { paddingVertical: 30 },
  suggestTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    marginTop: 18,
    marginBottom: 2,
  },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  outlineText: {
    fontFamily: fonts.semibold,
    fontSize: 14.5,
    color: colors.ink,
  },
});
