import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import { ArrowRightLeft, Gem, Plus, Wallet } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { get, post } from '../../api/client';
import { toAppHost } from '../../api/hosts';
import { timeLabel } from '../../api/chat';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Input from '../../components/Input';
import Sheet from '../../components/Sheet';
import { Card } from '../../components/ListRow';
import { CoinIcon } from '../../components/CoinPill';
import { HiButton, HostRow } from '../../components/Social';

const membersLabel = n => `${n} member${n === 1 ? '' : 's'}`;
const FAMILY_EMOJI = ['⭐', '💖', '🔥', '👑', '🌸', '🎵', '🦁', '🌙'];

/** Loads `path` every time the screen gains focus. */
function useServer(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(
    () =>
      get(path)
        .then(r => {
          setData(r);
          setError('');
          return r;
        })
        .catch(e => setError(e.message)),
    [path],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  return { data, error, load, setData };
}

/* ---------- Diamonds ---------- */
export function DiamondsScreen({ navigation }) {
  const { isHost, diamonds, config, exchangeDiamonds, refreshStore } = useApp();
  const rate = config?.diamondsPerCoin || 2;
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  useFocusEffect(
    useCallback(() => {
      refreshStore();
    }, [refreshStore]),
  );

  const exchange = async amount => {
    const d = Math.min(amount, diamonds);
    if (Math.floor(d / rate) < 1) return;
    setError('');
    try {
      const r = await exchangeDiamonds(d);
      setDone(r.coins);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Screen scroll>
      <Header title="Diamonds" />
      <View style={styles.body}>
        <LinearGradient
          colors={['#1C1C1E', '#1C1C1E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Gem size={30} color={colors.white} />
          <Txt style={styles.heroAmount}>{num(diamonds)}</Txt>
          <Txt style={styles.heroSub}>
            Diamonds come from gifts you receive in rooms
          </Txt>
        </LinearGradient>

        <Txt variant="h3" style={styles.section}>
          Exchange for coins
        </Txt>
        <Txt variant="small" style={styles.hint}>
          {rate} diamonds = 1 coin. Coins are added to your wallet instantly.
        </Txt>
        <View style={styles.exchange}>
          {[100, 500, 2000, diamonds].map((d, i) => (
            <Pressable
              key={i}
              style={[
                styles.exItem,
                (d > diamonds || d < rate) && styles.exOff,
              ]}
              onPress={() => exchange(d)}
              disabled={d < rate || d > diamonds}
            >
              <View style={styles.exRow}>
                <Gem size={14} color="#38BDF8" />
                <Txt variant="label">{i === 3 ? 'All' : num(d)}</Txt>
              </View>
              <ArrowRightLeft size={14} color={colors.textFaint} />
              <View style={styles.exRow}>
                <CoinIcon size={14} />
                <Txt variant="label">{num(Math.floor(d / rate))}</Txt>
              </View>
            </Pressable>
          ))}
        </View>
        {error ? (
          <Txt variant="small" color={colors.danger} style={styles.hint}>
            {error}
          </Txt>
        ) : null}

        {isHost ? (
          <Button
            title="Withdraw earnings"
            icon={Wallet}
            variant="outline"
            style={styles.section}
            onPress={() => navigation.navigate('HostDashboard')}
          />
        ) : null}
      </View>
      <Sheet visible={!!done} onClose={() => setDone(null)}>
        <View style={styles.center}>
          <Txt style={styles.bigEmoji}>🪙</Txt>
          <Txt variant="h2" center>
            +{num(done || 0)} coins
          </Txt>
          <Txt variant="small" center style={styles.hint}>
            Added to your wallet.
          </Txt>
          <Button title="Done" onPress={() => setDone(null)} />
        </View>
      </Sheet>
    </Screen>
  );
}

/* ---------- Visitors ---------- */
export function VisitorsScreen({ navigation }) {
  const { greeted } = useApp();
  const { data, error } = useServer('/social/visitors?limit=100');
  const items = data?.items || [];
  const locked = data?.locked ?? true;
  return (
    <Screen>
      <Header
        title="Visitors"
        subtitle={
          data
            ? `${data.total} ${
                data.total === 1 ? 'person' : 'people'
              } viewed your profile`
            : ' '
        }
      />
      {!data && !error ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : null}
      <FlatList
        data={items}
        keyExtractor={v => v.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          locked && items.length ? (
            <Pressable onPress={() => navigation.navigate('Vip')}>
              <LinearGradient
                colors={['#FFF1C2', '#FFF1C2']}
                style={styles.lock}
              >
                <Txt variant="label" style={styles.flex}>
                  VIP members see visitors’ full history and visit counts.
                </Txt>
                <Txt variant="label" color={colors.primary}>
                  Get VIP
                </Txt>
              </LinearGradient>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          data || error ? (
            <Txt
              variant="body"
              color={error ? colors.danger : colors.textMuted}
              center
              style={styles.loading}
            >
              {error || 'No visitors yet. Post a moment to get noticed!'}
            </Txt>
          ) : null
        }
        renderItem={({ item }) => {
          const person = toAppHost(item.user);
          return (
            <HostRow
              host={person}
              subtitle={`Visited ${timeLabel(item.at)}${
                locked ? '' : ` · ${item.times}×`
              }`}
              onPress={() =>
                item.user.isHost
                  ? navigation.navigate('HostProfile', { host: person })
                  : null
              }
              right={
                <HiButton
                  greeted={greeted.includes(person.id)}
                  onPress={() => {
                    navigation.navigate('ChatRoom', {
                      greet: !greeted.includes(person.id),
                      chat: {
                        userId: person.id,
                        name: person.name,
                        photo: person.photo,
                        online: person.online,
                      },
                    });
                  }}
                />
              }
            />
          );
        }}
      />
    </Screen>
  );
}

/* ---------- Tasks ---------- */
export function TasksScreen() {
  const { setCoinsFromServer } = useApp();
  const { data, error, load } = useServer('/tasks');
  const [group, setGroup] = useState('Daily');
  const [busy, setBusy] = useState(null);
  const [claimError, setClaimError] = useState('');
  const all = data?.user || [];
  const tasks = all.filter(t => t.group === group);
  const earned = all.filter(t => t.claimed).reduce((n, t) => n + t.reward, 0);

  const claim = async t => {
    setBusy(t.id);
    setClaimError('');
    try {
      const r = await post(`/tasks/${t.id}/claim`);
      if (typeof r.balance === 'number') setCoinsFromServer(r.balance);
      await load();
    } catch (e) {
      setClaimError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen scroll>
      <Header title="Tasks" subtitle="Complete tasks, earn free coins" />
      <View style={styles.body}>
        <LinearGradient
          colors={['#1E9E5A', '#1E9E5A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Txt style={styles.heroSub}>Earned from tasks</Txt>
          <View style={styles.exRow}>
            <CoinIcon size={26} />
            <Txt style={styles.heroAmount}>{num(earned)}</Txt>
          </View>
        </LinearGradient>
        <View style={styles.chips}>
          {['Daily', 'Newbie'].map(g => (
            <Chip
              key={g}
              small
              label={`${g} tasks`}
              selected={group === g}
              onPress={() => setGroup(g)}
            />
          ))}
        </View>
        {!data && !error ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : null}
        {error || claimError ? (
          <Txt variant="small" color={colors.danger} style={styles.hint}>
            {error || claimError}
          </Txt>
        ) : null}
        <Card padded={false}>
          {tasks.map((t, i) => {
            const complete = t.progress >= t.goal;
            return (
              <View
                key={t.id}
                style={[styles.task, i < tasks.length - 1 && styles.divider]}
              >
                <View style={styles.flex}>
                  <Txt variant="label">{t.title}</Txt>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(t.progress / t.goal, 1) * 100}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.exRow}>
                    <CoinIcon size={12} />
                    <Txt variant="tiny">
                      +{t.reward} · {Math.min(t.progress, t.goal)}/{t.goal}
                    </Txt>
                  </View>
                </View>
                <Button
                  title={t.claimed ? 'Claimed' : complete ? 'Claim' : 'Go'}
                  size="sm"
                  full={false}
                  variant={
                    t.claimed ? 'secondary' : complete ? 'primary' : 'outline'
                  }
                  loading={busy === t.id}
                  disabled={t.claimed || !complete || !!busy}
                  onPress={() => claim(t)}
                />
              </View>
            );
          })}
        </Card>
      </View>
    </Screen>
  );
}

/* ---------- Family ---------- */
export function FamilyScreen() {
  const { config, setCoinsFromServer, refreshMe } = useApp();
  const { data, error, load } = useServer('/families?limit=50');
  const [open, setOpen] = useState(null);
  const [mine, setMine] = useState(null); // my family's detail
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(FAMILY_EMOJI[0]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const fam = config?.families || { createCost: 1000, joinReward: 50 };
  const myId = data?.mine;

  useFocusEffect(
    useCallback(() => {
      if (!myId) return setMine(null);
      get(`/families/${myId}`)
        .then(r => setMine(r.family))
        .catch(() => setMine(null));
    }, [myId]),
  );

  const run = async fn => {
    setBusy(true);
    setActionError('');
    try {
      await fn();
      await load();
      refreshMe().catch(() => {});
      return true;
    } catch (e) {
      setActionError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const join = f =>
    run(async () => {
      const r = await post(`/families/${f.id}/join`);
      if (r.reward) setCoinsFromServer((await get('/me')).user.coins);
    }).then(ok => ok && setOpen(null));
  const leave = () => run(() => post('/families/leave'));
  const create = () =>
    run(async () => {
      await post('/families', { name: name.trim(), emoji });
    }).then(ok => {
      if (ok) {
        setCreating(false);
        setName('');
      }
    });

  return (
    <Screen>
      <Header
        title="Families"
        subtitle="Join a family, climb the weekly ranking"
        right={
          myId ? null : (
            <Pressable onPress={() => setCreating(true)} hitSlop={8}>
              <Plus size={24} color={colors.ink} />
            </Pressable>
          )
        }
      />
      {!data && !error ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : null}
      <FlatList
        data={data?.items || []}
        keyExtractor={f => f.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          mine ? (
            <LinearGradient
              colors={['#1C1C1E', '#1C1C1E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.myFamily}
            >
              <Txt style={styles.bigEmoji}>{mine.emoji}</Txt>
              <View style={styles.flex}>
                <Txt style={styles.myFamilyTitle}>{mine.name}</Txt>
                <Txt style={styles.heroSub}>
                  Level {mine.level} · {membersLabel(mine.members)} ·{' '}
                  {num(mine.weekly)} this week
                </Txt>
              </View>
              <Button
                title="Leave"
                size="sm"
                variant="light"
                full={false}
                loading={busy}
                onPress={leave}
              />
            </LinearGradient>
          ) : error || actionError ? (
            <Txt variant="small" color={colors.danger}>
              {error || actionError}
            </Txt>
          ) : null
        }
        ListEmptyComponent={
          data ? (
            <View style={styles.center}>
              <Txt style={styles.bigEmoji}>👪</Txt>
              <Txt variant="body" color={colors.textMuted} center>
                No families yet. Start the first one!
              </Txt>
              <Button
                title={`Create a family · ${num(fam.createCost)} coins`}
                full={false}
                onPress={() => setCreating(true)}
              />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Pressable style={styles.family} onPress={() => setOpen(item)}>
            <Txt style={styles.rankNo}>{index + 1}</Txt>
            <Txt style={styles.familyEmoji}>{item.emoji}</Txt>
            <View style={styles.flex}>
              <Txt variant="h3">{item.name}</Txt>
              <Txt variant="small" numberOfLines={1}>
                Lv.{item.level} · {membersLabel(item.members)} ·{' '}
                {num(item.weekly)} weekly
              </Txt>
            </View>
          </Pressable>
        )}
      />
      <Sheet
        visible={!!open}
        onClose={() => setOpen(null)}
        title={open ? `${open.emoji} ${open.name}` : ''}
      >
        {open ? (
          <>
            {open.desc ? (
              <Txt variant="body" color={colors.textMuted}>
                {open.desc}
              </Txt>
            ) : null}
            <View style={styles.familyStats}>
              <Txt variant="label">Level {open.level}</Txt>
              <Txt variant="label">{membersLabel(open.members)}</Txt>
              <Txt variant="label">{num(open.weekly)} weekly</Txt>
            </View>
            {actionError ? (
              <Txt variant="small" color={colors.danger} style={styles.hint}>
                {actionError}
              </Txt>
            ) : null}
            <Button
              title={
                myId === open.id
                  ? 'You’re a member'
                  : myId
                  ? 'Leave your family to join'
                  : fam.joinReward
                  ? `Join family · +${fam.joinReward} coins`
                  : 'Join family'
              }
              disabled={!!myId}
              loading={busy}
              onPress={() => join(open)}
            />
          </>
        ) : null}
      </Sheet>
      <Sheet
        visible={creating}
        onClose={() => setCreating(false)}
        title="Create a family"
      >
        <Input
          label="Family name"
          placeholder="e.g. Star Talent"
          value={name}
          onChangeText={setName}
          maxLength={24}
        />
        <View style={styles.emojiRow}>
          {FAMILY_EMOJI.map(e => (
            <Pressable
              key={e}
              onPress={() => setEmoji(e)}
              style={[styles.emojiPick, emoji === e && styles.emojiOn]}
            >
              <Txt style={styles.emojiText}>{e}</Txt>
            </Pressable>
          ))}
        </View>
        {actionError ? (
          <Txt variant="small" color={colors.danger} style={styles.hint}>
            {actionError}
          </Txt>
        ) : null}
        <Button
          title={`Create · ${num(fam.createCost)} coins`}
          disabled={name.trim().length < 3}
          loading={busy}
          onPress={create}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingBottom: 24, gap: 12 },
  loading: { marginTop: 40 },
  exOff: { opacity: 0.45 },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 16,
  },
  emojiPick: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  emojiOn: { borderColor: colors.primary, backgroundColor: '#FFF5F8' },
  emojiText: { fontSize: 22, lineHeight: 28 },
  hero: { alignItems: 'center', padding: 24, borderRadius: radius.xl, gap: 4 },
  heroAmount: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    lineHeight: 42,
    color: colors.white,
  },
  heroSub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
  },
  section: { marginTop: 22, marginBottom: 6 },
  hint: { marginBottom: 12, marginTop: 4 },
  exchange: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  exItem: {
    width: '48%',
    gap: 6,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  center: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  bigEmoji: { fontSize: 44, lineHeight: 52 },
  lock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
  },
  chips: { flexDirection: 'row', gap: 8, marginVertical: 16 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ECE5F1',
    marginVertical: 7,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  myFamily: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.lg,
  },
  myFamilyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.white,
  },
  family: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rankNo: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.textFaint,
    width: 18,
  },
  familyEmoji: { fontSize: 34, lineHeight: 42 },
  familyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 18,
  },
});
