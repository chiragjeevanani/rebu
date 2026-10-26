import React, { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  AudioLines,
  Plus,
  Search,
  SquarePlus,
  Video,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROOMS } from '../../data/social';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import { TopTabs } from '../../components/Social';

const TABS = ['For You', 'Video', 'New', 'Mine'];
const CATEGORY_TINT = {
  Music: ['#E0F2FE', '#0284C7'],
  Chat: ['#F3E8FF', '#9333EA'],
  Friendship: ['#FFE4EF', '#DB2777'],
  Games: ['#DCFCE7', '#16A34A'],
};

export function RoomCard({ room, onPress }) {
  const tint = CATEGORY_TINT[room.category] || CATEGORY_TINT.Chat;
  const Kind = room.kind === 'video' ? Video : AudioLines;
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <Image source={{ uri: room.cover }} style={styles.cover} />
      <View style={styles.cardText}>
        <Txt variant="h3" numberOfLines={1}>
          {room.title}
        </Txt>
        <Txt variant="small" numberOfLines={1} style={styles.welcome}>
          {room.welcome}
        </Txt>
        <View style={styles.cardBottom}>
          <View style={[styles.category, { backgroundColor: tint[0] }]}>
            <Txt style={[styles.categoryText, { color: tint[1] }]}>
              {room.category}
            </Txt>
          </View>
          <View style={styles.count}>
            <Kind
              size={15}
              color={room.kind === 'video' ? colors.secondary : colors.warning}
            />
            <Txt style={styles.countText}>{room.count}</Txt>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function RoomsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { myRooms } = useApp();
  const [tab, setTab] = useState(route.params?.tab || 'For You');
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');

  // The Home "Live Lounge" tile opens this tab with a preset.
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);

  let data =
    tab === 'Mine'
      ? myRooms
      : tab === 'Video'
      ? ROOMS.filter(r => r.kind === 'video')
      : tab === 'New'
      ? [...ROOMS].reverse()
      : [...myRooms, ...ROOMS].sort((a, b) => b.count - a.count);
  if (q.trim()) {
    data = data.filter(r =>
      r.title.toLowerCase().includes(q.trim().toLowerCase()),
    );
  }

  return (
    <Screen>
      <TopTabs
        onBack={() => navigation.goBack()}
        tabs={TABS}
        value={tab}
        onChange={setTab}
        right={
          <>
            <IconButton
              icon={Search}
              variant="plain"
              shadowed={false}
              size={38}
              iconSize={23}
              onPress={() => setSearching(s => !s)}
            />
            <IconButton
              icon={SquarePlus}
              variant="plain"
              shadowed={false}
              size={38}
              iconSize={23}
              onPress={() => navigation.navigate('CreateRoom')}
            />
          </>
        }
      />
      {searching ? (
        <Input
          icon={Search}
          autoFocus
          placeholder="Search rooms"
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
      ) : null}
      <FlatList
        data={data}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Txt variant="body" color={colors.textMuted} center>
              {tab === 'Mine'
                ? 'You haven’t created a room yet.'
                : 'No rooms found.'}
            </Txt>
            {tab === 'Mine' ? (
              <Button
                title="Create my room"
                full={false}
                style={styles.emptyBtn}
                onPress={() => navigation.navigate('CreateRoom')}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <RoomCard
            room={item}
            onPress={() => navigation.navigate('Room', { room: item })}
          />
        )}
      />
      <Pressable
        style={[styles.create, { bottom: insets.bottom + 16 }]}
        onPress={() => navigation.navigate('CreateRoom')}
      >
        <Plus size={20} color={colors.white} strokeWidth={2.6} />
        <Txt style={styles.createText}>Create room</Txt>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { marginHorizontal: spacing.md, marginBottom: 10 },
  list: { paddingHorizontal: spacing.md, paddingBottom: 96, gap: 12 },
  create: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  createText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: {
    width: 112,
    height: 112,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  cardText: { flex: 1, paddingVertical: 4 },
  welcome: { marginTop: 4 },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  category: {
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
  },
  categoryText: { fontFamily: fonts.bold, fontSize: 12, fontStyle: 'italic' },
  count: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textMuted,
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyBtn: { marginTop: 16 },
});
