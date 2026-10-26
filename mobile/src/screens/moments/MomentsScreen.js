import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Camera,
  ChevronRight,
  Flag,
  Ellipsis,
  Gift,
  MessageSquare,
  Send,
  ThumbsUp,
  Trash2,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { TOPICS } from '../../data/social';
import { useApp } from '../../context/AppContext';
import { del, get, post } from '../../api/client';
import { toAppHost } from '../../api/hosts';
import { timeLabel } from '../../api/chat';
import Screen from '../../components/Screen';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import IconButton from '../../components/IconButton';
import Sheet from '../../components/Sheet';
import ListRow from '../../components/ListRow';
import GiftSheet from '../../components/GiftSheet';
import { AgeBadge, HiButton, TopTabs, VipBadge } from '../../components/Social';

const topicLabel = key => TOPICS.find(t => t.key === key)?.label || key;

function Post({ m, greeted, onLike, onComments, onHi, onOpenHost, onMore }) {
  const author = m.author || {};
  return (
    <View style={styles.post}>
      <View style={styles.postHead}>
        <Pressable onPress={author.isHost ? onOpenHost : undefined}>
          <Avatar uri={author.photo} size={58} online={!!author.host?.online} />
        </Pressable>
        <View style={styles.flex}>
          <Txt variant="h3">{author.name}</Txt>
          {m.mine ? (
            <Txt variant="small">Your moment</Txt>
          ) : (
            <View style={styles.badges}>
              <AgeBadge age={author.age} />
              <VipBadge level={author.vip} />
            </View>
          )}
        </View>
        {m.mine ? null : <HiButton greeted={greeted} onPress={onHi} />}
      </View>

      <View style={styles.postBody}>
        {m.text ? (
          <Txt variant="body" style={styles.postText}>
            {m.text}
          </Txt>
        ) : null}
        {m.media?.[0]?.url ? (
          <View style={styles.media}>
            <Image
              source={{ uri: m.media[0].url }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : null}
        {m.topic && m.topic !== 'new' ? (
          <View style={styles.topicChip}>
            <Txt style={styles.hash}>#</Txt>
            <Txt variant="label">{topicLabel(m.topic)}</Txt>
          </View>
        ) : null}
        <Txt variant="small" color={colors.textFaint} style={styles.meta}>
          {timeLabel(m.at)}
          {author.city ? ` · ${author.city}` : ''}
        </Txt>
        <View style={styles.actions}>
          <Pressable onPress={onMore} hitSlop={8}>
            <Ellipsis size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.flex} />
          <Pressable onPress={onLike} style={styles.action} hitSlop={6}>
            <ThumbsUp
              size={22}
              color={m.liked ? colors.primary : colors.ink}
              fill={m.liked ? colors.primary : 'transparent'}
            />
            <Txt variant="label" color={m.liked ? colors.primary : colors.ink}>
              {m.likes}
            </Txt>
          </Pressable>
          <Pressable onPress={onComments} style={styles.action} hitSlop={6}>
            <MessageSquare size={21} color={colors.ink} />
            <Txt variant="label">{m.comments}</Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const TABS = { 'For You': 'all', Following: 'following', Mine: 'mine' };

export default function MomentsScreen({ navigation }) {
  const { greeted, user } = useApp();
  const [tab, setTab] = useState('For You');
  const [topic, setTopic] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [comments, setComments] = useState(null); // moment id
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const [gift, setGift] = useState(null); // author to gift
  const [menu, setMenu] = useState(null);

  const load = useCallback(async () => {
    try {
      const q = `tab=${TABS[tab]}${topic ? `&topic=${topic}` : ''}&limit=50`;
      const r = await get(`/moments?${q}`);
      setItems(r.items);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [tab, topic]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const patchMoment = (id, p) =>
    setItems(list => list.map(m => (m.id === id ? { ...m, ...p } : m)));

  // Optimistic like; the server's count wins.
  const toggleLike = async m => {
    const on = !m.liked;
    patchMoment(m.id, { liked: on, likes: m.likes + (on ? 1 : -1) });
    try {
      const path = `/moments/${m.id}/like`;
      const r = await (on ? post(path) : del(path));
      patchMoment(m.id, { liked: r.liked, likes: r.likes });
    } catch {
      patchMoment(m.id, { liked: m.liked, likes: m.likes });
    }
  };

  useEffect(() => {
    if (!comments) return setThread([]);
    get(`/moments/${comments}/comments?limit=100`)
      .then(r => setThread(r.items))
      .catch(() => setThread([]));
  }, [comments]);

  const postComment = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      const r = await post(`/moments/${comments}/comments`, { text });
      setThread(t => [...t, r.comment]);
      patchMoment(comments, { comments: r.comments });
    } catch (e) {
      setDraft(text);
      setThread(t => [
        ...t,
        { id: `err${Date.now()}`, user: null, text: e.message, error: true },
      ]);
    }
  };

  const sayHi = a => {
    navigation.navigate('ChatRoom', {
      chat: { userId: a.id, name: a.name, photo: a.photo },
      greet: !greeted.includes(a.id),
    });
  };

  const remove = async m => {
    setMenu(null);
    await del(`/moments/${m.id}`).catch(() => {});
    setItems(list => list.filter(x => x.id !== m.id));
  };

  // Split the tags into two columns of cards.
  const columns = [TOPICS.slice(0, 3), TOPICS.slice(3)];

  return (
    <Screen>
      <TopTabs
        onBack={() => navigation.goBack()}
        tabs={Object.keys(TABS)}
        value={tab}
        onChange={setTab}
        right={
          <IconButton
            icon={Camera}
            variant="plain"
            shadowed={false}
            size={40}
            iconSize={25}
            onPress={() => navigation.navigate('CreateMoment')}
          />
        }
      />
      <FlatList
        data={items || []}
        keyExtractor={m => m.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.hotHead}>
              <Txt variant="h3">Trending tags</Txt>
              {topic ? (
                <Txt
                  variant="label"
                  color={colors.primary}
                  onPress={() => setTopic(null)}
                >
                  Clear
                </Txt>
              ) : null}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.topics}
            >
              {columns.map((col, i) => (
                <View key={i} style={styles.topicCard}>
                  {col.map(t => (
                    <Pressable
                      key={t.key}
                      style={styles.topicRow}
                      onPress={() => setTopic(t.key)}
                    >
                      <Txt style={styles.hash}>#</Txt>
                      <Txt
                        variant="label"
                        style={[
                          styles.flex,
                          topic === t.key && styles.topicActive,
                        ]}
                      >
                        {t.label}
                      </Txt>
                      <ChevronRight size={18} color={colors.textFaint} />
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
            {!items && !error ? (
              <ActivityIndicator color={colors.primary} style={styles.empty} />
            ) : null}
          </>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          items || error ? (
            <Txt
              variant="body"
              color={error ? colors.danger : colors.textMuted}
              center
              style={styles.empty}
            >
              {error ||
                (tab === 'Following'
                  ? 'Hosts you follow haven’t posted yet.'
                  : tab === 'Mine'
                  ? 'You haven’t posted a moment yet.'
                  : 'No moments here yet.')}
            </Txt>
          ) : null
        }
        renderItem={({ item }) => (
          <Post
            m={item}
            greeted={greeted.includes(item.author?.id)}
            onLike={() => toggleLike(item)}
            onComments={() => setComments(item.id)}
            onHi={() => sayHi(item.author)}
            onOpenHost={() =>
              navigation.navigate('HostProfile', {
                host: toAppHost(item.author),
              })
            }
            onMore={() => setMenu(item)}
          />
        )}
      />

      <Sheet
        visible={!!comments}
        onClose={() => setComments(null)}
        title="Comments"
      >
        {thread.length === 0 ? (
          <Txt variant="small" center style={styles.noComments}>
            Be the first to comment.
          </Txt>
        ) : null}
        {thread.map(c => (
          <View key={c.id} style={styles.comment}>
            <Avatar uri={c.user?.photo} size={36} />
            <View style={styles.flex}>
              <Txt variant="label">
                {c.error
                  ? 'Not posted'
                  : c.user?.id === user.id
                  ? 'You'
                  : c.user?.name}{' '}
                <Txt variant="tiny">{c.at ? timeLabel(c.at) : ''}</Txt>
              </Txt>
              <Txt variant="body" color={c.error ? colors.danger : colors.ink}>
                {c.text}
              </Txt>
            </View>
          </View>
        ))}
        <View style={styles.commentBox}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a comment…"
            placeholderTextColor={colors.textFaint}
            style={styles.commentInput}
          />
          <IconButton
            icon={Send}
            variant="gradient"
            size={42}
            iconSize={18}
            onPress={postComment}
          />
        </View>
      </Sheet>

      <Sheet visible={!!menu} onClose={() => setMenu(null)}>
        {menu?.mine ? (
          <ListRow
            icon={Trash2}
            title="Delete this moment"
            last
            onPress={() => remove(menu)}
          />
        ) : (
          <>
            {menu?.author?.isHost ? (
              <ListRow
                icon={Gift}
                title={`Send ${menu.author.name} a gift`}
                onPress={() => {
                  setGift(menu.author);
                  setMenu(null);
                }}
              />
            ) : null}
            <ListRow
              icon={Flag}
              title="Report this moment"
              last
              onPress={() => {
                const m = menu;
                setMenu(null);
                navigation.navigate('Report', {
                  name: `${m.author?.name || 'this'}’s moment`,
                  targetType: 'moment',
                  targetId: m.id,
                });
              }}
            />
          </>
        )}
      </Sheet>
      <GiftSheet
        visible={!!gift}
        onClose={() => setGift(null)}
        toId={gift?.id}
        to={gift?.name}
        context={{ type: 'chat' }}
        onRecharge={() => {
          setGift(null);
          navigation.navigate('Wallet');
        }}
        dark={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noComments: { paddingVertical: 16 },
  list: { paddingHorizontal: spacing.md, paddingBottom: 24 },
  hotHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  topics: { gap: 12, paddingBottom: 8 },
  topicCard: {
    width: 260,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
  },
  topicActive: { color: colors.primary },
  hash: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.primary },
  post: { paddingVertical: 16 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  postBody: { marginLeft: 70, marginTop: 10 },
  postText: { marginBottom: 10 },
  media: {
    width: 200,
    height: 266,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  duration: {
    position: 'absolute',
    right: 10,
    bottom: 8,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceMuted,
    marginTop: 12,
  },
  meta: { marginTop: 10 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    marginTop: 14,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sep: { height: 1, backgroundColor: colors.border },
  empty: { paddingVertical: 40 },
  comment: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  commentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  commentInput: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceMuted,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
});
