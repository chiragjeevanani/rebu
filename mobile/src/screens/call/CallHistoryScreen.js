import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Video,
} from 'lucide-react-native';
import { colors, fonts, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { callStatus } from '../../utils/calls';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import Segmented from '../../components/Segmented';
import IconButton from '../../components/IconButton';
import { useSecureScreen } from '../../utils/secure';

const directionIcon = call => {
  if (call.dir === 'missed') return PhoneMissed;
  if (!call.duration) return PhoneOff;
  return call.dir === 'incoming' ? PhoneIncoming : PhoneOutgoing;
};

export default function CallHistoryScreen({ navigation }) {
  useSecureScreen();
  const { callHistory } = useApp();
  const [tab, setTab] = useState('all');
  const missed = callHistory.filter(c => c.dir === 'missed');
  const data = tab === 'all' ? callHistory : missed;

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
      <FlatList
        data={data}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Txt
            variant="body"
            color={colors.textMuted}
            center
            style={styles.empty}
          >
            No calls yet.
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
                    {status.charged ? '' : ' · not charged'}
                  </Txt>
                ) : null}
              </View>
              <View style={styles.right}>
                {item.coins ? (
                  <Txt style={styles.coins}>−{item.coins} coins</Txt>
                ) : null}
                <IconButton
                  icon={item.type === 'video' ? Video : Phone}
                  variant="tint"
                  size={42}
                  shadowed={false}
                  onPress={() =>
                    navigation.navigate('Call', {
                      user: item,
                      video: item.type === 'video',
                    })
                  }
                />
              </View>
            </View>
          );
        }}
      />
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
});
