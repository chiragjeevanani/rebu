// Full-screen animations for premium gifts (999+ coins). Each gift has its own scene.
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
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts } from '../theme';

export const BIG_GIFT_COINS = 999;

const DURATION = { car: 4000, yacht: 4400, castle: 4600, rocket: 4400 };

const GiftFxContext = createContext({ play: () => {} });
export const useGiftFx = () => useContext(GiftFxContext);

/** 0 → 1 over `duration` ms, starting after `delay`. */
function useProgress(duration, delay = 0, easing = Easing.linear) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration, easing }));
  }, [p, duration, delay, easing]);
  return p;
}

/** Repeating 0 → 1 loop (waves, flicker, twinkle). */
function useLoop(period, delay = 0) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: period, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [p, period, delay]);
  return p;
}

const lerp = (p, input, output) => {
  'worklet';
  return interpolate(p, input, output, Extrapolation.CLAMP);
};

function Emoji({ children, size, style }) {
  return (
    <Animated.Text style={[{ fontSize: size, lineHeight: size * 1.2 }, style]}>
      {children}
    </Animated.Text>
  );
}

/* ---------- Firework / confetti burst ---------- */
function Burst({ x, y, delay = 0, count = 14, radius = 120, color, glyph }) {
  const p = useProgress(1100, delay, Easing.out(Easing.cubic));
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x, top: y }]}>
      {Array.from({ length: count }).map((_, i) => (
        <Particle
          key={i}
          p={p}
          i={i}
          count={count}
          radius={radius}
          color={color}
          glyph={glyph}
        />
      ))}
    </View>
  );
}

function Particle({ p, i, count, radius, color, glyph }) {
  // Jitter angle and reach so bursts scatter instead of forming a perfect ring.
  const angle = (i / count) * Math.PI * 2 + (((i * 29) % 21) - 10) / 40;
  const reach = radius * (0.55 + ((i * 53) % 46) / 100);
  const style = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0, 0.05, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * reach * p.value },
      // A little gravity pulls particles down as they fade.
      {
        translateY: Math.sin(angle) * reach * p.value + 40 * p.value * p.value,
      },
      { scale: lerp(p.value, [0, 0.2, 1], [0.3, 1, 0.6]) },
    ],
  }));
  if (glyph) {
    return (
      <Animated.Text style={[styles.particleGlyph, style]}>
        {glyph}
      </Animated.Text>
    );
  }
  return (
    <Animated.View
      style={[styles.particle, { backgroundColor: color }, style]}
    />
  );
}

/* Night-city silhouette behind the road. */
function Skyline({ w, bottom }) {
  const blocks = [];
  for (let x = -10, i = 0; x < w; i++) {
    const bw = 50 + ((i * 37) % 50);
    const bh = 90 + ((i * 71) % 160);
    blocks.push({ x, bw, bh, i });
    x += bw + 4;
  }
  return (
    <>
      {blocks.map(b => (
        <View
          key={b.i}
          style={[
            styles.building,
            { left: b.x, width: b.bw, height: b.bh, bottom },
          ]}
        >
          {Array.from({
            length: Math.floor((b.bw - 10) / 12) * Math.floor((b.bh - 10) / 16),
          }).map((_, j) => (
            <View
              key={j}
              style={[
                styles.window,
                (j * 7 + b.i) % 3 === 0 && styles.windowLit,
              ]}
            />
          ))}
        </View>
      ))}
    </>
  );
}

