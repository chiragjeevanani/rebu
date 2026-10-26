import React, { useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Search } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { HOSTS } from '../../data/mock';
import { LEADERBOARD } from '../../data/social';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Segmented from '../../components/Segmented';
import { HiButton, HostRow } from '../../components/Social';

/* ---------- Search hosts ---------- */
export function SearchScreen({ navigation }) {
  const { greeted, greet } = useApp();
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const results = term
    ? HOSTS.filter(
        h =>
          h.name.toLowerCase().includes(term) ||
          h.city.toLowerCase().includes(term) ||
          h.id === term,
      )
    : [];

  return (
    <Screen>
      <Header title="Search" />
      <Input
        icon={Search}
        autoFocus
        placeholder="Search by name, city or ID"
        value={q}
        onChangeText={setQ}
        style={styles.search}
      />
      <FlatList
        data={results}
        keyExtractor={h => h.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={styles.empty}
          >
            {term ? 'No hosts found.' : 'Find hosts by name, city or REBU ID.'}
          </Txt>
        }
        renderItem={({ item }) => (
          <HostRow
            host={item}
            subtitle={`${item.city} · ID ${item.id.toUpperCase()}`}
            onPress={() => navigation.navigate('HostProfile', { host: item })}
            right={
              <HiButton
                greeted={greeted.includes(item.id)}
                onPress={() => {
                  const first = !greeted.includes(item.id);
                  greet(item.id);
                  navigation.navigate('ChatRoom', {
                    chat: {
                      userId: item.id,
                      name: item.name,
                      photo: item.photo,
                      online: item.online,
                    },
                    greeting: first,
                  });
                }}
              />
            }
          />
        )}
      />
    </Screen>
  );
}

/* ---------- Leaderboard ---------- */
const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardScreen({ navigation }) {
  const [board, setBoard] = useState('hosts');
  const rows = LEADERBOARD[board];
  const top = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <Screen>
      <Header title="Leaderboard" subtitle="This week" />
      <Segmented
        value={board}
        onChange={setBoard}
        options={[
          { key: 'hosts', label: 'Top hosts' },
          { key: 'givers', label: 'Top gifters' },
        ]}
        style={styles.seg}
      />
      <FlatList
        data={rest}
        keyExtractor={r => `${board}${r.rank}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <LinearGradient
            colors={['#1C1C1E', '#1C1C1E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.podium}
          >
            {[1, 0, 2].map(i => {
              const r = top[i];
              if (!r) return null;
              return (
                <Pressable
                  key={r.rank}
                  style={[styles.podiumItem, i === 0 && styles.podiumFirst]}
                  onPress={() =>
                    r.host &&
                    navigation.navigate('HostProfile', { host: r.host })
                  }
                >
                  <Txt style={styles.medal}>{MEDALS[i]}</Txt>
                  <Image
                    source={{ uri: r.photo }}
                    style={[styles.podiumImg, i === 0 && styles.podiumImgFirst]}
                  />
                  <Txt style={styles.podiumName} numberOfLines={1}>
                    {r.name}
                  </Txt>
                  <Txt style={styles.podiumScore}>{num(r.score)}</Txt>
                </Pressable>
              );
            })}
          </LinearGradient>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              item.host &&
              navigation.navigate('HostProfile', { host: item.host })
            }
          >
            <Txt style={styles.rank}>{item.rank}</Txt>
            <Image source={{ uri: item.photo }} style={styles.rowImg} />
            <Txt variant="h3" style={styles.flex}>
              {item.name}
            </Txt>
            <Txt variant="label" color={colors.warning}>
              {num(item.score)}
            </Txt>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { marginHorizontal: spacing.md, marginBottom: 12 },
  list: { paddingHorizontal: spacing.md, paddingBottom: 24, gap: 10 },
  empty: { paddingVertical: 40 },
  seg: { marginHorizontal: spacing.md, marginBottom: 12 },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    padding: 18,
    paddingTop: 26,
    borderRadius: radius.xl,
    marginBottom: 6,
  },
  podiumItem: { alignItems: 'center', width: '30%' },
  podiumFirst: { marginBottom: 14 },
  medal: { fontSize: 26, lineHeight: 32 },
  podiumImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: colors.white,
  },
  podiumImgFirst: { width: 82, height: 82, borderRadius: 41 },
  podiumName: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
    marginTop: 6,
  },
  podiumScore: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rank: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.textFaint,
    width: 22,
    textAlign: 'center',
  },
  rowImg: { width: 46, height: 46, borderRadius: 23 },
});
