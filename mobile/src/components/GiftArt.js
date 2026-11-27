import React from 'react';
import { Image } from 'react-native';
import { useApp } from '../context/AppContext';
import { API_URL } from '../api/client';
import Txt from './Txt';
import { BUILT_IN_GIFTS, stockImage } from '../data/giftAssets';

const absolute = url =>
  !url ? null : /^https?:\/\//.test(url) ? url : `${API_URL}${url}`;

/**
 * A gift's picture (the rendered 3D gift), looked up in the server catalog by
 * key when the gift object doesn't carry one. Falls back to the emoji.
 */
export default function GiftArt({ gift, size = 40, style }) {
  const { config } = useApp();
  const key = gift?.key || gift;
  const image =
    gift?.image || (config?.gifts || []).find(g => g.key === key)?.image;
  const builtIn = BUILT_IN_GIFTS[key];
  if (builtIn && (!image || image === stockImage(key))) {
    return (
      <Image
        source={builtIn}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
      />
    );
  }
  if (image) {
    return (
      <Image
        source={{ uri: absolute(image) }}
        style={[{ width: size, height: size }, style]}
        resizeMode="contain"
      />
    );
  }
  return (
    <Txt style={[{ fontSize: size * 0.78, lineHeight: size }, style]}>
      {gift?.emoji || '🎁'}
    </Txt>
  );
}
