import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { ArrowRightLeft, Gem, Wallet } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { FAMILIES, TASKS, VISITORS } from '../../data/social';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Sheet from '../../components/Sheet';
import { Card } from '../../components/ListRow';
import { CoinIcon } from '../../components/CoinPill';
import { HiButton, HostRow } from '../../components/Social';

// 2 diamonds exchange for 1 coin.
const DIAMONDS_PER_COIN = 2;

/* ---------- Diamonds ---------- */
export function DiamondsScreen({ navigation }) {
  const { isHost, addCoins, addTransaction } = useApp();
  const [diamonds, setDiamonds] = useState(380);
  const [done, setDone] = useState(null);

  const exchange = amount => {
    const d = Math.min(amount, diamonds);
    const coins = Math.floor(d / DIAMONDS_PER_COIN);
    if (!coins) return;
    setDiamonds(x => x - coins * DIAMONDS_PER_COIN);
    addCoins(coins);
    addTransaction({
      type: 'recharge',
      title: 'Diamonds → coins',
      sub: `${num(coins * DIAMONDS_PER_COIN)} diamonds`,
      amount: coins,
    });
    setDone(coins);
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
          <Txt style={styles.heroSub}>Diamonds come from gifts you receive</Txt>
        </LinearGradient>

        <Txt variant="h3" style={styles.section}>
          Exchange for coins
        </Txt>
        <Txt variant="small" style={styles.hint}>
          {DIAMONDS_PER_COIN} diamonds = 1 coin. Coins are added to your wallet
          instantly.
        </Txt>
        <View style={styles.exchange}>
          {[100, 500, 2000, diamonds].map((d, i) => (
            <Pressable
              key={i}
              style={styles.exItem}
              onPress={() => exchange(d)}
              disabled={d < DIAMONDS_PER_COIN}
            >
              <View style={styles.exRow}>
                <Gem size={14} color="#38BDF8" />
                <Txt variant="label">{i === 3 ? 'All' : num(d)}</Txt>
              </View>
              <ArrowRightLeft size={14} color={colors.textFaint} />
              <View style={styles.exRow}>
                <CoinIcon size={14} />
                <Txt variant="label">
                  {num(Math.floor(d / DIAMONDS_PER_COIN))}
                </Txt>
              </View>
            </Pressable>
          ))}
        </View>

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
  const { greeted, greet, vipLevel } = useApp();
  const locked = vipLevel < 1;
  return (
    <Screen>
      <Header
        title="Visitors"
        subtitle={`${VISITORS.length} people viewed your profile`}
      />
      <FlatList
        data={VISITORS}
        keyExtractor={v => v.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          locked ? (
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
        renderItem={({ item }) => (
          <HostRow
            host={item.host}
            subtitle={`Visited ${item.time}${
              locked ? '' : ` · ${item.times}×`
            }`}
            onPress={() =>
              navigation.navigate('HostProfile', { host: item.host })
            }
            right={
              <HiButton
                greeted={greeted.includes(item.host.id)}
                onPress={() => {
                  const first = !greeted.includes(item.host.id);
                  greet(item.host.id);
                  navigation.navigate('ChatRoom', {
                    chat: {
                      userId: item.host.id,
                      name: item.host.name,
                      photo: item.host.photo,
                      online: item.host.online,
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

/* ---------- Tasks ---------- */
export function TasksScreen() {
  const { claimedTasks, claimTask, addCoins, addTransaction } = useApp();
  const [group, setGroup] = useState('Daily');
  const tasks = TASKS.filter(t => t.group === group);
  const earned = TASKS.filter(t => claimedTasks.includes(t.id)).reduce(
    (n, t) => n + t.reward,
    0,
  );

  const claim = t => {
    claimTask(t.id);
    addCoins(t.reward);
    addTransaction({
      type: 'recharge',
      title: `Task reward · ${t.title}`,
      sub: 'Tasks',
      amount: t.reward,
    });
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
        <Card padded={false}>
          {tasks.map((t, i) => {
            const complete = t.progress >= t.goal;
            const claimed = claimedTasks.includes(t.id);
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
                  title={claimed ? 'Claimed' : complete ? 'Claim' : 'Go'}
                  size="sm"
                  full={false}
                  variant={
                    claimed ? 'secondary' : complete ? 'primary' : 'outline'
                  }
                  disabled={claimed || !complete}
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
  const { family, setFamily, addCoins } = useApp();
  const [open, setOpen] = useState(null);

  return (
    <Screen>
      <Header
        title="Families"
        subtitle="Join a family, earn weekly coin rewards"
      />
      <FlatList
        data={FAMILIES}
        keyExtractor={f => f.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          family ? (
            <LinearGradient
              colors={['#1C1C1E', '#1C1C1E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.myFamily}
            >
              <Txt style={styles.bigEmoji}>{family.emoji}</Txt>
              <View style={styles.flex}>
                <Txt style={styles.myFamilyTitle}>{family.name}</Txt>
                <Txt style={styles.heroSub}>
                  Level {family.level} · {family.members} members
                </Txt>
              </View>
              <Button
                title="Leave"
                size="sm"
                variant="light"
                full={false}
                onPress={() => setFamily(null)}
              />
            </LinearGradient>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Pressable style={styles.family} onPress={() => setOpen(item)}>
            <Txt style={styles.rankNo}>{index + 1}</Txt>
            <Txt style={styles.familyEmoji}>{item.emoji}</Txt>
            <View style={styles.flex}>
              <Txt variant="h3">{item.name}</Txt>
              <Txt variant="small" numberOfLines={1}>
                Lv.{item.level} · {item.members} members · {num(item.weekly)}{' '}
                weekly
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
            <Txt variant="body" color={colors.textMuted}>
              {open.desc}
            </Txt>
            <View style={styles.familyStats}>
              <Txt variant="label">Level {open.level}</Txt>
              <Txt variant="label">{open.members} members</Txt>
              <Txt variant="label">{num(open.weekly)} weekly</Txt>
            </View>
            <Button
              title={
                family?.id === open.id
                  ? 'You’re a member'
                  : 'Join family · +50 coins'
              }
              disabled={family?.id === open.id}
              onPress={() => {
                if (family?.id !== open.id) addCoins(50);
                setFamily(open);
                setOpen(null);
              }}
            />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingBottom: 24, gap: 12 },
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
