import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  Backpack,
  BadgeCheck,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crown,
  FileText,
  LogOut,
  Phone,
  Radio,
  Settings,
  Shirt,
  Shield,
  TrendingUp,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import { STORE_ITEMS } from '../../data/social';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import ListRow, { Card } from '../../components/ListRow';
import { VipBadge } from '../../components/Social';
import { CoinIcon } from '../../components/CoinPill';

const TOOLS = [
  { key: 'Diamonds', emoji: '💎', colors: ['#F2F2F4', '#F2F2F4'] },
  { key: 'Visitors', emoji: '👀', colors: ['#F2F2F4', '#F2F2F4'] },
  { key: 'Tasks', emoji: '✅', colors: ['#F2F2F4', '#F2F2F4'] },
  { key: 'Family', emoji: '🏠', colors: ['#F2F2F4', '#F2F2F4'] },
];

export default function MyProfileScreen({ navigation }) {
  const {
    user,
    coins,
    isHost,
    hostApp,
    hostOnline,
    setHostOnline,
    signOut,
    following,
    greeted,
    vipLevel,
    nobility,
    equipped,
  } = useApp();
  const frame = STORE_ITEMS.find(i => i.id === equipped.frame);

  return (
    <Screen scroll>
      <Header title="Me" />
      <Pressable
        style={styles.header}
        onPress={() => navigation.navigate('EditProfile')}
      >
        <View>
          <Image
            source={{ uri: user.photos[0] }}
            style={[styles.avatar, frame && styles.avatarFramed]}
          />
          {frame ? <Txt style={styles.frameEmoji}>{frame.emoji}</Txt> : null}
        </View>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Txt variant="h2" numberOfLines={1}>
              {user.name}
            </Txt>
            {user.verified ? (
              <BadgeCheck
                size={20}
                color="#3BA7F0"
                fill="rgba(59,167,240,0.2)"
              />
            ) : null}
          </View>
          <View style={styles.badges}>
            <VipBadge level={vipLevel} />
            {nobility ? (
              <View style={styles.noble}>
                <Txt style={styles.nobleText}>
                  {nobility.emoji} {nobility.name}
                </Txt>
              </View>
            ) : null}
          </View>
          <Txt variant="small">View or edit profile</Txt>
        </View>
        <ChevronRight size={22} color={colors.textFaint} />
      </Pressable>

      <View style={styles.stats}>
        {[
          ['Following', following.length, 'following'],
          ['Friends', greeted.length + user.friends, 'followers'],
          ['Followers', user.followers, 'followers'],
        ].map(([label, n, tab]) => (
          <Pressable
            key={label}
            style={styles.stat}
            onPress={() => navigation.navigate('Followers', { tab })}
          >
            <Txt variant="h2">{num(n)}</Txt>
            <Txt variant="small">{label}</Txt>
          </Pressable>
        ))}
      </View>

      {isHost ? (
        <Card padded={false} style={styles.section}>
          <ListRow
            icon={Radio}
            iconColor={hostOnline ? colors.success : colors.textMuted}
            iconBg={hostOnline ? '#DFF7EE' : colors.surfaceMuted}
            title={hostOnline ? 'Online · available for calls' : 'Offline'}
            subtitle={
              hostOnline
                ? 'Users can call you now.'
                : 'Go online to receive calls.'
            }
            toggle={hostOnline}
            onToggle={setHostOnline}
          />
          <ListRow
            icon={TrendingUp}
            title="Host Center"
            subtitle="Go live, prices, earnings & tasks"
            onPress={() => navigation.navigate('HostCenter')}
            last
          />
        </Card>
      ) : hostApp.status === 'pending' || hostApp.status === 'rejected' ? (
        <Card padded={false} style={styles.section}>
          <ListRow
            icon={Clock3}
            iconColor={
              hostApp.status === 'rejected' ? colors.danger : colors.warning
            }
            iconBg={hostApp.status === 'rejected' ? '#FFECEC' : '#FFF4DB'}
            title={
              hostApp.status === 'rejected'
                ? 'Host application needs changes'
                : 'Host application under review'
            }
            subtitle={
              hostApp.status === 'rejected'
                ? 'Tap to see what to fix and resubmit'
                : 'We’ll notify you once it’s approved'
            }
            onPress={() => navigation.navigate('HostStatus')}
            last
          />
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Pressable
          style={styles.rechargeHead}
          onPress={() => navigation.navigate('Wallet')}
        >
          <Txt variant="h3">Wallet</Txt>
          <View style={styles.reward}>
            <Txt style={styles.rewardText}>Bonus</Txt>
          </View>
          <View style={styles.flex} />
          <CoinIcon size={18} />
          <Txt variant="label">{num(coins)}</Txt>
          <ChevronRight size={18} color={colors.textFaint} />
        </Pressable>
        <View style={styles.memberRow}>
          <Pressable
            style={styles.flex}
            onPress={() => navigation.navigate('Vip')}
          >
            <LinearGradient
              colors={['#FFF1C2', '#FFF1C2']}
              style={styles.member}
            >
              <View style={styles.flex}>
                <Txt variant="h3">VIP</Txt>
                <Txt variant="small">
                  {vipLevel
                    ? `${
                        vipLevel >= 4 ? 'VIP Elite' : `VIP ${vipLevel}`
                      } active`
                    : 'Join'}
                </Txt>
              </View>
              <Txt style={styles.memberEmoji}>👑</Txt>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={styles.flex}
            onPress={() => navigation.navigate('RoyalClub')}
          >
            <LinearGradient
              colors={['#EFE6D8', '#EFE6D8']}
              style={styles.member}
            >
              <View style={styles.flex}>
                <Txt variant="h3">Royal Club</Txt>
                <Txt variant="small">{nobility ? nobility.name : 'Join'}</Txt>
              </View>
              <Txt style={styles.memberEmoji}>🏅</Txt>
            </LinearGradient>
          </Pressable>
        </View>
      </Card>

      <Card style={styles.section}>
        <Txt variant="h3" style={styles.cardTitle}>
          My Tools
        </Txt>
        <View style={styles.tools}>
          {TOOLS.map(t => (
            <Pressable
              key={t.key}
              style={styles.tool}
              onPress={() => navigation.navigate(t.key)}
            >
              <LinearGradient colors={t.colors} style={styles.toolIcon}>
                <Txt style={styles.toolEmoji}>{t.emoji}</Txt>
              </LinearGradient>
              <Txt variant="small" color={colors.ink}>
                {t.key}
              </Txt>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card padded={false} style={styles.section}>
        <ListRow
          icon={CalendarDays}
          title="Events"
          right={<View style={styles.dot} />}
          onPress={() => navigation.navigate('Events')}
        />
        <ListRow
          icon={Shirt}
          title="Store"
          subtitle="Frames, entry effects & chat bubbles"
          onPress={() => navigation.navigate('Store')}
        />
        <ListRow
          icon={Backpack}
          title="My Items"
          subtitle="Items you own"
          onPress={() => navigation.navigate('MyItems')}
        />
        {isHost || hostApp.status !== 'none' ? null : (
          <ListRow
            icon={Crown}
            title="Become a host"
            subtitle="Earn from calls, chats and gifts"
            onPress={() => navigation.navigate('BecomeHost')}
          />
        )}
        <ListRow
          icon={Phone}
          title="Call history"
          onPress={() => navigation.navigate('CallHistory')}
          last
        />
      </Card>

      <Card padded={false} style={styles.section}>
        <ListRow
          icon={Bell}
          title="Notifications"
          onPress={() => navigation.navigate('Notifications')}
        />
        <ListRow
          icon={Shield}
          title="Privacy & safety"
          onPress={() => navigation.navigate('Settings')}
        />
        <ListRow
          icon={BadgeCheck}
          title="Verify your profile"
          onPress={() => navigation.navigate('Verification')}
        />
        <ListRow
          icon={Settings}
          title="Settings"
          onPress={() => navigation.navigate('Settings')}
        />
        <ListRow
          icon={CircleHelp}
          title="Help & support"
          onPress={() => navigation.navigate('Content', { page: 'help' })}
        />
        <ListRow
          icon={FileText}
          title="Terms & policies"
          onPress={() => navigation.navigate('Content', { page: 'terms' })}
        />
        <ListRow icon={LogOut} title="Log out" danger onPress={signOut} last />
      </Card>
      <Txt variant="tiny" center style={styles.version}>
        REBU v1.0.0
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: spacing.md,
    paddingTop: 4,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 24,
    backgroundColor: colors.surfaceMuted,
  },
  avatarFramed: { borderWidth: 3, borderColor: '#FFB020' },
  frameEmoji: { position: 'absolute', top: -10, right: -8, fontSize: 24 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badges: { flexDirection: 'row', gap: 6, marginVertical: 5 },
  noble: {
    paddingHorizontal: 8,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E5D2B4',
    justifyContent: 'center',
  },
  nobleText: {
    fontFamily: fonts.bold,
    fontSize: 10.5,
    lineHeight: 14,
    color: '#6B4E16',
  },
  stats: { flexDirection: 'row', marginTop: 20, marginHorizontal: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  section: { marginHorizontal: spacing.md, marginTop: 16 },
  rechargeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reward: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
  },
  rewardText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.white,
    fontStyle: 'italic',
  },
  memberRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 84,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  memberEmoji: { fontSize: 34, lineHeight: 42 },
  cardTitle: { marginBottom: 14 },
  tools: { flexDirection: 'row' },
  tool: { flex: 1, alignItems: 'center', gap: 8 },
  toolIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolEmoji: { fontSize: 28, lineHeight: 34 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.danger },
  version: { marginTop: 16 },
});
