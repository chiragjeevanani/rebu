import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Megaphone } from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import { get, post } from '../../api/client';
import { timeLabel } from '../../api/chat';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';

const KIND_EMOJI = {
  follow: '📸',
  gift: '🎁',
  call: '📞',
  chat: '💬',
  payout: '💸',
  host: '⭐',
  moment: '❤️',
  support: '🛟',
  safety: '⚠️',
  reward: '🎉',
};

/** rebu://… links from the server → a screen in the app. */
function open(navigation, link, isHost) {
  const [, path = '', id] = /^rebu:\/\/([^/]+)\/?(.*)$/.exec(link || '') || [];
  switch (path) {
    case 'chat':
      return navigation.navigate('ChatRoom', { chat: { userId: id } });
    case 'calls':
      return navigation.navigate('CallHistory');
    case 'host':
      if (id === 'earnings') return navigation.navigate('HostDashboard');
      if (id === 'status') return navigation.navigate('HostStatus');
      return navigation.navigate(isHost ? 'HostCenter' : 'HostStatus');
    case 'moment':
      return navigation.navigate('Moments');
    case 'wallet':
      return navigation.navigate('Wallet');
    default:
      return null;
  }
}

export default function NotificationsScreen({ navigation }) {
  const { setUnread, isHost } = useApp();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await get('/notifications?limit=100');
      setItems(r.items);
      setUnread(r.unread);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [setUnread]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const markAll = async () => {
    setItems(list => (list || []).map(n => ({ ...n, read: true })));
    setUnread(0);
    await post('/notifications/read').catch(() => {});
  };

  const tap = n => {
    if (!n.read) {
      setItems(list =>
        list.map(x => (x.id === n.id ? { ...x, read: true } : x)),
      );
      setUnread(u => Math.max(0, u - 1));
      post('/notifications/read', { ids: [n.id] }).catch(() => {});
    }
    open(navigation, n.deeplink, isHost);
  };

  return (
    <Screen>
      <Header
        title="Notifications"
        right={
          items?.some(n => !n.read) ? (
            <Txt variant="label" color={colors.primary} onPress={markAll}>
              Mark all read
            </Txt>
          ) : null
        }
      />
      {!items && !error ? (
        <ActivityIndicator color={colors.primary} style={styles.empty} />
      ) : (
        <FlatList
          data={items || []}
          keyExtractor={n => n.id}
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
              {error || 'You’re all caught up.'}
            </Txt>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => tap(item)}
              style={[styles.row, !item.read && styles.unread]}
            >
              {item.image ? (
                <View>
                  <Avatar uri={item.image} size={52} />
                  {KIND_EMOJI[item.kind] ? (
                    <View style={styles.typeBadge}>
                      <Txt style={styles.typeEmoji}>
                        {KIND_EMOJI[item.kind]}
                      </Txt>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.announce}>
                  {KIND_EMOJI[item.kind] ? (
                    <Txt style={styles.announceEmoji}>
                      {KIND_EMOJI[item.kind]}
                    </Txt>
                  ) : (
                    <Megaphone size={22} color={colors.white} />
                  )}
                </View>
              )}
              <View style={styles.flex}>
                <Txt variant="label">{item.title}</Txt>
                {item.body ? (
                  <Txt variant="small" style={styles.body}>
                    {item.body}
                  </Txt>
                ) : null}
              </View>
              <View style={styles.side}>
                <Txt variant="tiny">{timeLabel(item.at)}</Txt>
                {!item.read ? <View style={styles.dot} /> : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingBottom: 24 },
  empty: { padding: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  unread: { backgroundColor: '#FFF3F7' },
  body: { marginTop: 2 },
  side: { alignItems: 'flex-end', gap: 6 },
  typeBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeEmoji: { fontSize: 12 },
  announce: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announceEmoji: { fontSize: 22 },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
