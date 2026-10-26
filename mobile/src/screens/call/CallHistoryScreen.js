import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Video,
} from 'lucide-react-native';
import { colors, fonts, spacing } from '../../theme';
import { get } from '../../api/client';
import { toAppHost } from '../../api/hosts';
import { timeLabel } from '../../data/economy';
import { OUTCOME, callStatus } from '../../utils/calls';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import Segmented from '../../components/Segmented';
import IconButton from '../../components/IconButton';
import { useSecureScreen } from '../../utils/secure';

const mmss = s =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(
    2,
    '0',
  )}`;

// Server call → the row this screen draws.
function toRow(c) {
  const incoming = c.role === 'host';
  const missed = c.status === 'missed' && incoming;
  return {
    id: c.id,
    name: c.other?.name || 'Deleted user',
    photo: c.other?.photo,
    other: c.other,
    type: c.type,
    dir: missed ? 'missed' : incoming ? 'incoming' : 'outgoing',
    duration: c.duration ? mmss(c.duration) : null,
    status:
      c.status === 'ended'
        ? OUTCOME[c.endReason] || 'completed'
        : c.status === 'missed'
        ? 'no_answer'
        : c.status,
    coins: c.role === 'caller' ? c.chargedCoins : 0,
    earned: c.role === 'host' ? c.earned : 0,
    time: timeLabel(c.createdAt),
  };
}

const directionIcon = call => {
  if (call.dir === 'missed') return PhoneMissed;
  if (!call.duration) return PhoneOff;
  return call.dir === 'incoming' ? PhoneIncoming : PhoneOutgoing;
};

export default function CallHistoryScreen({ navigation }) {
  useSecureScreen();
  const [tab, setTab] = useState('all');
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await get('/calls?limit=100');
      setCalls(r.items.map(toRow));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const all = calls || [];
  const missed = all.filter(c => c.dir === 'missed');
  const data = tab === 'all' ? all : missed;

  return (
    <Screen>
      <Header
        title="Calls"
        subtitle={`${missed.length} missed call${
          missed.length === 1 ? '' : 's'
        }`}
      />
      <Segmented
        style={styles.tabs}
        value={tab}
        onChange={setTab}
        options={[
          { key: 'all', label: 'All calls' },
          { key: 'missed', label: 'Missed', count: missed.length },
        ]}
      />
      {!calls && !error ? (
        <ActivityIndicator color={colors.primary} style={styles.empty} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={c => c.id}
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
          ListEmptyComponent={
            <Txt
              variant="body"
              color={error ? colors.danger : colors.textMuted}
              center
              style={styles.empty}
            >
              {error || 'No calls yet.'}
            </Txt>
          }
          renderItem={({ item }) => {
            const DirIcon = directionIcon(item);
            const notConnected = !item.duration;
            const status = callStatus(item.status);
            const ended = !item.status || item.status === 'completed';
            const tone = notConnected
              ? colors.danger
              : ended
              ? colors.success
              : colors.warning;
            // You can call back hosts (users can't be called).
            const canCall = item.other?.isHost;
            return (
              <View style={styles.row}>
                <Avatar uri={item.photo} size={52} />
                <View style={styles.text}>
                  <Txt
                    variant="h3"
                    color={item.dir === 'missed' ? colors.danger : colors.ink}
                  >
                    {item.name}
                  </Txt>
                  <View style={styles.meta}>
                    <DirIcon size={14} color={tone} />
                    <Txt variant="small">
                      {item.type === 'video' ? 'Video' : 'Voice'} · {item.time}
                      {item.duration ? ` · ${item.duration}` : ''}
                    </Txt>
                  </View>
                  {item.status && item.status !== 'completed' ? (
                    <Txt style={[styles.status, { color: tone }]}>
                      {status.label}
                      {status.charged || item.dir !== 'outgoing'
                        ? ''
                        : ' · not charged'}
                    </Txt>
                  ) : null}
                </View>
                <View style={styles.right}>
                  {item.coins ? (
                    <Txt style={styles.coins}>−{item.coins} coins</Txt>
                  ) : null}
                  {item.earned ? (
                    <Txt style={[styles.coins, styles.earned]}>
                      +₹{item.earned}
                    </Txt>
                  ) : null}
                  {canCall ? (
                    <IconButton
                      icon={item.type === 'video' ? Video : Phone}
                      variant="tint"
                      size={42}
                      shadowed={false}
                      onPress={() =>
                        navigation.navigate('Call', {
                          user: toAppHost(item.other),
                          video: item.type === 'video',
                        })
                      }
                    />
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { marginHorizontal: spacing.md, marginBottom: 8 },
  list: { paddingBottom: 24 },
  empty: { marginTop: 60 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { fontFamily: fonts.semibold, fontSize: 12 },
  right: { alignItems: 'flex-end', gap: 6 },
  coins: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  earned: { color: colors.success },
});
