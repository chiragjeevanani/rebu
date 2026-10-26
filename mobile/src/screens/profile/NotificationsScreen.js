import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Megaphone } from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import { NOTIFICATIONS } from '../../data/mock';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';

const TYPE_EMOJI = {
  online: '🟢',
  gift: '🎁',
  call: '📞',
  follow: '📸',
};

export default function NotificationsScreen() {
  return (
    <Screen>
      <Header
        title="Notifications"
        right={
          <Txt variant="label" color={colors.primary}>
            Mark all read
          </Txt>
        }
      />
      <FlatList
        data={NOTIFICATIONS}
        keyExtractor={n => n.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View style={[styles.row, item.unread && styles.unread]}>
            {item.photo ? (
              <View>
                <Avatar uri={item.photo} size={52} />
                <View style={styles.typeBadge}>
                  <Txt style={{ fontSize: 12 }}>{TYPE_EMOJI[item.type]}</Txt>
                </View>
              </View>
            ) : (
              <LinearGradient colors={colors.gradient} style={styles.announce}>
                <Megaphone size={22} color={colors.white} />
              </LinearGradient>
            )}
            <View style={{ flex: 1 }}>
              <Txt variant="label">{item.title}</Txt>
              <Txt variant="small" style={{ marginTop: 2 }}>
                {item.body}
              </Txt>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <Txt variant="tiny">{item.time}</Txt>
              {item.unread ? <View style={styles.dot} /> : null}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  unread: { backgroundColor: '#FFF3F7' },
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
  announce: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
