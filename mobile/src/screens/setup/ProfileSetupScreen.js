import React, { useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Calendar, ImagePlus, Plus, User, X } from 'lucide-react-native';
import { colors, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import PhotoSourceSheet from '../../components/PhotoSourceSheet';

// Short sign-up: users only need a name, birthday, gender and a photo.
const STEPS = ['basics', 'photos'];
const GENDERS = ['Woman', 'Man', 'Non-binary'];

// Photo grid: large main slot spanning 2×2, then five small slots around it.
const GAP = 10;
const SLOT_W = (Dimensions.get('window').width - spacing.lg * 2 - GAP * 2) / 3;
const SLOT_H = SLOT_W * 1.25;
const col = c => c * (SLOT_W + GAP);
const row = r => r * (SLOT_H + GAP);
const SLOT_POS = [
  { left: 0, top: 0, width: SLOT_W * 2 + GAP, height: SLOT_H * 2 + GAP },
  { left: col(2), top: 0 },
  { left: col(2), top: row(1) },
  { left: col(0), top: row(2) },
  { left: col(1), top: row(2) },
  { left: col(2), top: row(2) },
];

export default function ProfileSetupScreen({ navigation }) {
  const { signIn, completeProfile, setUser, user } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '',
    dob: '',
    gender: 'Man',
    photos: [],
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const key = STEPS[step];

  const canNext = {
    basics: form.name.trim().length > 1 && form.dob.length >= 8,
    photos: form.photos.length >= 1,
  }[key];

  const next = () => {
    if (step < STEPS.length - 1) return setStep(step + 1);
    setUser({
      ...user,
      name: form.name || user.name,
      gender: form.gender,
      photos: form.photos.length ? form.photos : user.photos,
    });
    completeProfile();
    signIn();
  };

  const [picker, setPicker] = useState(false);
  const addPhoto = () => {
    if (form.photos.length < 6) setPicker(true);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        back
        onBack={() => (step ? setStep(step - 1) : navigation.goBack())}
      />
      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.progressTrack}>
            {i <= step ? (
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {key === 'basics' && (
          <>
            <Txt variant="h1">Let’s set up your profile</Txt>
            <Txt variant="body" color={colors.textMuted} style={styles.sub}>
              This is how you’ll appear to others on REBU.
            </Txt>
            <Input
              label="First name"
              icon={User}
              placeholder="Your first name"
              value={form.name}
              onChangeText={v => set('name', v)}
              style={styles.field}
            />
            <Input
              label="Birthday"
              icon={Calendar}
              placeholder="DD / MM / YYYY"
              keyboardType="number-pad"
              maxLength={10}
              value={form.dob}
              onChangeText={v => set('dob', v)}
              style={styles.field}
            />
            <Txt variant="small" style={{ marginTop: -6, marginBottom: 18 }}>
              Your age will be public, your birthday won’t.
            </Txt>
            <Txt variant="label" style={{ marginBottom: 10 }}>
              I am a
            </Txt>
            <View style={styles.row}>
              {GENDERS.map(g => (
                <Chip
                  key={g}
                  label={g}
                  selected={form.gender === g}
                  onPress={() => set('gender', g)}
                />
              ))}
            </View>
          </>
        )}

        {key === 'photos' && (
          <>
            <Txt variant="h1">Add your photo</Txt>
            <Txt variant="body" color={colors.textMuted} style={styles.sub}>
              Add at least one clear photo of yourself. Hosts see it when you
              call or message them.
            </Txt>
            <View style={styles.photoGrid}>
              {Array.from({ length: 6 }).map((_, i) => {
                const uri = form.photos[i];
                return (
                  <Pressable
                    key={i}
                    onPress={uri ? undefined : addPhoto}
                    style={[styles.photoSlot, SLOT_POS[i]]}
                  >
                    {uri ? (
                      <>
                        <Image
                          source={{ uri }}
                          style={StyleSheet.absoluteFill}
                        />
                        <Pressable
                          style={styles.removePhoto}
                          onPress={() =>
                            set(
                              'photos',
                              form.photos.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <X size={14} color={colors.white} strokeWidth={3} />
                        </Pressable>
                        {i === 0 ? (
                          <View style={styles.mainTag}>
                            <Txt variant="tiny" color={colors.white}>
                              MAIN
                            </Txt>
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <View style={styles.addPhoto}>
                        {i === 0 ? (
                          <ImagePlus size={30} color={colors.primary} />
                        ) : (
                          <Plus size={24} color={colors.primary} />
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={key === 'photos' ? 'Finish' : 'Continue'}
          disabled={!canNext}
          onPress={next}
        />
      </View>
      <PhotoSourceSheet
        visible={picker}
        onClose={() => setPicker(false)}
        onPicked={uri => set('photos', [...form.photos, uri].slice(0, 6))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginBottom: 8,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ECE5F1',
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 24,
    flexGrow: 1,
  },
  sub: { marginTop: 8, marginBottom: 24 },
  field: { marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  photoGrid: { height: SLOT_H * 3 + GAP * 2 },
  photoSlot: {
    position: 'absolute',
    width: SLOT_W,
    height: SLOT_H,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  addPhoto: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#F4B6C9',
    borderRadius: radius.md,
    backgroundColor: '#FFF7FA',
  },
  removePhoto: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(17,10,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTag: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    paddingBottom: spacing.md,
  },
});
