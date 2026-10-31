import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Smartphone, Video } from 'lucide-react-native';
import { colors, fonts, radius, shadow } from '../../theme';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import { LogoBadge } from '../../components/Logo';
import Screen from '../../components/Screen';

const COLLAGE = [47, 12, 48, 15, 45, 13];

export function GoogleG({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </Svg>
  );
}

export function AppleLogo({ size = 20, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.47.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.38-3.69zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27z"
      />
    </Svg>
  );
}

export function FacebookF({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"
      />
    </Svg>
  );
}

export default function WelcomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen edges={[]} bg={colors.background}>
      <View style={styles.collage}>
        {COLLAGE.map((n, i) => (
          <Image
            key={n}
            source={{ uri: `https://i.pravatar.cc/600?img=${n}` }}
            style={[
              styles.tile,
              {
                left: `${(i % 3) * 33 - 3}%`,
                top: Math.floor(i / 3) * 196 + (i % 3 === 1 ? -36 : 8),
                transform: [{ rotate: `${(i % 3) * 3 - 3}deg` }],
              },
            ]}
          />
        ))}
        <LinearGradient
          colors={[
            'rgba(243,238,251,0)',
            'rgba(243,238,251,0.7)',
            colors.background,
          ]}
          locations={[0.35, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.activePill, { top: insets.top + 12 }]}>
          <View style={styles.dot} />
          <Txt variant="tiny" color={colors.ink}>
            2M+ users online
          </Txt>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <LogoBadge size={172} style={styles.badge} />
        <View style={styles.liveTag}>
          <Video size={13} color={colors.secondary} />
          <Txt variant="tiny" color={colors.secondary}>
            LIVE VIDEO CHAT
          </Txt>
        </View>
        <Txt style={styles.headline}>
          Meet. Call.{' '}
          <Txt style={[styles.headline, { color: colors.primary }]}>
            Connect.
          </Txt>
        </Txt>
        <Txt
          variant="body"
          color={colors.textMuted}
          center
          style={{ marginTop: 6, marginBottom: 24 }}
        >
          Video & voice call with verified hosts — anytime, in your language.
        </Txt>

        <Button
          title="Continue with Phone"
          icon={Smartphone}
          onPress={() => navigation.navigate('PhoneLogin')}
        />
        <View style={styles.socialRow}>
          <Pressable
            style={[styles.social, { backgroundColor: colors.ink }]}
            onPress={() => navigation.navigate('PhoneLogin')}
          >
            <AppleLogo />
          </Pressable>
          <Pressable
            style={[styles.social, styles.socialLight]}
            onPress={() => navigation.navigate('PhoneLogin')}
          >
            <GoogleG />
          </Pressable>
          <Pressable
            style={[styles.social, styles.socialLight]}
            onPress={() => navigation.navigate('PhoneLogin')}
          >
            <FacebookF size={22} />
          </Pressable>
        </View>
        <Pressable
          onPress={() => navigation.navigate('EmailAuth')}
          hitSlop={10}
        >
          <Txt style={styles.link}>Use email instead</Txt>
        </Pressable>
        <Txt variant="tiny" center style={{ marginTop: 18, lineHeight: 17 }}>
          By tapping Continue, you agree to our{' '}
          <Txt variant="tiny" color={colors.primary}>
            Terms of Service
          </Txt>
          . See how we use your data in our{' '}
          <Txt variant="tiny" color={colors.primary}>
            Privacy Policy
          </Txt>
          .
        </Txt>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  collage: { height: 390, overflow: 'hidden' },
  tile: {
    position: 'absolute',
    width: '36%',
    aspectRatio: 0.78,
    borderRadius: radius.lg,
  },
  activePill: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    ...shadow.soft,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  bottom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: -30,
  },
  badge: { marginTop: -40, marginBottom: 4 },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 14,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  headline: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    lineHeight: 40,
    color: colors.ink,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    alignSelf: 'stretch',
  },
  social: {
    flex: 1,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  link: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
    marginTop: 16,
    textDecorationLine: 'underline',
  },
});
