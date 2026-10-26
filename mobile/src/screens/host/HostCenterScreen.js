// Host Center: everything an approved host does — go online, go live, set
// prices, see today's earnings, level up, daily tasks, agency and payouts.
// Also used as the "Host" tab for approved hosts.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import {
  BookOpen,
  Building2,
  Clock3,
  Gem,
  Lock,
  Phone,
  Radio,
  Video,
  Wallet,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { HOST_LEVELS, HOST_LEVEL_MAX, useApp } from '../../context/AppContext';
import { ECONOMY, daysAgo, inr, netPerMinute, split } from '../../data/economy';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Sheet from '../../components/Sheet';
import RateChips from '../../components/RateChips';
import ListRow, { Card } from '../../components/ListRow';
import { CoinIcon } from '../../components/CoinPill';
import { get, post } from '../../api/client';

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Txt style={styles.statValue}>{value}</Txt>
      <Txt variant="tiny">{label}</Txt>
    </View>
  );
}

function Progress({ value }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.min(value, 1) * 100}%` }]} />
    </View>
  );
}

export default function HostCenterScreen({ navigation, tab }) {
  const {
    user,
    hostApp,
    hostLevel,
    callMinutes,
    hostRates,
    setHostRates,
    hostOnline,
    setHostOnline,
    earnings,
    balance,
    hostAgency,
    setHostAgency,
    refreshHostMoney,
    hostInfo,
  } = useApp();
  const [sheet, setSheet] = useState(null); // prices | level | agency
  const [draft, setDraft] = useState(hostRates);
  const [code, setCode] = useState('');
  const maxRate = HOST_LEVEL_MAX[hostLevel];
  const next = HOST_LEVELS.find(l => l.level === hostLevel + 1);
  const current = HOST_LEVELS.find(l => l.level === hostLevel);

  // Today's numbers, all from the earnings ledger.
  const t = useMemo(() => {
    const list = earnings.filter(e => daysAgo(e.ts) === 0);
    const calls = list.filter(
      e => e.source === 'video' || e.source === 'voice',
    );
    return {
      net: list.reduce((n, e) => n + split(e).net, 0),
      calls: calls.length,
      callMin: calls.reduce((n, e) => n + (e.minutes || 0), 0),
      liveMin: 0,
      // The server counts calls (one call can bill in several rows).
      ...(hostInfo?.today && {
        net: hostInfo.today.net,
        calls: hostInfo.today.calls,
        callMin: hostInfo.today.callMinutes,
        liveMin: hostInfo.today.liveMinutes,
      }),
    };
  }, [earnings, hostInfo]);

  // Daily tasks: progress and claims are the server's (rewards land as bonus earnings).
  const [tasks, setTasks] = useState([]);
  const [claiming, setClaiming] = useState(null);
  const loadTasks = useCallback(
    () =>
      get('/tasks')
        .then(r =>
          setTasks(
            r.host.map(x => ({
              ...x,
              done: x.progress,
              money: x.id === 'h_earn',
              unit: x.id === 'h_live' ? 'min' : '',
            })),
          ),
        )
        .catch(() => {}),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks]),
  );
  // Progress moves with calls / lives / earnings.
  useEffect(() => {
    loadTasks();
  }, [hostInfo, loadTasks]);
  const claim = async task => {
    setClaiming(task.id);
    try {
      await post(`/tasks/${task.id}/claim`);
      await Promise.all([loadTasks(), refreshHostMoney()]);
    } catch (e) {
      Alert.alert('Couldn’t claim', e.message);
    } finally {
      setClaiming(null);
    }
  };

  const photo = hostApp.data?.photos?.[0] || user.photos[0];

  return (
    <Screen scroll>
      <Header title="Host Center" back={!tab} />
      <View style={styles.body}>
        {/* Identity + availability */}
        <Card style={styles.me}>
          <View style={styles.meRow}>
            <Image source={{ uri: photo }} style={styles.avatar} />
            <View style={styles.flex}>
              <Txt variant="h3" numberOfLines={1}>
                {hostApp.data?.name || user.name}
              </Txt>
              <Txt variant="small">
                Host ID 1048 ·{' '}
                {hostAgency ? `Agency ${hostAgency}` : 'Independent'}
              </Txt>
            </View>
            <Pressable style={styles.level} onPress={() => setSheet('level')}>
              <Txt style={styles.levelText}>Lv {hostLevel}</Txt>
            </Pressable>
          </View>
          <View style={styles.sep} />
          <ListRow
            icon={Radio}
            iconColor={hostOnline ? colors.success : colors.textMuted}
            iconBg={hostOnline ? '#DFF7EE' : colors.surfaceMuted}
            title={hostOnline ? 'Available for calls' : 'Not available'}
            subtitle={
              hostOnline
                ? 'Users can video & voice call you now.'
                : 'Turn on to start receiving calls.'
            }
            toggle={hostOnline}
            onToggle={setHostOnline}
            last
          />
        </Card>

        {/* Main actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.actionLive]}
            onPress={() => navigation.navigate('GoLive')}
          >
            <Video size={26} color={colors.white} fill={colors.white} />
            <Txt style={styles.actionTitleLight}>Go live</Txt>
            <Txt style={styles.actionSubLight}>Gifts, tickets & calls</Txt>
          </Pressable>
          <Pressable
            style={styles.action}
            onPress={() => navigation.navigate('HostDashboard')}
          >
            <Wallet size={26} color={colors.ink} />
            <Txt style={styles.actionTitle} numberOfLines={1}>
              {inr(balance.available)}
            </Txt>
            <Txt variant="tiny">Earnings & withdraw ›</Txt>
          </Pressable>
        </View>

        {/* Today */}
        <View style={styles.hRow}>
          <Txt variant="h3">Today</Txt>
          <Pressable
            onPress={() => navigation.navigate('HostDashboard')}
            hitSlop={8}
          >
            <Txt variant="label" color={colors.primary}>
              All earnings ›
            </Txt>
          </Pressable>
        </View>
        <Card style={styles.stats}>
          <Stat label="Earned" value={inr(t.net)} />
          <Stat label="Calls" value={t.calls} />
          <Stat label="Call min" value={t.callMin} />
          <Stat label="Live min" value={t.liveMin} />
        </Card>

        {/* Prices */}
        <Txt variant="h3" style={styles.h}>
          Your call prices
        </Txt>
        <Card padded={false}>
          {[
            ['video', 'Video call', Video],
            ['voice', 'Voice call', Phone],
          ].map(([k, label, Icon], i) => (
            <ListRow
              key={k}
              icon={Icon}
              title={label}
              subtitle={`You earn ${inr(
                netPerMinute(hostRates[k], k, hostAgency),
              )}/min`}
              right={
                <View style={styles.price}>
                  <CoinIcon size={16} />
                  <Txt variant="label">{hostRates[k]}/min</Txt>
                </View>
              }
              onPress={() => {
                setDraft(hostRates);
                setSheet('prices');
              }}
              last={i === 1}
            />
          ))}
        </Card>

        {/* Level */}
        <Pressable onPress={() => setSheet('level')}>
          <Card style={styles.levelCard}>
            <View style={styles.levelHead}>
              <Txt variant="label">
                Level {hostLevel}
                {next ? ` → ${next.level}` : ' · Top level'}
              </Txt>
              <Txt variant="small">
                {next
                  ? `${num(callMinutes)} / ${num(next.minutes)} call min`
                  : `${num(callMinutes)} call min`}
              </Txt>
            </View>
            <Progress
              value={
                next
                  ? (callMinutes - current.minutes) /
                    (next.minutes - current.minutes)
                  : 1
              }
            />
            <Txt variant="tiny" style={styles.levelNote}>
              {next
                ? `Level ${next.level} unlocks prices up to ${next.maxRate} coins/min ›`
                : 'All prices unlocked.'}
            </Txt>
          </Card>
        </Pressable>

        {/* Daily tasks */}
        <Txt variant="h3" style={styles.h}>
          Daily tasks
        </Txt>
        <Card>
          {tasks.map((task, i) => {
            const done = task.done >= task.goal;
            const got = task.claimed;
            return (
              <View key={task.id} style={i > 0 && styles.taskGap}>
                <View style={styles.taskHead}>
                  <View style={styles.flex}>
                    <Txt variant="label">{task.title}</Txt>
                    <Txt variant="tiny">
                      {task.money
                        ? `${inr(Math.min(task.done, task.goal))} / ${inr(
                            task.goal,
                          )}`
                        : `${Math.min(task.done, task.goal)} / ${task.goal}${
                            task.unit ? ` ${task.unit}` : ''
                          }`}
                    </Txt>
                  </View>
                  {got ? (
                    <Txt variant="label" color={colors.success}>
                      Claimed
                    </Txt>
                  ) : (
                    <Pressable
                      disabled={!done || !!claiming}
                      onPress={() => claim(task)}
                      style={[styles.claim, !done && styles.claimOff]}
                    >
                      <Gem
                        size={12}
                        color={done ? colors.white : colors.textMuted}
                      />
                      <Txt
                        style={[styles.claimText, !done && styles.claimTextOff]}
                      >
                        +{inr(task.reward * ECONOMY.coinInr)}
                      </Txt>
                    </Pressable>
                  )}
                </View>
                <Progress value={task.done / task.goal} />
              </View>
            );
          })}
        </Card>

        {/* Agency & help */}
        <Card padded={false} style={styles.help}>
          <ListRow
            icon={Building2}
            title={hostAgency ? `Agency · ${hostAgency}` : 'Join an agency'}
            subtitle={
              hostAgency
                ? `They receive ${ECONOMY.agencyCut}% of your share`
                : 'Training, promotion and support'
            }
            onPress={() => {
              setCode('');
              setSheet('agency');
            }}
          />
          <ListRow
            icon={Wallet}
            title="Withdraw"
            subtitle={`Paid to your bank or UPI in ${ECONOMY.payoutTime}`}
            onPress={() => navigation.navigate('Withdraw')}
          />
          <ListRow
            icon={BookOpen}
            title="Host rules"
            subtitle="What’s allowed on calls and lives"
            onPress={() => navigation.navigate('Content', { page: 'terms' })}
          />
          <ListRow
            icon={Clock3}
            title="Call history"
            onPress={() => navigation.navigate('CallHistory')}
            last
          />
        </Card>
      </View>

      {/* Prices */}
      <Sheet
        visible={sheet === 'prices'}
        onClose={() => setSheet(null)}
        title="Call prices"
      >
        {['video', 'voice'].map((k, i) => (
          <View key={k} style={i > 0 && styles.sheetGap}>
            <Txt variant="label">
              {k === 'video' ? 'Video' : 'Voice'} call · coins per minute
            </Txt>
            <Txt variant="tiny">
              You earn {inr(netPerMinute(draft[k], k, hostAgency))}/min at{' '}
              {draft[k]} coins
            </Txt>
            <RateChips
              kind={k}
              value={draft[k]}
              maxRate={maxRate}
              onChange={v => setDraft(d => ({ ...d, [k]: v }))}
            />
          </View>
        ))}
        <Button
          title="Save prices"
          style={styles.sheetGap}
          onPress={() =>
            setHostRates(draft)
              .then(() => setSheet(null))
              .catch(e => Alert.alert('Couldn’t save prices', e.message))
          }
        />
      </Sheet>

      {/* Levels */}
      <Sheet
        visible={sheet === 'level'}
        onClose={() => setSheet(null)}
        title="Host levels"
      >
        <Txt variant="small">
          Levels go up with connected call minutes. Higher levels can set higher
          prices.
        </Txt>
        <View style={styles.levels}>
          {HOST_LEVELS.map(l => {
            const reached = hostLevel >= l.level;
            return (
              <View
                key={l.level}
                style={[
                  styles.levelRow,
                  l.level === hostLevel && styles.levelRowOn,
                ]}
              >
                <View
                  style={[styles.levelBadge, !reached && styles.levelBadgeOff]}
                >
                  {reached ? (
                    <Txt style={styles.levelBadgeText}>{l.level}</Txt>
                  ) : (
                    <Lock size={14} color={colors.textMuted} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Txt variant="label">Level {l.level}</Txt>
                  <Txt variant="small">
                    {l.minutes
                      ? `${num(l.minutes)} call minutes`
                      : 'Starting level'}
                  </Txt>
                </View>
                <Txt variant="small">Up to {l.maxRate} coins/min</Txt>
              </View>
            );
          })}
        </View>
      </Sheet>

      {/* Agency */}
      <Sheet
        visible={sheet === 'agency'}
        onClose={() => setSheet(null)}
        title="Agency"
      >
        {hostAgency ? (
          <>
            <Txt variant="body">
              You’re with agency <Txt variant="label">{hostAgency}</Txt>. They
              receive {ECONOMY.agencyCut}% of your share of every earning.
            </Txt>
            <Button
              title="Leave agency"
              variant="outline"
              style={styles.sheetGap}
              onPress={() =>
                setHostAgency(null)
                  .then(() => setSheet(null))
                  .catch(e => Alert.alert('Couldn’t leave', e.message))
              }
            />
          </>
        ) : (
          <>
            <Txt variant="small">
              Agencies help hosts with training, promotion and support. They
              receive {ECONOMY.agencyCut}% of your share.
            </Txt>
            <Input
              label="Agency code"
              icon={Building2}
              placeholder="e.g. STAR1048"
              autoCapitalize="characters"
              value={code}
              onChangeText={v => setCode(v.toUpperCase().trim())}
              style={styles.sheetGap}
            />
            <Button
              title="Join agency"
              disabled={code.length < 4}
              style={styles.sheetGap}
              onPress={() =>
                setHostAgency(code.trim())
                  .then(() => setSheet(null))
                  .catch(e => Alert.alert('Couldn’t join agency', e.message))
              }
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md, paddingBottom: 24 },
  me: { paddingBottom: 0 },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  level: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  levelText: { fontFamily: fonts.bold, fontSize: 12, color: colors.white },
  sep: { height: 1, backgroundColor: colors.border, marginTop: 14 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: {
    flex: 1,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    gap: 4,
  },
  actionLive: { backgroundColor: colors.primary },
  actionTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    marginTop: 8,
  },
  actionTitleLight: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.white,
    marginTop: 8,
  },
  actionSubLight: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  h: { marginTop: 22, marginBottom: 10 },
  hRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 10,
  },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink },
  price: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  levelCard: { marginTop: 16 },
  levelHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  levelNote: { marginTop: 8 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  taskGap: { marginTop: 16 },
  taskHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  claim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  claimOff: { backgroundColor: colors.surfaceMuted },
  claimText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.white },
  claimTextOff: { color: colors.textMuted },
  help: { marginTop: 16 },
  sheetGap: { marginTop: 18 },
  levels: { marginTop: 12, gap: 6 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: radius.md,
  },
  levelRowOn: { backgroundColor: colors.surfaceMuted },
  levelBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeOff: { backgroundColor: colors.surfaceMuted },
  levelBadgeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
});
