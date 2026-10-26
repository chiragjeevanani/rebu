import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { colors } from '../theme';

export default function Avatar({
  uri,
  size = 48,
  ring = false,
  online = false,
  style,
}) {
  const pad = ring ? 2.5 : 0;
  const img = (
    <View
      style={{
        padding: ring ? 2 : 0,
        backgroundColor: colors.white,
        borderRadius: size,
      }}
    >
      <Image
        source={{ uri }}
        style={{
          width: size - pad * 2 - (ring ? 4 : 0),
          height: size - pad * 2 - (ring ? 4 : 0),
          borderRadius: size,
          backgroundColor: colors.surfaceMuted,
        }}
      />
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
