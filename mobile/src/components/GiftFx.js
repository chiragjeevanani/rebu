// Gift animations, played over whatever is on screen (the call or live video
// stays visible underneath and keeps taking touches):
//   dim + sparkle burst → the gift's Lottie pops in → sender banner slides in
//   (with a combo counter for repeats) → everything fades out.
// Luxury gifts (999+ coins) play larger, with rotating light rays behind.
// Gifts that arrive together queue up and play in turn.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import LottieView from 'lottie-react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useApp } from '../context/AppContext';
import { API_URL } from '../api/client';
import { colors, fonts } from '../theme';

// Gifts at this price and up are "luxury": tagged FX in the sheet and played larger.
export const BIG_GIFT_COINS = 999;

const MAX_QUEUE = 6;
// Safety net if a Lottie never reports it finished (bad file, network).
const MAX_PLAY_MS = 6500;
const EMOJI_MS = 2400;
// Short clips loop until the gift has been on screen at least this long.
const MIN_PLAY_MS = 2800;
const MIN_PLAY_BIG_MS = 4800;
const EXIT_MS = 380;
// The same sender repeating the same gift within this window bumps a combo.
const COMBO_MS = 4000;

const SPARK_COLORS = ['#FFD54F', '#FF7BAC', '#FFFFFF', '#B388FF', '#7EE0FF'];

const GiftFxContext = createContext({ play: () => {} });
export const useGiftFx = () => useContext(GiftFxContext);

// Animations downloaded ahead of time (url → Lottie JSON), so a gift plays
// the moment it's sent instead of after a download.
const preloaded = new Map();
function preload(url) {
  if (!url || preloaded.has(url)) return;
  preloaded.set(url, null);
  fetch(url)
    .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(j => preloaded.set(url, j))
    .catch(() => preloaded.delete(url));
}

const absolute = url =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${API_URL}${url}`;

/* ---------- pieces ---------- */

function Spark({ i, count, radius, p, color }) {
  // Jittered angle and reach so the burst scatters instead of forming a ring.
  const angle = (i / count) * Math.PI * 2 + (((i * 29) % 21) - 10) / 40;
  const reach = radius * (0.55 + ((i * 53) % 46) / 100);
  const size = 9 + ((i * 7) % 9);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.08, 0.65, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * reach * p.value },
      {
        translateY: Math.sin(angle) * reach * p.value + 50 * p.value * p.value,
      },
      { scale: interpolate(p.value, [0, 0.2, 1], [0.2, 1, 0.5]) },
      { rotate: `${p.value * 180}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.spark,
        {
          width: size,
          height: size,
          borderRadius: i % 3 === 0 ? 1 : size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function Burst({ count, radius, delay = 0 }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }),
    );
  }, [p, delay]);
  return (
    <View style={styles.center} pointerEvents="none">
      {Array.from({ length: count }).map((_, i) => (
        <Spark
          key={i}
          i={i}
          count={count}
          radius={radius}
          p={p}
          color={SPARK_COLORS[i % SPARK_COLORS.length]}
        />
      ))}
    </View>
  );
}

