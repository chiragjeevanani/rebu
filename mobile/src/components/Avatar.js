import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Crown, User } from 'lucide-react-native';
import { colors, fonts } from '../theme';
import Txt from './Txt';

// Sender frames (lifetime coins bought): higher tiers get a second halo ring
// and, on big avatars, a name tag. Admins pick tier names and colours.
const TOP_TIERS = ['gold', 'platinum', 'diamond'];

function Frame({ tier, size, children }) {
  const color = typeof tier === 'string' ? tier : tier.color;
  const top = TOP_TIERS.includes(tier.key);
  const bw = Math.max(2, Math.round(size * (top ? 0.055 : 0.045)));
  return (
    <View style={{ width: size, height: size }}>
      {top ? (
        <View
          style={[
            styles.halo,
            {
              top: -bw,
              left: -bw,
              right: -bw,
              bottom: -bw,
              borderRadius: size,
              borderWidth: Math.max(1.5, bw * 0.5),
              borderColor: color + '66',
            },
          ]}
        />
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          borderWidth: bw,
          borderColor: color,
          padding: 1.5,
          backgroundColor: colors.white,
        }}
      >
        {children(size - bw * 2 - 3)}
      </View>
      {tier.name && size >= 72 ? (
        <View style={[styles.tag, { backgroundColor: color }]}>
          <Crown size={10} color={colors.white} fill={colors.white} />
          <Txt style={styles.tagText}>{tier.name}</Txt>
        </View>
      ) : null}
    </View>
  );
}

export default function Avatar({
  uri,
  size = 48,
  ring = false,
  online = false,
  frame = null, // sender tier { key, name, color } or a colour string
  style,
}) {
  const pad = ring ? 2.5 : 0;
  const photo = inner =>
    uri ? (
      <Image
        source={{ uri }}
        style={{
          width: inner,
          height: inner,
          borderRadius: size,
          backgroundColor: colors.surfaceMuted,
        }}
      />
    ) : (
      // No photo yet: a plain person glyph instead of an empty circle.
      <View
        style={[
          styles.empty,
          { width: inner, height: inner, borderRadius: size },
        ]}
      >
        <User size={inner * 0.5} color={colors.textFaint} />
      </View>
    );
  const img = (
    <View
      style={{
        padding: ring ? 2 : 0,
        backgroundColor: colors.white,
        borderRadius: size,
      }}
    >
      {photo(size - pad * 2 - (ring ? 4 : 0))}
    </View>
  );
  return (
    <View style={[{ width: size, height: size }, style]}>
      {frame && (frame.color || typeof frame === 'string') ? (
        <Frame tier={frame} size={size}>
          {photo}
        </Frame>
      ) : ring ? (
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ padding: pad, borderRadius: size }}
        >
          {img}
        </LinearGradient>
      ) : (
        img
      )}
      {online ? (
        <View
          style={[
            styles.dotWrap,
            {
              width: size * 0.26,
              height: size * 0.26,
              right: size * 0.02,
              bottom: size * 0.02,
            },
          ]}
        >
          <View
            style={[
              styles.dot,
              { width: size * 0.26, height: size * 0.26, borderRadius: size },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  dotWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: { position: 'absolute' },
  tag: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  tagText: { fontFamily: fonts.bold, fontSize: 10, color: colors.white },
  dot: {
    backgroundColor: colors.online,
    borderWidth: 2.5,
    borderColor: colors.white,
  },
});
