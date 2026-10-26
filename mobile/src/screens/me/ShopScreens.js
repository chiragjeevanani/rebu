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
import { colors, fonts, radius, spacing } from '../../theme';
import { STORE_ITEMS } from '../../data/social';
import { get } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { num } from '../../utils/format';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import Segmented from '../../components/Segmented';
import BuySheet from '../../components/BuySheet';
import { CoinIcon } from '../../components/CoinPill';

const CATEGORIES = [
  { key: 'frame', label: 'Frames' },
  { key: 'entry', label: 'Entry effects' },
  { key: 'bubble', label: 'Chat bubbles' },
];

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const daysLeft = until =>
  Math.max(0, Math.round((new Date(until).getTime() - Date.now()) / 864e5));

/** Store catalog: admin-edited on the server, bundled list as a fallback. */
const useCatalog = () => {
  const { config } = useApp();
  return config?.storeItems?.length ? config.storeItems : STORE_ITEMS;
};

function ItemCard({ item, footer, active, onPress }) {
  return (
    <Pressable
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
    >
      <Txt style={styles.itemEmoji}>{item.emoji}</Txt>
      <Txt variant="label" center numberOfLines={1}>
        {item.name}
      </Txt>
      {footer}
    </Pressable>
  );
}

/* ---------- Events ---------- */
export function EventCenterScreen({ navigation }) {
  const [events, setEvents] = useState(null);
  useFocusEffect(
    useCallback(() => {
      get('/content/banners?placement=Events')
        .then(r =>
          setEvents(
            r.items.map(b => {
              const end = new Date(b.endsAt);
              return {
                id: b.id,
                title: b.title,
                sub: b.subtitle || '',
                tag: b.cta || null,
                link: b.link,
                colors: [b.color || colors.primary, b.color || colors.primary],
                ends: `Ends ${end.getDate()} ${MONTHS[end.getMonth()]}`,
              };
            }),
          ),
        )
        .catch(() => setEvents([]));
    }, []),
  );
  return (
    <Screen>
      <Header title="Events" />
      {!events ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : null}
      <FlatList
        data={events || []}
        keyExtractor={e => e.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          events ? (
            <View style={styles.empty}>
              <Txt style={styles.emptyEmoji}>🎉</Txt>
              <Txt variant="body" color={colors.textMuted} center>
                No events right now. Check back soon!
              </Txt>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('Wallet')}>
            <LinearGradient
              colors={item.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.event}
            >
              {item.tag ? (
                <View style={styles.eventTag}>
                  <Txt style={styles.eventTagText}>{item.tag}</Txt>
                </View>
              ) : null}
              <Txt style={styles.eventTitle}>{item.title}</Txt>
              <Txt style={styles.eventSub}>{item.sub}</Txt>
              <Txt style={styles.eventEnds}>{item.ends}</Txt>
            </LinearGradient>
          </Pressable>
        )}
      />
    </Screen>
  );
}

/* ---------- Store ---------- */
export function StoreScreen({ navigation }) {
  const { store, buyItem } = useApp();
  const catalog = useCatalog();
  const [category, setCategory] = useState('frame');
  const [buying, setBuying] = useState(null);
  const items = catalog.filter(i => i.category === category);
  const ownedUntil = id => store.owned.find(o => o.itemId === id)?.expiresAt;

  return (
    <Screen>
      <Header
        title="Store"
        right={
          <Txt
            variant="label"
            color={colors.primary}
            onPress={() => navigation.navigate('MyItems')}
          >
            My Items
          </Txt>
        }
      />
      <Segmented
        value={category}
        onChange={setCategory}
        options={CATEGORIES}
        style={styles.seg}
      />
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => {
          const until = ownedUntil(item.id);
          return (
            <ItemCard
              item={item}
              onPress={() => setBuying(item)}
              footer={
                until ? (
                  <Txt
                    variant="small"
                    color={colors.success}
                    style={styles.itemFoot}
                  >
                    Owned · {daysLeft(until)}d left
                  </Txt>
                ) : (
                  <View style={[styles.price, styles.itemFoot]}>
                    <CoinIcon size={14} />
                    <Txt variant="label">{num(item.price)}</Txt>
                    <Txt variant="tiny">/ {item.days}d</Txt>
                  </View>
                )
              }
            />
          );
        }}
      />
      <BuySheet
        item={
          buying && {
            title: `${buying.name} · ${buying.days} days`,
            emoji: buying.emoji,
            price: buying.price,
            note: ownedUntil(buying.id)
              ? `You own it — this adds ${buying.days} more days.`
              : 'It’s added to My Items and equipped.',
          }
        }
        onClose={() => setBuying(null)}
        onBuy={() => buyItem(buying.id)}
        onRecharge={() => {
          setBuying(null);
          navigation.navigate('Wallet');
        }}
      />
    </Screen>
  );
}

/* ---------- My Items ---------- */
export function BackpackScreen({ navigation }) {
  const { store, equipped, equipItem } = useApp();
  const catalog = useCatalog();
  const items = store.owned
    .map(o => {
      const it = catalog.find(i => i.id === o.itemId);
      return it && { ...it, expiresAt: o.expiresAt };
    })
    .filter(Boolean);

  return (
    <Screen>
      <Header title="My Items" subtitle="Tap an item to equip or remove it" />
      <FlatList
        data={items}
        keyExtractor={i => i.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Txt style={styles.emptyEmoji}>🎒</Txt>
            <Txt variant="body" color={colors.textMuted} center>
              You don’t own any items yet.
            </Txt>
            <Button
              title="Visit the store"
              full={false}
              style={styles.emptyBtn}
              onPress={() => navigation.navigate('Store')}
            />
          </View>
        }
        renderItem={({ item }) => {
          const on = equipped[item.category] === item.id;
          return (
            <ItemCard
              item={item}
              active={on}
              onPress={() =>
                equipItem(item.category, on ? null : item.id).catch(() => {})
              }
              footer={
                <Txt
                  variant="small"
                  color={on ? colors.primary : colors.textMuted}
                  style={styles.itemFoot}
                >
                  {on ? 'Equipped' : 'Tap to equip'} ·{' '}
                  {daysLeft(item.expiresAt)}d left
                </Txt>
              }
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.md, paddingBottom: 24, gap: 12 },
  loading: { marginTop: 40 },
  event: {
    padding: 20,
    borderRadius: radius.lg,
    minHeight: 130,
    justifyContent: 'flex-end',
  },
  eventTag: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
  },
  eventTagText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  eventTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.white,
  },
  eventSub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  eventEnds: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 10,
  },
  seg: { marginHorizontal: spacing.md, marginBottom: 12 },
  grid: { paddingHorizontal: spacing.md, paddingBottom: 24, gap: 12 },
  gridRow: { gap: 12 },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  itemActive: { borderColor: colors.primary, backgroundColor: '#FFF5F8' },
  itemEmoji: { fontSize: 46, lineHeight: 56 },
  itemFoot: { marginTop: 4 },
  price: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 54, lineHeight: 64, marginBottom: 10 },
  emptyBtn: { marginTop: 16 },
});
