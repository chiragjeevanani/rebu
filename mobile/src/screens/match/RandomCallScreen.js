import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { colors, fonts } from '../../theme';
import { HOSTS } from '../../data/mock';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import IconButton from '../../components/IconButton';
import Chip from '../../components/Chip';
import { CoinIcon } from '../../components/CoinPill';
import { useSecureScreen } from '../../utils/secure';

const ORBIT = HOSTS.slice(0, 6);

export default function RandomCallScreen({ navigation, route }) {
  useSecureScreen();
  const video = route.params?.video ?? true;
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const spin = useRef(new Animated.Value(0)).current;
  const language = route.params?.language || 'Any';
  const [status, setStatus] = useState('Searching for someone…');

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    const t1 = setTimeout(() => setStatus('Found someone nearby ✨'), 2600);
    const t2 = setTimeout(() => {
      const h = HOSTS[Math.floor(Math.random() * 3)];
      navigation.replace('Call', { user: h, video, random: true });
    }, 4200);
    return () => {
      loop.stop();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [navigation, spin, video]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const counter = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-360deg'],
  });

  return (
    <LinearGradient
      colors={['#121212', '#121212']}
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.top}>
        <IconButton
          icon={X}
          variant="glass"
          size={40}
          onPress={() => navigation.goBack()}
        />
        <View style={styles.rate}>
          <CoinIcon size={14} />
          <Txt style={styles.rateText}>{video ? 40 : 20} coins/min</Txt>
        </View>
      </View>

      <View style={styles.center}>
        <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]}>
          {ORBIT.map((h, i) => {
            const a = (i / ORBIT.length) * Math.PI * 2;
            return (
              <Animated.Image
                key={h.id}
                source={{ uri: h.photo }}
                style={[
                  styles.orbitImg,
                  {
                    left: 130 + Math.cos(a) * 130 - 26,
                    top: 130 + Math.sin(a) * 130 - 26,
                    transform: [{ rotate: counter }],
                  },
                ]}
              />
            );
          })}
        </Animated.View>
        <LinearGradient colors={colors.gradient} style={styles.meRing}>
          <Image source={{ uri: user.photos[0] }} style={styles.me} />
        </LinearGradient>
      </View>

      <Txt style={styles.status}>{status}</Txt>
      <Txt variant="body" color="rgba(255,255,255,0.7)" center>
        {video ? 'Random video call' : 'Random voice call'} · Be kind, be
        respectful
      </Txt>
      <View style={styles.prefs}>
        <Chip
          label={language === 'Any' ? 'Any language' : language}
          emoji="🗣️"
          small
          variant="glass"
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
  },
  rateText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orbit: {
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    position: 'absolute',
  },
  orbitImg: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  meRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  me: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 3,
    borderColor: '#121212',
  },
  status: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    lineHeight: 32,
    color: colors.white,
    textAlign: 'center',
    marginBottom: 6,
  },
  prefs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
  },
});
