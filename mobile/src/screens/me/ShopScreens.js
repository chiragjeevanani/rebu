import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors, fonts, radius, spacing } from '../../theme';
import { EVENTS, STORE_ITEMS } from '../../data/social';
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
  return (
    <Screen>
      <Header title="Events" />
      <FlatList
        data={EVENTS}
        keyExtractor={e => e.id}
        contentContainerStyle={styles.list}
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
  const { owned, buyItem, equipItem } = useApp();
  const [category, setCategory] = useState('frame');
  const [buying, setBuying] = useState(null);
  const items = STORE_ITEMS.filter(i => i.category === category);

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
          const has = owned.includes(item.id);
          return (
            <ItemCard
              item={item}
              onPress={() => (has ? null : setBuying(item))}
              footer={
                has ? (
                  <Txt
                    variant="small"
                    color={colors.success}
                    style={styles.itemFoot}
                  >
                    Owned
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
            note: 'It’s added to My Items and equipped.',
          }
        }
        onClose={() => setBuying(null)}
        onBought={() => {
          buyItem(buying.id);
          equipItem(buying.category, buying.id);
        }}
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
  const { owned, equipped, equipItem } = useApp();
  const items = STORE_ITEMS.filter(i => owned.includes(i.id));

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
              onPress={() => equipItem(item.category, item.id)}
              footer={
                <Txt
                  variant="small"
                  color={on ? colors.primary : colors.textMuted}
                  style={styles.itemFoot}
                >
                  {on ? 'Equipped' : 'Tap to equip'}
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
