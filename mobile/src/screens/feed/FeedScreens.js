import React from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Search, UsersRound } from 'lucide-react-native';
import { colors, fonts, spacing } from '../../theme';
import { HOSTS } from '../../data/mock';
import { ROOMS } from '../../data/social';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import { RoomCard } from '../rooms/RoomsScreen';
import {
  CallFab,
  LiveCard,
  QuickActions,
  Section,
  TopBar,
} from '../../components/Live';

const W = Dimensions.get('window').width;
const GAP = 3;
const COL = (W - GAP * 3) / 2;
const ROW_CARD = W * 0.45;

// Online hosts open their live room; offline hosts open their profile.
const openHost = (navigation, h) =>
  navigation.navigate(h.online ? 'LiveRoom' : 'HostProfile', { host: h });

const byOnline = list =>
  [...list].sort((a, b) => b.online - a.online || b.followers - a.followers);

// Lists behind the Explore "More" links.
export const LISTS = {
  nearby: {
    title: 'Nearby',
    hosts: () => [...HOSTS].sort((a, b) => a.distanceKm - b.distanceKm),
  },
  new: {
    title: 'New hosts',
    hosts: () => HOSTS.filter(h => h.followers < 10000),
  },
  popular: {
    title: 'Popular',
    hosts: () => [...HOSTS].sort((a, b) => b.followers - a.followers),
  },
  rated: {
    title: 'Top rated',
    hosts: () => [...HOSTS].sort((a, b) => b.rating - a.rating),
  },
  online: { title: 'Online now', hosts: () => HOSTS.filter(h => h.online) },
};

function Grid({ hosts, header, empty, navigation }) {
  return (
    <FlatList
      data={hosts}
      keyExtractor={h => h.id}
      numColumns={2}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.grid}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      renderItem={({ item }) => (
        <LiveCard
          host={item}
          width={COL}
          onPress={() => openHost(navigation, item)}
        />
      )}
    />
  );
}

/* ---------- For You ---------- */
export function ForYouScreen({ navigation }) {
  return (
    <Screen>
      <TopBar />
      <Grid
        hosts={byOnline(HOSTS)}
        header={<QuickActions />}
        navigation={navigation}
      />
      <CallFab />
    </Screen>
  );
}

/* ---------- Following ---------- */
export function FollowingScreen({ navigation }) {
  const { following } = useApp();
  const followed = HOSTS.filter(h => following.includes(h.id));
  const suggestions = byOnline(HOSTS.filter(h => !following.includes(h.id)));
  const anyOnline = followed.some(h => h.online);

  return (
    <Screen>
      <TopBar />
      <Grid
        hosts={suggestions}
        navigation={navigation}
        header={
          <>
            <QuickActions />
            {followed.length ? (
              <>
                <Txt style={styles.heading}>Hosts you follow</Txt>
                <View style={styles.followedRow}>
                  {followed.map(h => (
                    <LiveCard
                      key={h.id}
                      host={h}
                      width={COL}
                      onPress={() => openHost(navigation, h)}
                    />
                  ))}
                </View>
              </>
            ) : null}
            {!anyOnline ? (
              <View style={styles.empty}>
                <UsersRound size={56} color={colors.ink} strokeWidth={1.5} />
                <Txt
                  variant="body"
                  color={colors.text}
                  style={styles.emptyText}
                >
                  {followed.length
                    ? 'None of the hosts you follow are online.'
                    : 'You’re not following anyone yet.'}
                </Txt>
              </View>
            ) : null}
            <Txt style={styles.heading}>Suggested for you</Txt>
          </>
        }
      />
      <CallFab />
    </Screen>
  );
}

/* ---------- Explore ---------- */
export function ExploreScreen({ navigation }) {
  const row = key =>
    LISTS[key]
      .hosts()
      .map(h => (
        <LiveCard
          key={h.id}
          host={h}
          width={ROW_CARD}
          height={ROW_CARD * 1.5}
          onPress={() => openHost(navigation, h)}
        />
      ));

  return (
    <Screen>
      <TopBar
        right={
          <Pressable onPress={() => navigation.navigate('Search')} hitSlop={8}>
            <Search size={25} color={colors.ink} strokeWidth={1.9} />
          </Pressable>
        }
      />
      <FlatList
        data={[]}
        renderItem={null}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.explore}
        ListHeaderComponent={
          <>
            <QuickActions />
            <Section
              title="Nearby"
              onMore={() => navigation.navigate('HostList', { list: 'nearby' })}
            >
              {row('nearby')}
            </Section>
            <Section
              title="Audio rooms"
              onMore={() => navigation.navigate('Rooms')}
            >
              {ROOMS.slice(0, 5).map(r => (
                <View key={r.id} style={styles.roomCell}>
                  <RoomCard
                    room={r}
                    onPress={() => navigation.navigate('Room', { room: r })}
                  />
                </View>
              ))}
            </Section>
            <Section
              title="New hosts"
              onMore={() => navigation.navigate('HostList', { list: 'new' })}
            >
              {row('new')}
            </Section>
            <Section
              title="Top rated"
              onMore={() => navigation.navigate('HostList', { list: 'rated' })}
            >
              {row('rated')}
            </Section>
            <Section
              title="Popular"
              onMore={() =>
                navigation.navigate('HostList', { list: 'popular' })
              }
            >
              {row('popular')}
            </Section>
            <Section
              title="Moments"
              onMore={() => navigation.navigate('Moments')}
            >
              <Pressable
                style={styles.momentsCta}
                onPress={() => navigation.navigate('Moments')}
              >
                <Txt style={styles.momentsEmoji}>📸</Txt>
                <Txt variant="h3">Photos & videos from hosts</Txt>
                <Txt variant="small">See what hosts are sharing today</Txt>
              </Pressable>
            </Section>
          </>
        }
      />
      <CallFab />
    </Screen>
  );
}

/* ---------- "More" list ---------- */
export function HostListScreen({ navigation, route }) {
  const list = LISTS[route.params?.list] || LISTS.online;
  return (
    <Screen>
      <Header title={list.title} />
      <Grid hosts={list.hosts()} navigation={navigation} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { paddingHorizontal: GAP, paddingBottom: 96, gap: GAP },
  gridRow: { gap: GAP },
  heading: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    paddingHorizontal: spacing.md - GAP,
    marginTop: 14,
    marginBottom: 12,
  },
  followedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 14 },
  emptyText: { textAlign: 'center' },
  explore: { paddingBottom: 96 },
  roomCell: { width: W * 0.8 },
  momentsCta: {
    width: W - 32,
    marginHorizontal: 13,
    padding: 20,
    gap: 4,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  momentsEmoji: { fontSize: 30, lineHeight: 38 },
});
