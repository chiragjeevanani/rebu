import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  Camera,
  ChevronRight,
  Flag,
  Ellipsis,
  Gift,
  MessageSquare,
  Play,
  Send,
  ThumbsUp,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { MOMENT_COMMENTS, MOMENTS, TOPICS } from '../../data/social';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import IconButton from '../../components/IconButton';
import Sheet from '../../components/Sheet';
import ListRow from '../../components/ListRow';
import GiftSheet from '../../components/GiftSheet';
import { AgeBadge, HiButton, TopTabs, VipBadge } from '../../components/Social';

const topicLabel = key => TOPICS.find(t => t.key === key)?.label || key;

function Post({
  m,
  liked,
  greeted,
  onLike,
  onComments,
  onHi,
  onOpenHost,
  onMore,
}) {
  const mine = !m.host;
  const author = m.host || m.author;
  return (
    <View style={styles.post}>
      <View style={styles.postHead}>
        <Pressable onPress={mine ? undefined : onOpenHost}>
          <Avatar uri={author.photo} size={58} online={author.online} />
        </Pressable>
        <View style={styles.flex}>
          <Txt variant="h3">
            {author.name} {author.emoji || ''}
          </Txt>
          {mine ? (
            <Txt variant="small">Your moment</Txt>
          ) : (
            <View style={styles.badges}>
              <AgeBadge age={author.age} />
              <VipBadge level={author.vip} />
            </View>
          )}
        </View>
        {mine ? null : <HiButton greeted={greeted} onPress={onHi} />}
      </View>

      <View style={styles.postBody}>
        {m.text ? (
          <Txt variant="body" style={styles.postText}>
            {m.text}
          </Txt>
        ) : null}
        {m.media ? (
          <View style={styles.media}>
            <Image source={{ uri: m.media }} style={StyleSheet.absoluteFill} />
            {m.type === 'video' ? (
              <>
                <View style={styles.play}>
                  <Play size={28} color={colors.white} fill={colors.white} />
                </View>
                <Txt style={styles.duration}>{m.duration}</Txt>
              </>
            ) : null}
          </View>
        ) : null}
        {m.topic ? (
          <View style={styles.topicChip}>
            <Txt style={styles.hash}>#</Txt>
            <Txt variant="label">{topicLabel(m.topic)}</Txt>
          </View>
        ) : null}
        <Txt variant="small" color={colors.textFaint} style={styles.meta}>
          {m.time}
          {author.distanceKm ? ` · ${author.distanceKm}km` : ''}
        </Txt>
        <View style={styles.actions}>
          <Pressable onPress={onMore} hitSlop={8}>
            <Ellipsis size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.flex} />
          <Pressable onPress={onLike} style={styles.action} hitSlop={6}>
            <ThumbsUp
              size={22}
              color={liked ? colors.primary : colors.ink}
              fill={liked ? colors.primary : 'transparent'}
            />
            <Txt variant="label" color={liked ? colors.primary : colors.ink}>
              {m.likes + (liked ? 1 : 0)}
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

export default function MomentsScreen({ navigation }) {
  const { likedMoments, toggleLike, greeted, greet, myMoments } = useApp();
  const [tab, setTab] = useState('For You');
  const [topic, setTopic] = useState(null);
  const [comments, setComments] = useState(null);
  const [draft, setDraft] = useState('');
  const [extra, setExtra] = useState({});
  const [gift, setGift] = useState(false);
  const [menu, setMenu] = useState(null);

  let data = [...myMoments, ...MOMENTS];
  if (tab === 'Newcomers')
    data = data.filter(m => !m.host || m.host.followers < 10000);
  if (topic) data = data.filter(m => m.topic === topic);

  const sayHi = h => {
    const first = !greeted.includes(h.id);
    greet(h.id);
    navigation.navigate('ChatRoom', {
      chat: { userId: h.id, name: h.name, photo: h.photo, online: h.online },
      greeting: first,
    });
  };

  const thread = comments
    ? [...MOMENT_COMMENTS, ...(extra[comments] || [])]
    : [];
  const postComment = () => {
    if (!draft.trim()) return;
    setExtra(e => ({
      ...e,
      [comments]: [
        ...(e[comments] || []),
        {
          id: String(Date.now()),
          name: 'You',
          photo: 'https://i.pravatar.cc/200?img=12',
          text: draft.trim(),
          time: 'now',
        },
      ],
    }));
    setDraft('');
  };

  // Split the tags into two columns of cards.
  const columns = [TOPICS.slice(0, 3), TOPICS.slice(3)];

  return (
    <Screen>
      <TopTabs
        onBack={() => navigation.goBack()}
        tabs={['For You', 'Newcomers']}
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
        data={data}
        keyExtractor={m => m.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
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
          </>
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={styles.empty}
          >
            No moments in this topic yet.
          </Txt>
        }
        renderItem={({ item }) => (
          <Post
            m={item}
            liked={likedMoments.includes(item.id)}
            greeted={item.host && greeted.includes(item.host.id)}
            onLike={() => toggleLike(item.id)}
            onComments={() => setComments(item.id)}
            onHi={() => sayHi(item.host)}
            onOpenHost={() =>
              navigation.navigate('HostProfile', { host: item.host })
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
        {thread.map(c => (
          <View key={c.id} style={styles.comment}>
            <Avatar uri={c.photo} size={36} />
            <View style={styles.flex}>
              <Txt variant="label">
                {c.name} <Txt variant="tiny">{c.time}</Txt>
              </Txt>
              <Txt variant="body">{c.text}</Txt>
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
        {menu?.host ? (
          <ListRow
            icon={Gift}
            title={`Send ${menu.host.name} a gift`}
            onPress={() => {
              setMenu(null);
              setGift(true);
            }}
          />
        ) : null}
        <ListRow
          icon={Flag}
          title="Report this moment"
          last
          onPress={() => {
            const name = menu?.host?.name || 'moment';
            setMenu(null);
            navigation.navigate('Report', { name });
          }}
        />
      </Sheet>
      <GiftSheet
        visible={gift}
        onClose={() => setGift(false)}
        onRecharge={() => {
          setGift(false);
          navigation.navigate('Wallet');
        }}
        dark={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
