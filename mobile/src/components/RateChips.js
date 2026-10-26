import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { colors, fonts } from '../theme';
import { HOST_RATE_TIERS } from '../context/AppContext';
import Txt from './Txt';
import { CoinIcon } from './CoinPill';

/** Per-minute price picker; tiers above the host's level are locked. */
export default function RateChips({ kind, value, onChange, maxRate, dark }) {
  return (
    <View style={styles.chips}>
      {HOST_RATE_TIERS[kind].map(r => {
        const locked = r > maxRate;
        const on = value === r;
        return (
          <Pressable
            key={r}
            disabled={locked}
            onPress={() => onChange(r)}
            style={[
              styles.rate,
              dark && styles.rateDark,
              on && (dark ? styles.rateOnDark : styles.rateOn),
              locked && (dark ? styles.rateOffDark : styles.rateOff),
            ]}
          >
            {locked ? (
              <Lock size={13} color={colors.textFaint} />
            ) : (
              <CoinIcon size={15} />
            )}
            <Txt
              style={[
                styles.rateText,
                dark && { color: colors.white },
                on && { color: dark ? colors.ink : colors.white },
                locked && { color: colors.textFaint },
              ]}
            >
              {r}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  rateDark: { borderColor: 'rgba(255,255,255,0.3)' },
  rateOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  rateOnDark: { backgroundColor: colors.white, borderColor: colors.white },
  rateOff: { backgroundColor: colors.surfaceMuted, borderColor: 'transparent' },
  rateOffDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'transparent',
  },
  rateText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});