/* ---------- Sports Car: races in, revs, speeds off ---------- */
function CarScene({ w, h }) {
  const p = useProgress(DURATION.car);
  const lanes = useLoop(380);
  const roadY = h * 0.56;

  const car = useAnimatedStyle(() => {
    const x = lerp(
      p.value,
      [0, 0.3, 0.68, 1],
      [w + 40, w / 2 - 95, w / 2 - 95, -w - 260],
    );
    const shake =
      p.value > 0.3 && p.value < 0.68 ? Math.sin(p.value * 260) * 2.5 : 0;
    return { transform: [{ translateX: x }, { translateY: shake }] };
  });
  const lanesStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -lanes.value * 120 }],
  }));
  const speedLines = useAnimatedStyle(() => ({
    opacity: lerp(
      p.value,
      [0, 0.08, 0.3, 0.36, 0.66, 0.72, 0.95],
      [0, 1, 1, 0, 0, 1, 0],
    ),
  }));
  const smoke = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.28, 0.36, 0.6, 0.7], [0, 1, 1, 0]),
    transform: [
      { translateX: lerp(p.value, [0.28, 0.7], [0, 60]) },
      { scale: lerp(p.value, [0.28, 0.7], [0.6, 1.4]) },
    ],
  }));
  const title = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.32, 0.38, 0.62, 0.7], [0, 1, 1, 0]),
    transform: [{ scale: lerp(p.value, [0.32, 0.4], [0.4, 1]) }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.carBg]}>
      <Skyline w={w} bottom={h - roadY} />
      <View style={[styles.road, { top: roadY }]}>
        <Animated.View style={[styles.lanes, lanesStyle]}>
          {Array.from({ length: Math.ceil(w / 120) + 3 }).map((_, i) => (
            <View key={i} style={styles.lane} />
          ))}
        </Animated.View>
      </View>
      <Animated.View
        style={[styles.abs, { top: roadY - 70, left: 0, right: 0 }, speedLines]}
      >
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={[
              styles.speedLine,
              { top: i * 26, left: 30 + i * 50, width: 110 + i * 30 },
            ]}
          />
        ))}
      </Animated.View>
      <Animated.View style={[styles.abs, { top: roadY - 120, left: 0 }, car]}>
        <Emoji size={150}>🏎️</Emoji>
      </Animated.View>
      <Animated.View
        style={[styles.abs, { top: roadY - 60, left: w / 2 + 60 }, smoke]}
      >
        <Emoji size={56}>💨</Emoji>
      </Animated.View>
      <Animated.Text style={[styles.fxTitle, { top: h * 0.32 }, title]}>
        VROOM!
      </Animated.Text>
    </View>
  );
}

/* ---------- Yacht: sails across a sunny sea ---------- */
function Wave({ w, top, color, period, amp, delay }) {
  const loop = useLoop(period, delay);
  const width = w * 2;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -loop.value * w }],
  }));
  let d = `M0 ${amp}`;
  for (let x = 0; x <= width; x += 60) {
    d += ` Q ${x + 30} ${x % 120 === 0 ? 0 : amp * 2} ${x + 60} ${amp}`;
  }
  d += ` L ${width} 400 L 0 400 Z`;
  return (
    <Animated.View style={[styles.abs, { top, left: 0, width }, style]}>
      <Svg width={width} height={400}>
        <Path d={d} fill={color} />
      </Svg>
    </Animated.View>
  );
}

function YachtScene({ w, h }) {
  const p = useProgress(DURATION.yacht);
  const bob = useLoop(1400);
  const sea = h * 0.55;

  const yacht = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: lerp(
          p.value,
          [0, 0.35, 0.7, 1],
          [w + 20, w / 2 - 85, w / 2 - 105, -w - 200],
        ),
      },
      { translateY: Math.sin(bob.value * Math.PI * 2) * 8 },
      { rotate: `${Math.sin(bob.value * Math.PI * 2 + 1) * 4}deg` },
    ],
  }));
  const gulls = useAnimatedStyle(() => ({
    transform: [
      { translateX: lerp(p.value, [0, 1], [-80, w + 40]) },
      { translateY: Math.sin(p.value * 18) * 10 },
    ],
  }));
  const title = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.35, 0.42, 0.68, 0.76], [0, 1, 1, 0]),
    transform: [{ scale: lerp(p.value, [0.35, 0.45], [0.5, 1]) }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.skyDay]}>
      <Text style={[styles.abs, styles.sun]}>☀️</Text>
      <Animated.View style={[styles.abs, { top: h * 0.2 }, gulls]}>
        <Text style={styles.gulls}>🕊️ 🕊️</Text>
      </Animated.View>
      <Wave
        w={w}
        top={sea + 30}
        color="#2A7AB8"
        period={3200}
        amp={14}
        delay={0}
      />
      <Animated.View style={[styles.abs, { top: sea - 110, left: 0 }, yacht]}>
        <Emoji size={150}>🛥️</Emoji>
      </Animated.View>
      <Wave
        w={w}
        top={sea + 70}
        color="#1D5F94"
        period={2400}
        amp={18}
        delay={200}
      />
      <Animated.Text
        style={[styles.fxTitle, styles.fxTitleDark, { top: h * 0.3 }, title]}
      >
        Bon voyage!
      </Animated.Text>
    </View>
  );
}

/* ---------- Castle: rises at night, crown lands, fireworks ---------- */
function Star({ x, y, delay }) {
  const t = useLoop(1600, delay);
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + 0.75 * Math.abs(Math.sin(t.value * Math.PI)),
  }));
  return <Animated.View style={[styles.star, { left: x, top: y }, style]} />;
}