/* Soft rings pulsing out from behind the gift. */
function Pulse({ size, delay, color }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
        3,
      ),
    );
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.15, 1], [0, 0.7, 0]),
    transform: [{ scale: 0.35 + p.value * 0.9 }],
  }));
  return (
    <Animated.View
      style={[
        styles.abs,
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
}

/* Copies of the gift's emoji drifting up the screen, like stream reactions. */
function Floater({ emoji, i, w, h, big }) {
  const p = useSharedValue(0);
  const x = w * (0.08 + ((i * 37) % 84) / 100);
  const size = (big ? 30 : 24) + ((i * 11) % 16);
  const sway = 14 + ((i * 13) % 22);
  useEffect(() => {
    p.value = withDelay(
      ((i * 173) % 1100) + 150,
      withTiming(1, {
        duration: 2100 + ((i * 97) % 900),
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [p, i]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.12, 0.7, 1], [0, 1, 0.9, 0]),
    transform: [
      { translateX: x + Math.sin(p.value * Math.PI * 3 + i) * sway },
      { translateY: h * (0.92 - p.value * 0.62) },
      { scale: interpolate(p.value, [0, 0.2, 1], [0.4, 1, 0.8]) },
      { rotate: `${Math.sin(p.value * 6 + i) * 18}deg` },
    ],
  }));
  return (
    <Animated.Text
      style={[
        styles.floater,
        { fontSize: size, lineHeight: size * 1.2 },
        style,
      ]}
    >
      {emoji}
    </Animated.Text>
  );
}

/* Rotating light rays behind luxury gifts (flat, translucent wedges). */
function Rays({ size }) {
  const spin = useSharedValue(0);
  const show = useSharedValue(0);
  useEffect(() => {
    show.value = withTiming(1, { duration: 500 });
    spin.value = withRepeat(
      withTiming(1, { duration: 9000, easing: Easing.linear }),
      -1,
    );
  }, [spin, show]);
  const style = useAnimatedStyle(() => ({
    opacity: show.value * 0.9,
    transform: [{ rotate: `${spin.value * 360}deg` }, { scale: show.value }],
  }));
  const r = size / 2;
  const wedges = 14;
  const d = Array.from({ length: wedges })
    .map((_, i) => {
      const a = (i / wedges) * Math.PI * 2;
      const b = a + Math.PI / wedges / 1.6;
      return `M${r} ${r} L${r + Math.cos(a) * r} ${r + Math.sin(a) * r} L${
        r + Math.cos(b) * r
      } ${r + Math.sin(b) * r} Z`;
    })
    .join(' ');
  return (
    <Animated.View
      style={[styles.abs, { width: size, height: size }, style]}
      pointerEvents="none"
    >
      <Svg width={size} height={size}>
        <Path d={d} fill="rgba(255,236,170,0.22)" />
      </Svg>
    </Animated.View>
  );
}

function EmojiArt({ emoji, size }) {
  return (
    <Text style={{ fontSize: size * 0.55, lineHeight: size * 0.7 }}>
      {emoji}
    </Text>
  );
}

/* Sender banner: slides in from the left; the combo pill pops on each repeat. */
function Banner({ item, leaving }) {
  const x = useSharedValue(-1);
  const pop = useSharedValue(1);
  useEffect(() => {
    x.value = withSpring(0, { damping: 15, stiffness: 140 });
  }, [x]);
  useEffect(() => {
    if (leaving) x.value = withTiming(-1, { duration: EXIT_MS });
  }, [leaving, x]);
  useEffect(() => {
    if (item.combo > 1) {
      pop.value = withSequence(
        withTiming(1.6, { duration: 120 }),
        withSpring(1, { damping: 6 }),
      );
    }
  }, [item.combo, pop]);
  const slide = useAnimatedStyle(() => ({
    opacity: 1 + x.value,
    transform: [{ translateX: x.value * 320 }],
  }));
  const popStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
  }));
  const { gift, from, to, photo } = item;
  const mine = !from || from === 'You';
  return (
    <Animated.View style={[styles.banner, slide]}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.bannerPhoto} />
      ) : (
        <View style={[styles.bannerPhoto, styles.bannerPhotoEmpty]}>
          <Text style={styles.bannerEmoji}>{gift.emoji}</Text>
        </View>
      )}
      <View style={styles.bannerText}>
        <Text style={styles.bannerName} numberOfLines={1}>
          {mine ? 'You' : from}
        </Text>
        <Text style={styles.bannerSub} numberOfLines={1}>
          sent {gift.name}
          {mine && to ? ` to ${to}` : ''}
        </Text>
      </View>
      <Text style={styles.bannerGift}>{gift.emoji}</Text>
      {item.combo > 1 ? (
        <Animated.Text style={[styles.combo, popStyle]}>
          x{item.combo}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

/* One gift on screen: dim, rays, burst, the art and the banner. */
function Stage({ item, leaving, failed, onFinish, onFailure, w, h }) {
  const big = item.gift.coins >= BIG_GIFT_COINS;
  const size = big ? w * 1.1 : w * 0.82;
  const started = useRef(Date.now());
  const minMs = big ? MIN_PLAY_BIG_MS : MIN_PLAY_MS;
  const art = useSharedValue(0);
  const dim = useSharedValue(0);
  const fly = useSharedValue(1);
  useEffect(() => {
    dim.value = withTiming(1, { duration: 260 });
    fly.value = withTiming(0, {
      duration: 520,
      easing: Easing.out(Easing.back(1.4)),
    });
    art.value = withSpring(1, { damping: 9, stiffness: 120, mass: 0.8 });
  }, [art, dim, fly]);
  useEffect(() => {
    if (!leaving) return;
    dim.value = withTiming(0, { duration: EXIT_MS });
    art.value = withTiming(1.35, { duration: EXIT_MS });
  }, [leaving, art, dim]);
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const artStyle = useAnimatedStyle(() => ({
    // Pops in from small (spring overshoots), grows and fades on the way out.
    opacity: art.value > 1.01 ? interpolate(art.value, [1, 1.35], [1, 0]) : 1,
    transform: [
      { translateY: fly.value * h * 0.35 },
      { scale: art.value > 1.01 ? art.value : 0.3 + art.value * 0.7 },
    ],
  }));

  return (
    <>
      <Animated.View
        style={[styles.fill, big ? styles.dimBig : styles.dim, dimStyle]}
      />
      <View style={[styles.stage, { top: h * 0.5 - size / 2, height: size }]}>
        {big ? <Rays size={size * 1.25} /> : null}
        <Pulse size={size * 0.9} delay={350} color="rgba(255,213,79,0.9)" />
        <Pulse size={size * 0.9} delay={900} color="rgba(255,123,172,0.9)" />
        <Burst count={big ? 30 : 18} radius={big ? w * 0.6 : w * 0.42} />
        {big ? <Burst count={18} radius={w * 0.45} delay={450} /> : null}
        <Animated.View style={artStyle}>
          {item.animation && !failed ? (
            <LottieView
              source={preloaded.get(item.animation) || { uri: item.animation }}
              autoPlay
              loop
              resizeMode="contain"
              style={{ width: size, height: size }}
              onAnimationLoop={() =>
                Date.now() - started.current >= minMs && onFinish()
              }
              onAnimationFinish={cancelled => !cancelled && onFinish()}
              onAnimationFailure={onFailure}
            />
          ) : (
            <View style={[styles.center, { width: size, height: size }]}>
              <EmojiArt emoji={item.gift.emoji} size={size} />
            </View>
          )}
        </Animated.View>
      </View>
      {Array.from({ length: big ? 16 : 10 }).map((_, i) => (
        <Floater key={i} i={i} emoji={item.gift.emoji} w={w} h={h} big={big} />
      ))}
      <View style={[styles.bannerRow, { top: h * 0.5 - size / 2 - 64 }]}>
        <Banner item={item} leaving={leaving} />
      </View>
    </>
  );
}

/* ---------- provider ---------- */

export function GiftFxProvider({ children }) {
  const { config, user } = useApp();
  const [current, setCurrent] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const queue = useRef([]);
  const cur = useRef(null);
  const timer = useRef(null);
  const leaveRef = useRef(() => {});
  const leavingRef = useRef(false);
  const { width: w, height: h } = useWindowDimensions();

  // The catalog from the server carries each gift's animation URL; socket
  // payloads may only have the key.
  const catalog = useMemo(
    () => Object.fromEntries((config?.gifts || []).map(g => [g.key, g])),
    [config?.gifts],
  );
  useEffect(() => {
    for (const g of config?.gifts || []) preload(absolute(g.animation));
  }, [config?.gifts]);

  const show = useCallback(item => {
    clearTimeout(timer.current);
    cur.current = item;
    leavingRef.current = false;
    setFailed(false);
    setLeaving(false);
    setCurrent(item);
  }, []);

  const next = useCallback(() => {
    clearTimeout(timer.current);
    const item = queue.current.shift() || null;
    show(item);
    if (item) {
      timer.current = setTimeout(
        () => leaveRef.current(),
        item.animation ? MAX_PLAY_MS : EMOJI_MS,
      );
    }
  }, [show]);

  // Fade out, then the next gift (or nothing).
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    if (!cur.current) return;
    leavingRef.current = true;
    setLeaving(true);
    timer.current = setTimeout(next, EXIT_MS);
  }, [next]);
  leaveRef.current = leave;

  const onFailure = useCallback(() => {
    setFailed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(leave, EMOJI_MS);
  }, [leave]);

  const play = useCallback(
    (gift, meta = {}) => {
      if (!gift?.key) return;
      const from = meta.from && meta.from !== 'You' ? meta.from : null;
      const now = Date.now();
      // Same sender, same gift, still on screen: count it as a combo.
      const c = cur.current;
      if (
        c &&
        !leavingRef.current &&
        c.gift.key === gift.key &&
        c.from === from &&
        now - c.at < COMBO_MS
      ) {
        const bumped = { ...c, combo: c.combo + (gift.count || 1), at: now };
        cur.current = bumped;
        setCurrent(bumped);
        clearTimeout(timer.current);
        timer.current = setTimeout(leave, c.animation ? MAX_PLAY_MS : EMOJI_MS);
        return;
      }
      if (queue.current.length >= MAX_QUEUE) return;
      queue.current.push({
        gift: { ...catalog[gift.key], ...gift },
        animation: absolute(gift.animation || catalog[gift.key]?.animation),
        from,
        to: meta.to,
        photo: meta.photo || (from ? null : user?.photos?.[0]),
        combo: gift.count || 1,
        at: now,
        // New id restarts the player even for the same gift twice in a row.
        id: `${now}${Math.random()}`,
      });
      if (!cur.current) next();
    },
    [catalog, next, leave, user],
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ play }), [play]);

  return (
    <GiftFxContext.Provider value={value}>
      {children}
      {current ? (
        <View style={styles.fill} pointerEvents="none">
          <Stage
            key={current.id}
            item={current}
            leaving={leaving}
            failed={failed}
            onFinish={leave}
            onFailure={onFailure}
            w={w}
            h={h}
          />
        </View>
      ) : null}
    </GiftFxContext.Provider>
  );
}

const styles = StyleSheet.create({
  // StyleSheet.absoluteFillObject no longer exists in this React Native.
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
  dim: { backgroundColor: 'rgba(12,4,28,0.28)' },
  dimBig: { backgroundColor: 'rgba(12,4,28,0.45)' },
  stage: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: { position: 'absolute' },
  ring: { borderWidth: 3 },
  floater: { position: 'absolute', top: 0, left: 0 },
  bannerRow: { position: 'absolute', left: 14, right: 14 },
  banner: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 30,
    backgroundColor: 'rgba(91,42,134,0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,213,79,0.85)',
  },
  bannerPhoto: { width: 40, height: 40, borderRadius: 20 },
  bannerPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bannerEmoji: { fontSize: 22 },
  bannerText: { flexShrink: 1 },
  bannerName: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  bannerSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  bannerGift: { fontSize: 30, lineHeight: 38 },
  combo: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    color: '#FFD54F',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 6,
  },
});
