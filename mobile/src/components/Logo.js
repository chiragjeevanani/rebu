import React from 'react';
import { Image, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors } from '../theme';

const MARK = require('../assets/images/rebu_mark.png');
const BADGE = require('../assets/images/rebu_logo.jpg');

/** Round REBU logo mark (the brand badge, cropped to a circle). */
export function LogoMark({ size = 48 }) {
  return (
    <Image
      source={MARK}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

/** Full brand badge including the tagline — for hero placements. */
export function LogoBadge({ size = 128, style }) {
  return (
    <Image
      source={BADGE}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

export default function Logo({ height = 30, white, withMark = false }) {
  const w = height * 3.2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {withMark ? <LogoMark size={height * 1.25} /> : null}
      <Svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        <Defs>
          <SvgGradient id="wg" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.gradient[0]} />
            <Stop offset="1" stopColor={colors.gradient[1]} />
          </SvgGradient>
        </Defs>
        <SvgText
          x="0"
          y={height * 0.84}
          fontSize={height}
          fontWeight="800"
          fontFamily="PlusJakartaSans-ExtraBold"
          letterSpacing={-0.5}
          fill={white ? '#FFFFFF' : 'url(#wg)'}
        >
          REBU
        </SvgText>
      </Svg>
    </View>
  );
}
