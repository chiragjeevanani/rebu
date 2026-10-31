import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { CircleCheck } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { ARISTOCRACY, VIP_TIERS } from '../../data/social';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import BuySheet from '../../components/BuySheet';
import { Card } from '../../components/ListRow';
import { CoinIcon } from '../../components/CoinPill';

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const dateLabel = d => {
  const x = new Date(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
};

/* ---------- VIP / VIP Elite ---------- */
export function VipScreen({ navigation }) {
  const { vipLevel, store, config, buyVip } = useApp();
  const tiers = (config?.vipTiers?.length ? config.vipTiers : VIP_TIERS).map(
    t => ({
      ...t,
      color: VIP_TIERS.find(v => v.level === t.level)?.color || [
        '#F5B301',
        '#F5B301',
      ],
    }),
  );
  const [selected, setSelected] = useState(Math.max(vipLevel, 1));
  const [buying, setBuying] = useState(null);
  const tier = tiers.find(t => t.level === selected) || tiers[0];
  // Higher levels are upgrades; the current level can be extended.
  const lower = vipLevel > selected;
  const current = vipLevel === selected;

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            title={
              lower
                ? `You have VIP ${vipLevel}`
                : current
                ? `Extend ${tier.name} · ${num(tier.price)} coins`
                : `Get ${tier.name} · ${num(tier.price)} coins`
            }
            disabled={lower}
            gradient={tier.color}
            onPress={() =>
              setBuying({
                title: `${tier.name} · ${tier.days} days`,
                emoji: tier.level >= 4 ? '💎' : '👑',
                price: tier.price,
                note: tier.perks.join(' · '),
              })
            }
          />
        </View>
      }
    >
      <Header title="VIP Membership" />
      <View style={styles.body}>
        <View style={styles.tabs}>
          {tiers.map(t => (
            <Pressable
              key={t.level}
              style={styles.flex}
              onPress={() => setSelected(t.level)}
            >
              <LinearGradient
                colors={selected === t.level ? t.color : ['#F3EEF6', '#F3EEF6']}
                style={styles.tab}
              >
                <Txt
                  style={[
                    styles.tabText,
                    selected === t.level && styles.tabTextOn,
                  ]}
                >
                  {t.name}
                </Txt>
              </LinearGradient>
            </Pressable>
          ))}
        </View>
        <LinearGradient
          colors={tier.color}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Txt style={styles.heroEmoji}>{tier.level >= 4 ? '💎' : '👑'}</Txt>
          <Txt style={styles.heroTitle}>{tier.name}</Txt>
          <View style={styles.heroPrice}>
            <CoinIcon size={18} />
            <Txt style={styles.heroPriceText}>
              {num(tier.price)} / {tier.days} days
            </Txt>
          </View>
          {vipLevel ? (
            <Txt style={styles.heroNote}>
              Current: {vipLevel >= 4 ? 'VIP Elite' : `VIP ${vipLevel}`}
              {store.vip?.until ? ` · until ${dateLabel(store.vip.until)}` : ''}
            </Txt>
          ) : null}
        </LinearGradient>
        <Txt variant="h3" style={styles.section}>
          Privileges
        </Txt>
        <Card>
          {tier.perks.map(p => (
            <View key={p} style={styles.perk}>
              <CircleCheck size={18} color={colors.warning} />
              <Txt variant="bodyMedium">{p}</Txt>
            </View>
          ))}
        </Card>
      </View>
      <BuySheet
        item={buying}
        onClose={() => setBuying(null)}
        onBuy={() => buyVip(tier.level)}
        onRecharge={() => {
          setBuying(null);
          navigation.navigate('Wallet');
        }}
      />
    </Screen>
  );
}

/* ---------- Royal Club ---------- */
export function AristocracyScreen({ navigation }) {
  const { nobility, store, config, buyRoyal } = useApp();
  const ranks = config?.royalClub?.length ? config.royalClub : ARISTOCRACY;
  const [selected, setSelected] = useState(nobility?.key || ranks[0].key);
  const [buying, setBuying] = useState(null);
  const rank = ranks.find(a => a.key === selected) || ranks[0];
  const active = nobility?.key === selected;

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            title={
              active
                ? `Extend ${rank.name} · ${num(rank.price)} coins`
                : `Become ${rank.name} · ${num(rank.price)} coins`
            }
            gradient={['#A8823F', '#A8823F']}
            onPress={() =>
              setBuying({
                title: `${rank.name} · 30 days`,
                emoji: rank.emoji,
                price: rank.price,
                note: rank.perks.join(' · '),
              })
            }
          />
        </View>
      }
    >
      <Header title="Royal Club" />
      <View style={styles.body}>
        <View style={styles.ranks}>
          {ranks.map(a => (
            <Pressable
              key={a.key}
              onPress={() => setSelected(a.key)}
              style={[styles.rank, selected === a.key && styles.rankOn]}
            >
              <Txt style={styles.rankEmoji}>{a.emoji}</Txt>
              <Txt variant="label">{a.name}</Txt>
            </Pressable>
          ))}
        </View>
        <LinearGradient
          colors={['#3A2E1A', '#3A2E1A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Txt style={styles.heroEmoji}>{rank.emoji}</Txt>
          <Txt style={styles.heroTitle}>{rank.name}</Txt>
          <View style={styles.heroPrice}>
            <CoinIcon size={18} />
            <Txt style={styles.heroPriceText}>{num(rank.price)} / 30 days</Txt>
          </View>
          {active && store.royal?.until ? (
            <Txt style={styles.heroNote}>
              Active until {dateLabel(store.royal.until)}
            </Txt>
          ) : null}
        </LinearGradient>
        <Txt variant="h3" style={styles.section}>
          Royal Club privileges
        </Txt>
        <Card>
          {rank.perks.map(p => (
            <View key={p} style={styles.perk}>
              <CircleCheck size={18} color="#B08D4C" />
              <Txt variant="bodyMedium">{p}</Txt>
            </View>
          ))}
        </Card>
      </View>
      <BuySheet
        item={buying}
        onClose={() => setBuying(null)}
        onBuy={() => buyRoyal(rank.key)}
        onRecharge={() => {
          setBuying(null);
          navigation.navigate('Wallet');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontFamily: fonts.bold, fontSize: 13, color: colors.textMuted },
  tabTextOn: { color: colors.white },
  hero: {
    alignItems: 'center',
    padding: 24,
    borderRadius: radius.xl,
    marginTop: 16,
  },
  heroEmoji: { fontSize: 56, lineHeight: 66 },
  heroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    lineHeight: 36,
    color: colors.white,
    marginTop: 6,
  },
  heroPrice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  heroPriceText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  heroNote: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
  },
  section: { marginTop: 22, marginBottom: 10 },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  ranks: { flexDirection: 'row', gap: 8 },
  rank: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rankOn: { borderColor: '#B08D4C', backgroundColor: '#FBF5EA' },
  rankEmoji: { fontSize: 28, lineHeight: 34 },
  footer: { paddingHorizontal: spacing.md, paddingTop: 10 },
});
