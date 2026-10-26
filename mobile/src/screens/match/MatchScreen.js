import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Phone, ShieldCheck, Shuffle, Video } from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { HOSTS } from '../../data/mock';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import Avatar from '../../components/Avatar';
import CoinPill, { CoinIcon } from '../../components/CoinPill';
import { Card } from '../../components/ListRow';

const LANGUAGES = ['Any', 'Hindi', 'English', 'Tamil', 'Bengali'];
export const RANDOM_RATES = { video: 40, voice: 20 };

export default function MatchScreen({ navigation }) {
  const { coins } = useApp();
  const [language, setLanguage] = useState('Any');
  const online = HOSTS.filter(h => h.online);
  const start = video => navigation.navigate('RandomCall', { video, language });

  return (
    <Screen>
      <Header
        title="Spark"
        subtitle="Get connected to a random host instantly"
        right={
          <CoinPill
            amount={coins}
            light
            onPress={() => navigation.navigate('Wallet')}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#1C1C1E', '#1C1C1E']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Shuffle size={40} color={colors.white} />
          </View>
          <Txt style={styles.heroTitle}>Spark</Txt>
          <Txt style={styles.heroSub}>
            One tap and you’re talking to someone new. Skip anytime.
          </Txt>
          <View style={styles.faces}>
            {online.slice(0, 5).map((h, i) => (
              <Avatar
                key={h.id}
                uri={h.photo}
                size={40}
                style={[styles.face, i > 0 && styles.faceOverlap]}
              />
            ))}
            <Txt style={styles.facesText}>+{online.length * 214} online</Txt>
          </View>
        </LinearGradient>

        <Txt variant="label" style={styles.label}>
          Language
        </Txt>
        <View style={styles.chips}>
          {LANGUAGES.map(l => (
            <Chip
              key={l}
              small
              label={l}
              selected={language === l}
              onPress={() => setLanguage(l)}
            />
          ))}
        </View>

        <Button
          title="Video match"
          icon={Video}
          onPress={() => start(true)}
          style={styles.cta}
        />
        <View style={styles.rate}>
          <CoinIcon size={14} />
          <Txt variant="small">
            {RANDOM_RATES.video} coins/min · charged only after you connect
          </Txt>
        </View>
        <Button
          title="Voice match"
          icon={Phone}
          variant="outline"
          onPress={() => start(false)}
          style={styles.cta}
        />
        <View style={styles.rate}>
          <CoinIcon size={14} />
          <Txt variant="small">{RANDOM_RATES.voice} coins/min</Txt>
        </View>

        <Card style={styles.safety}>
          <ShieldCheck size={20} color={colors.success} />
          <Txt variant="small" style={styles.flex}>
            All hosts are verified. Calls are moderated — report anything
            inappropriate from the call screen.
          </Txt>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  body: { paddingHorizontal: spacing.md, paddingBottom: 24 },
  hero: { borderRadius: radius.xl, padding: 22, alignItems: 'center' },
  heroIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    color: colors.white,
    marginTop: 14,
  },
  heroSub: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 6,
  },
  faces: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  face: { borderWidth: 2, borderColor: colors.white, borderRadius: 22 },
  faceOverlap: { marginLeft: -12 },
  facesText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
    marginLeft: 10,
  },
  label: { marginTop: 22, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cta: { marginTop: 22 },
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  safety: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
  },
});
