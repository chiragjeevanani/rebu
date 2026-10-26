import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban,
  Clock,
  Flag,
  IndianRupee,
  MessageCircle,
  Phone,
  Star,
  UserPlus,
  Video,
  Wallet,
  X,
} from 'lucide-react-native';
import { colors, fonts, radius } from '../../theme';
import { callStatus } from '../../utils/calls';
import Txt from '../../components/Txt';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import { CoinIcon } from '../../components/CoinPill';
import { useSecureScreen } from '../../utils/secure';
import { post } from '../../api/client';
import { inr } from '../../data/economy';

export default function CallEndedScreen({ navigation, route }) {
  useSecureScreen();
  const {
    user,
    status = 'completed',
    duration,
    coins = 0,
    earned = 0,
    incoming,
    random,
    blocked: blockedOnCall,
  } = route.params;
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [blocked, setBlocked] = useState(!!blockedOnCall);
  // Callers rate the host once; the server keeps the host's running average.
  const rate = n => {
    if (!rating && route.params.callId && !incoming) {
      post(`/calls/${route.params.callId}/rate`, { stars: n }).catch(() => {});
    }
    setRating(n);
  };
  const info = callStatus(status);
  const connected = !!duration;
  const photo = user.photo || user.photos?.[0];
  const chat = { userId: user.id, name: user.name, photo, online: true };

  return (
    <LinearGradient
      colors={['#121212', '#121212']}
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <View style={styles.topRow}>
        <IconButton
          icon={X}
          variant="glass"
          size={40}
          onPress={() => navigation.goBack()}
        />
      </View>

      <View style={styles.center}>
        <Avatar uri={photo} size={120} ring />
        <Txt style={styles.ended}>{info.label}</Txt>
        <Txt style={styles.name}>{user.name}</Txt>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Clock size={15} color="rgba(255,255,255,0.8)" />
            <Txt style={styles.statText}>{duration || '00:00'}</Txt>
          </View>
          {incoming ? (
            <View style={styles.stat}>
              <IndianRupee size={15} color={colors.success} />
              <Txt style={styles.statText}>
                {inr(earned)} added to your earnings
              </Txt>
            </View>
          ) : (
            <View style={styles.stat}>
              <CoinIcon size={15} />
              <Txt style={styles.statText}>{coins} coins charged</Txt>
            </View>
          )}
        </View>
        {info.note ? <Txt style={styles.note}>{info.note}</Txt> : null}
        {blocked ? (
          <Txt style={styles.note}>
            {user.name} is blocked and can’t contact you anymore.
          </Txt>
        ) : null}

        {connected ? (
          <>
            <Txt style={styles.rateTitle}>How was your call?</Txt>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map(n => (
                <Pressable key={n} onPress={() => rate(n)} hitSlop={4}>
                  <Star
                    size={34}
                    color={colors.warning}
                    fill={n <= rating ? colors.warning : 'transparent'}
                  />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.safety}>
          <Pressable
            style={styles.safetyBtn}
            onPress={() =>
              navigation.navigate('Report', {
                name: user.name,
                targetType: incoming ? 'user' : 'host',
                targetId: user.id,
              })
            }
          >
            <Flag size={14} color="rgba(255,255,255,0.75)" />
            <Txt style={styles.safetyText}>Report</Txt>
          </Pressable>
          <Pressable
            style={styles.safetyBtn}
            disabled={blocked}
            onPress={() => {
              setBlocked(true);
              if (user.id) post(`/me/blocked/${user.id}`).catch(() => {});
            }}
          >
            <Ban size={14} color="rgba(255,255,255,0.75)" />
            <Txt style={styles.safetyText}>{blocked ? 'Blocked' : 'Block'}</Txt>
          </Pressable>
        </View>
      </View>

      {status === 'balance' ? (
        <Button
          title="Recharge coins"
          icon={Wallet}
          onPress={() => navigation.replace('Wallet')}
        />
      ) : blocked ? null : (
        <>
          <Txt style={styles.continue}>
            {connected ? 'Keep the conversation going' : 'Try again'}
          </Txt>
          <View style={styles.options}>
            {[
              {
                icon: MessageCircle,
                label: 'Message',
                onPress: () => navigation.replace('ChatRoom', { chat }),
              },
              ...(incoming
                ? []
                : [
                    {
                      icon: Phone,
                      label: 'Voice call',
                      onPress: () =>
                        navigation.replace('Call', { user, video: false }),
                    },
                    {
                      icon: Video,
                      label: 'Video call',
                      onPress: () =>
                        navigation.replace('Call', { user, video: true }),
                    },
                  ]),
            ].map(o => (
              <Pressable
                key={o.label}
                style={styles.option}
                onPress={o.onPress}
              >
                <LinearGradient
                  colors={colors.gradient}
                  style={styles.optionIcon}
                >
                  <o.icon size={22} color={colors.white} />
                </LinearGradient>
                <Txt style={styles.optionLabel}>{o.label}</Txt>
              </Pressable>
            ))}
          </View>
          {random ? (
            <Button
              title="Next random call"
              icon={Video}
              onPress={() => navigation.replace('RandomCall', { video: true })}
              style={styles.cta}
            />
          ) : incoming ? null : (
            <Button
              title={`Follow ${user.name}`}
              icon={UserPlus}
              variant="light"
              onPress={() => navigation.goBack()}
              style={styles.cta}
            />
          )}
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  topRow: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ended: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 18,
    textTransform: 'uppercase',
  },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 30,
    lineHeight: 38,
    color: colors.white,
    marginTop: 4,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
  },
  statText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  note: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  rateTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
    marginTop: 28,
  },
  stars: { flexDirection: 'row', gap: 10, marginTop: 12 },
  safety: { flexDirection: 'row', gap: 10, marginTop: 24 },
  safetyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  safetyText: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.8)',
  },
  continue: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: 14,
  },
  options: { flexDirection: 'row', gap: 10 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  cta: { marginTop: 18 },
});