function CastleScene({ w, h }) {
  const p = useProgress(DURATION.castle);
  const stars = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: (i * 97) % w,
        y: ((i * 53) % (h * 0.45)) + 20,
        d: (i * 130) % 1600,
      })),
    [w, h],
  );
  const castle = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0, 0.1], [0, 1]),
    transform: [
      { translateY: lerp(p.value, [0, 0.3], [260, 0]) },
      { scale: lerp(p.value, [0.25, 0.32, 0.38], [1, 1.06, 1]) },
    ],
  }));
  const crown = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.35, 0.4], [0, 1]),
    transform: [
      { translateY: lerp(p.value, [0.35, 0.5], [-h * 0.5, 0]) },
      { rotate: `${lerp(p.value, [0.35, 0.5], [-30, 0])}deg` },
    ],
  }));
  const title = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.52, 0.58, 0.9, 1], [0, 1, 1, 0]),
    transform: [{ scale: lerp(p.value, [0.52, 0.6], [0.5, 1]) }],
  }));
  const base = h * 0.42;
  const D = DURATION.castle;

  return (
    <View style={[StyleSheet.absoluteFill, styles.night]}>
      {stars.map((s, i) => (
        <Star key={i} x={s.x} y={s.y} delay={s.d} />
      ))}
      <Text style={[styles.abs, styles.moon]}>🌙</Text>
      <Animated.View
        style={[styles.abs, styles.centerX, { top: base }, castle]}
      >
        <Emoji size={200}>🏰</Emoji>
      </Animated.View>
      <Animated.View
        style={[styles.abs, styles.centerX, { top: base - 70 }, crown]}
      >
        <Emoji size={80}>👑</Emoji>
      </Animated.View>
      <Burst x={w * 0.2} y={h * 0.22} delay={D * 0.5} color="#FFD54F" />
      <Burst x={w * 0.8} y={h * 0.18} delay={D * 0.58} color="#FF8FB8" />
      <Burst
        x={w * 0.5}
        y={h * 0.12}
        delay={D * 0.66}
        color="#80DEEA"
        radius={150}
      />
      <Burst x={w * 0.3} y={h * 0.3} delay={D * 0.74} color="#FFFFFF" />
      <Burst x={w * 0.72} y={h * 0.3} delay={D * 0.8} color="#FFD54F" />
      <Animated.Text style={[styles.fxTitle, { top: base + 250 }, title]}>
        Royal welcome!
      </Animated.Text>
    </View>
  );
}

/* ---------- Rocket: countdown shake, launch, starburst ---------- */
function StreakStar({ x, speed, h, delay }) {
  const t = useLoop(speed, delay);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -40 + t.value * (h + 80) }],
  }));
  return <Animated.View style={[styles.streak, { left: x }, style]} />;
}

function RocketScene({ w, h }) {
  const p = useProgress(DURATION.rocket);
  const flicker = useLoop(140);
  const streaks = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        x: (i * 61) % w,
        s: 500 + ((i * 137) % 600),
        d: (i * 90) % 700,
      })),
    [w],
  );
  const pad = h * 0.62;

  const rocket = useAnimatedStyle(() => {
    const shake =
      p.value < 0.3
        ? Math.sin(p.value * 320) * lerp(p.value, [0, 0.3], [1, 5])
        : 0;
    return {
      transform: [
        { translateX: shake },
        { translateY: lerp(p.value, [0, 0.3, 0.72], [0, 0, -h * 0.95]) },
      ],
    };
  });
  const flame = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.1, 0.2], [0, 1]),
    transform: [
      { scaleY: 0.8 + 0.4 * Math.abs(Math.sin(flicker.value * Math.PI)) },
      { rotate: '180deg' },
    ],
  }));
  const smoke = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.05, 0.25, 0.6, 0.8], [0, 1, 1, 0]),
    transform: [{ scale: lerp(p.value, [0.05, 0.6], [0.4, 1.6]) }],
  }));
  const space = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.3, 0.4], [0, 1]),
  }));
  const title = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0.74, 0.8, 0.95, 1], [0, 1, 1, 0]),
    transform: [{ scale: lerp(p.value, [0.74, 0.82], [0.5, 1]) }],
  }));
  const countdown = useAnimatedStyle(() => ({
    opacity: lerp(p.value, [0, 0.04, 0.26, 0.3], [0, 1, 1, 0]),
  }));
  const D = DURATION.rocket;

  return (
    <View style={[StyleSheet.absoluteFill, styles.space]}>
      <Animated.View style={[StyleSheet.absoluteFill, space]}>
        {streaks.map((s, i) => (
          <StreakStar key={i} x={s.x} speed={s.s} h={h} delay={s.d} />
        ))}
      </Animated.View>
      <Animated.Text style={[styles.fxTitle, { top: h * 0.3 }, countdown]}>
        3 · 2 · 1
      </Animated.Text>
      <Animated.View
        style={[styles.abs, styles.centerX, { top: pad + 40 }, smoke]}
      >
        <Text style={styles.smoke}>☁️☁️☁️</Text>
      </Animated.View>
      <Animated.View
        style={[styles.abs, styles.centerX, { top: pad - 120 }, rocket]}
      >
        <Emoji size={140} style={styles.rocketTilt}>
          🚀
        </Emoji>
        <Animated.Text style={[styles.flame, flame]}>🔥</Animated.Text>
      </Animated.View>
      <Burst
        x={w / 2}
        y={h * 0.2}
        delay={D * 0.7}
        count={18}
        radius={170}
        glyph="⭐"
      />
      <Burst
        x={w / 2}
        y={h * 0.2}
        delay={D * 0.72}
        count={16}
        radius={110}
        color="#FFD54F"
      />
      <Burst x={w * 0.25} y={h * 0.32} delay={D * 0.78} glyph="✨" count={10} />
      <Burst x={w * 0.75} y={h * 0.32} delay={D * 0.8} glyph="🎉" count={10} />
      <Animated.Text style={[styles.fxTitle, { top: h * 0.42 }, title]}>
        To the moon!
      </Animated.Text>
    </View>
  );
}

