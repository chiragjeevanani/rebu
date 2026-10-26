import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { User } from 'lucide-react-native';
import { colors } from '../theme';

export default function Avatar({
  uri,
  size = 48,
  ring = false,
  online = false,
  style,
}) {
  const pad = ring ? 2.5 : 0;
  const inner = size - pad * 2 - (ring ? 4 : 0);
  const img = (
    <View
      style={{
        padding: ring ? 2 : 0,
        backgroundColor: colors.white,
        borderRadius: size,
      }}
    >
      {uri ? (
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
      )}
    </View>
  );
  return (
    <View style={[{ width: size, height: size }, style]}>
      {ring ? (
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
  dot: {
    backgroundColor: colors.online,
    borderWidth: 2.5,
    borderColor: colors.white,
  },
});
