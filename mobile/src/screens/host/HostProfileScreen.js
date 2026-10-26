import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BadgeCheck,
  Ban,
  ChevronLeft,
  EllipsisVertical,
  Flag,
  Gift,
  Languages,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  UserCheck,
  UserPlus,
  Users,
  Video,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { GIFTS, INTERESTS } from '../../data/mock';
import { num } from '../../utils/format';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import Chip from '../../components/Chip';
import IconButton from '../../components/IconButton';
import Button from '../../components/Button';
import Sheet from '../../components/Sheet';
import ListRow, { Card } from '../../components/ListRow';
import GiftSheet from '../../components/GiftSheet';
import { CoinIcon } from '../../components/CoinPill';

const { width: W } = Dimensions.get('window');

export default function HostProfileScreen({ navigation, route }) {
  const { host } = route.params;
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState(0);
  const { following: followList, toggleFollow } = useApp();
  const following = followList.includes(host.id);
  const [menu, setMenu] = useState(false);
  const [gift, setGift] = useState(false);
  const photos = host.photos || [host.photo];
  const tags = (host.interests || [])
    .map(k => INTERESTS.find(i => i.key === k))
    .filter(Boolean);
  const call = video => navigation.navigate('Call', { user: host, video });
  const chat = {
    userId: host.id,
    name: host.name,
    photo: host.photo,
    online: host.online,
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.hero}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={e =>
              setPhoto(Math.round(e.nativeEvent.contentOffset.x / W))
            }
          >
            {photos.map(uri => (
              <Image key={uri} source={{ uri }} style={styles.heroImg} />
            ))}
          </ScrollView>
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent']}
            style={styles.heroShade}
            pointerEvents="none"
          />
          <View style={[styles.heroBar, { top: insets.top + 8 }]}>
            <IconButton
              icon={ChevronLeft}
              variant="glass"
              size={40}
              onPress={() => navigation.goBack()}
            />
            <View style={styles.dots}>
              {photos.map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i === photo && styles.dotActive]}
                />
              ))}
            </View>
            <IconButton
              icon={EllipsisVertical}
              variant="glass"
              size={40}
              onPress={() => setMenu(true)}
            />
          </View>
        </View>

        <View style={styles.sheet}>
          <View style={styles.nameRow}>
            <Txt variant="display" style={styles.name}>
              {host.name}, {host.age}
            </Txt>
            <BadgeCheck size={24} color="#3BA7F0" fill="rgba(59,167,240,0.2)" />
            <View style={styles.flex} />
            <Pressable
              onPress={() => toggleFollow(host.id)}
              style={[styles.follow, following && styles.following]}
            >
              {following ? (
                <UserCheck size={16} color={colors.ink} />
              ) : (
                <UserPlus size={16} color={colors.white} />
              )}
              <Txt
                style={[styles.followText, following && styles.followingText]}
              >
                {following ? 'Following' : 'Follow'}
              </Txt>
            </Pressable>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MapPin size={15} color={colors.textMuted} />
              <Txt variant="small">
                {host.city} {host.country}
              </Txt>
            </View>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: host.online
                    ? '#DFF7EE'
                    : colors.surfaceMuted,
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: host.online
                      ? colors.online
                      : colors.textFaint,
                  },
                ]}
              />
              <Txt
                variant="tiny"
                color={host.online ? colors.success : colors.textMuted}
              >
                {host.online
                  ? 'Online now'
                  : host.busy
                  ? 'In a call'
                  : 'Offline'}
              </Txt>
            </View>
          </View>

          <View style={styles.stats}>
            {[
              { icon: Star, value: host.rating, label: 'Rating' },
              {
                icon: Users,
                value: num(host.followers || 0),
                label: 'Followers',
              },
              {
                icon: Languages,
                value: (host.languages || []).length,
                label: 'Languages',
              },
            ].map((s, i) => (
              <View
                key={s.label}
                style={[styles.stat, i < 2 && styles.statDivider]}
              >
                <View style={styles.statTop}>
                  <s.icon size={15} color={colors.primary} />
                  <Txt variant="h3">{s.value}</Txt>
                </View>
                <Txt variant="small">{s.label}</Txt>
              </View>
            ))}
          </View>

          <Card style={styles.rates}>
            {[
              { icon: Video, label: 'Video call', rate: host.videoRate },
              { icon: Phone, label: 'Voice call', rate: host.voiceRate },
            ].map((r, i) => (
              <View
                key={r.label}
                style={[styles.rateRow, i === 0 && styles.rateDivider]}
              >
                <View style={styles.rateIcon}>
                  <r.icon size={18} color={colors.primary} />
                </View>
                <Txt variant="label" style={styles.flex}>
                  {r.label}
                </Txt>
                <CoinIcon size={14} />
                <Txt variant="label">{r.rate} coins/min</Txt>
              </View>
            ))}
            <Txt variant="tiny" style={styles.rateNote}>
              Charged per connected minute only. Messages cost 10 coins each.
            </Txt>
          </Card>

          <Txt variant="h3" style={styles.section}>
            About me
          </Txt>
          <Txt variant="body" color={colors.textMuted}>
            {host.bio}
          </Txt>

          {(host.languages || []).length ? (
            <>
              <Txt variant="h3" style={styles.section}>
                Speaks
              </Txt>
              <View style={styles.wrap}>
                {host.languages.map(l => (
                  <Chip key={l} label={l} emoji="🗣️" small />
                ))}
              </View>
            </>
          ) : null}

          {tags.length ? (
            <>
              <Txt variant="h3" style={styles.section}>
                Loves talking about
              </Txt>
              <View style={styles.wrap}>
                {tags.map(t => (
                  <Chip key={t.key} label={t.label} emoji={t.emoji} small />
                ))}
              </View>
            </>
          ) : null}

          <Txt variant="h3" style={styles.section}>
            Gifts received
          </Txt>
          <View style={styles.wrap}>
            {GIFTS.slice(0, 6).map((g, i) => (
              <View key={g.key} style={styles.giftChip}>
                <Txt style={styles.giftEmoji}>{g.emoji}</Txt>
                <Txt variant="tiny">×{(i + 2) * 7}</Txt>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <IconButton
          icon={MessageCircle}
          size={50}
          color={colors.secondary}
          onPress={() => navigation.navigate('ChatRoom', { chat })}
        />
        <IconButton
          icon={Gift}
          size={50}
          color={colors.warning}
          onPress={() => setGift(true)}
        />
        <IconButton
          icon={Phone}
          size={50}
          color={colors.primary}
          onPress={() => call(false)}
        />
        <Button
          title={host.online ? `Video · ${host.videoRate}/min` : 'Offline'}
          icon={Video}
          size="md"
          disabled={!host.online}
          onPress={() => call(true)}
          style={styles.flex}
        />
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <ListRow
          icon={Flag}
          title={`Report ${host.name}`}
          subtitle="Fake profile, inappropriate behaviour, spam…"
          onPress={() => {
            setMenu(false);
            navigation.navigate('Report', {
              name: host.name,
              targetType: 'host',
              targetId: host.id,
            });
          }}
        />
        <ListRow
          icon={Ban}
          title={`Block ${host.name}`}
          subtitle="You won’t see her or receive calls/messages"
          danger
          onPress={() => {
            setMenu(false);
            navigation.goBack();
          }}
          last
        />
      </Sheet>
      <GiftSheet
        to={host.name}
        visible={gift}
        onClose={() => setGift(false)}
        onRecharge={() => {
          setGift(false);
          navigation.navigate('Wallet');
        }}
        dark={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { paddingBottom: 120 },
  hero: { height: W * 1.15 },
  heroImg: { width: W, height: W * 1.15 },
  heroShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  heroBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: { width: 20, backgroundColor: colors.white },
  sheet: {
    marginTop: -28,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 28 },
  follow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
  },
  following: { backgroundColor: colors.surfaceAlt },
  followText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  followingText: { color: colors.ink },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  stats: {
    flexDirection: 'row',
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDivider: { borderRightWidth: 1, borderRightColor: colors.border },
  rates: { marginTop: 14 },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rateDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rateIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFECF2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateNote: { marginTop: 8 },
  section: { marginTop: 22, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  giftChip: {
    alignItems: 'center',
    width: 56,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  giftEmoji: { fontSize: 24, lineHeight: 30 },
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    backgroundColor: 'rgba(250,247,251,0.97)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