const SCENES = {
  car: CarScene,
  yacht: YachtScene,
  castle: CastleScene,
  rocket: RocketScene,
};

/* ---------- Banner: who sent what ---------- */
function Caption({ gift, to }) {
  const p = useProgress(500, 100, Easing.out(Easing.back(1.5)));
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: lerp(p.value, [0, 1], [-30, 0]) }],
  }));
  return (
    <Animated.View style={[styles.caption, style]}>
      <Text style={styles.captionEmoji}>{gift.emoji}</Text>
      <View>
        <Text style={styles.captionTitle}>
          You sent a {gift.name}
          {to ? ` to ${to}` : ''}
        </Text>
        <Text style={styles.captionSub}>
          {gift.coins.toLocaleString('en-IN')} coins · tap to skip
        </Text>
      </View>
    </Animated.View>
  );
}

export function GiftFxProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const timer = useRef(null);
  const { width: w, height: h } = useWindowDimensions();

  const close = useCallback(() => {
    clearTimeout(timer.current);
    setCurrent(null);
  }, []);

  const play = useCallback((gift, meta = {}) => {
    if (!SCENES[gift.key]) return;
    clearTimeout(timer.current);
    // New key forces the scene to restart even for the same gift twice.
    setCurrent({ gift, to: meta.to, id: Date.now() });
    timer.current = setTimeout(
      () => setCurrent(null),
      DURATION[gift.key] + 200,
    );
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const Scene = current ? SCENES[current.gift.key] : null;
  const value = useMemo(() => ({ play }), [play]);

  return (
    <GiftFxContext.Provider value={value}>
      {children}
      <Modal
        visible={!!current}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={close}
      >
        {current ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={close}>
            <Scene key={current.id} w={w} h={h} />
            <Caption
              key={`c${current.id}`}
              gift={current.gift}
              to={current.to}
            />
          </Pressable>
        ) : null}
      </Modal>
    </GiftFxContext.Provider>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  centerX: { left: 0, right: 0, alignItems: 'center' },
  particle: { position: 'absolute', width: 9, height: 9, borderRadius: 5 },
  particleGlyph: { position: 'absolute', fontSize: 22 },
  fxTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 40,
    lineHeight: 48,
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
  },
  fxTitleDark: { color: '#0B3B66', textShadowColor: 'rgba(255,255,255,0.6)' },
  // Car
  carBg: { backgroundColor: '#0E0F16' },
  building: {
    position: 'absolute',
    backgroundColor: '#1B1D2A',
    paddingTop: 10,
    paddingHorizontal: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  window: { width: 6, height: 8, backgroundColor: '#3A3D52' },
  windowLit: { backgroundColor: '#F5C451' },
  road: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: '#2B2B30',
    overflow: 'hidden',
  },
  lanes: { flexDirection: 'row', marginTop: 56 },
  lane: {
    width: 60,
    height: 8,
    marginRight: 60,
    borderRadius: 4,
    backgroundColor: '#F5B301',
  },
  speedLine: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  // Yacht
  skyDay: { backgroundColor: '#8ED1F0' },
  sun: { top: 70, right: 28, fontSize: 80 },
  gulls: { fontSize: 34 },
  // Castle
  night: { backgroundColor: '#080E26' },
  star: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  moon: { top: 80, left: 30, fontSize: 64 },
  // Rocket
  space: { backgroundColor: '#050616' },
  streak: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 26,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  rocketTilt: { transform: [{ rotate: '-45deg' }] },
  flame: { fontSize: 54, lineHeight: 64, marginTop: -26 },
  smoke: { fontSize: 70 },
  // Caption
  caption: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 18,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  captionEmoji: { fontSize: 30 },
  captionTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  captionSub: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.75)',
  },
});
