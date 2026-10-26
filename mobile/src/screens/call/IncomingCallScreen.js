import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, PhoneOff, Video } from 'lucide-react-native';
import { colors, fonts } from '../../theme';
import { inr, netPerMinute } from '../../data/economy';
import { useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import IconButton from '../../components/IconButton';
import { useSecureScreen } from '../../utils/secure';

// How long the host's phone rings before it counts as a missed call.
const RING_TIMEOUT = 30000;

export default function IncomingCallScreen({ navigation, route }) {
  useSecureScreen();
  const { caller } = route.params;
  const { addCall, hostRates, hostAgency } = useApp();
  const insets = useSafeAreaInsets();
  const type = caller.video ? 'video' : 'voice';
  const earnRate = netPerMinute(hostRates[type], type, hostAgency);

  const decline = (status = 'declined') => {
    addCall({
      name: caller.name,
      photo: caller.photo,
      type,
      dir: 'missed',
      status,
      duration: null,
      coins: 0,
    });
    navigation.goBack();
  };

  useEffect(() => {
    const t = setTimeout(() => decline('no_answer'), RING_TIMEOUT);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = () =>
    navigation.replace('Call', {
      user: caller,
      video: caller.video,
      incoming: true,
    });

  return (
    <LinearGradient
      colors={['#121212', '#121212']}
      style={[
        styles.root,
        { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
      ]}
    >
      <View style={styles.center}>
        <Txt style={styles.kicker}>
          Incoming {caller.video ? 'video' : 'voice'} call
        </Txt>
        <Avatar uri={caller.photo} size={140} ring />
        <Txt style={styles.name}>
          {caller.name}
          {caller.age ? `, ${caller.age}` : ''}
        </Txt>
        <View style={styles.earn}>
          <Txt style={styles.earnText}>
            You earn {inr(earnRate)}/min for connected time
          </Txt>
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.action}>
          <IconButton
            icon={PhoneOff}
            variant="gradient"
            gradient={['#E5383B', '#E5383B']}
            size={72}
            iconSize={30}
            onPress={() => decline()}
          />
          <Txt style={styles.actionText}>Decline</Txt>
        </View>
        <View style={styles.action}>
          <IconButton
            icon={caller.video ? Video : Phone}
            variant="gradient"
            gradient={['#1E9E5A', '#1E9E5A']}
            size={72}
            iconSize={30}
            onPress={accept}
          />
          <Txt style={styles.actionText}>Accept</Txt>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 32, justifyContent: 'space-between' },
  center: { alignItems: 'center', gap: 14 },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 12,
  },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 30,
    lineHeight: 38,
    color: colors.white,
  },
  earn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(34,197,94,0.18)',
  },
  earnText: { fontFamily: fonts.semibold, fontSize: 13, color: '#86EFAC' },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
  action: { alignItems: 'center', gap: 10 },
  actionText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
});
