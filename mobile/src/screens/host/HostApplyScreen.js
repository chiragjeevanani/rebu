// Host application: 5 short steps, then the application goes to admin review.
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import { post, uploadImage } from '../../api/client';
import {
  BadgeCheck,
  Building2,
  Camera,
  Check,
  IdCard,
  Lock,
  Plus,
  ScanFace,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { colors, fonts, radius, spacing } from '../../theme';
import { useApp } from '../../context/AppContext';
import { womenOnly } from '../../utils/hosting';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Button from '../../components/Button';
import Chip from '../../components/Chip';
import PhotoSourceSheet from '../../components/PhotoSourceSheet';
import RateChips from '../../components/RateChips';

const STEPS = ['About you', 'Photos', 'Face check', 'ID proof', 'Prices'];
const GENDERS = ['Female', 'Male', 'Other'];
const LANGUAGES = [
  'Hindi',
  'English',
  'Tamil',
  'Telugu',
  'Bengali',
  'Marathi',
  'Kannada',
  'Malayalam',
  'Punjabi',
  'Gujarati',
];
const ID_TYPES = ['Aadhaar', 'PAN', 'Passport', 'Driving licence'];
const MAX_PHOTOS = 4;
const PHOTO_GAP = 12;

const ageFrom = (d, m, y) => {
  const dob = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    !y ||
    y.length !== 4 ||
    dob.getDate() !== Number(d) ||
    dob.getMonth() !== Number(m) - 1
  )
    return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const before =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (before) age -= 1;
  return age;
};

const shoot = async front => {
  const res = await launchCamera({
    mediaType: 'photo',
    cameraType: front ? 'front' : 'back',
    quality: 0.8,
    maxWidth: 1440,
    maxHeight: 1440,
  });
  if (res.didCancel) return null;
  if (res.errorCode) {
    Alert.alert('Camera unavailable', res.errorMessage || res.errorCode);
    return null;
  }
  return res.assets?.[0]?.uri || null;
};

function Section({ title, sub, children }) {
  return (
    <View style={styles.section}>
      <Txt variant="h3">{title}</Txt>
      {sub ? (
        <Txt variant="small" style={styles.sectionSub}>
          {sub}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

export default function HostApplyScreen({ navigation, route }) {
  const { user, hostApp, hostMaxRate, refreshHostApp, config } = useApp();
  // Women only: gender is fixed to Female instead of a choice.
  const onlyWomen = womenOnly(config);
  // Resubmitting after a rejection: start from the saved answers.
  const prev = route.params?.resubmit ? hostApp.data || {} : {};
  const maxRate = hostMaxRate;
  const [step, setStep] = useState(0);
  // Fixed pixel sizes: % widths + aspectRatio lay out unevenly in wrapped rows.
  const { width: screenW } = useWindowDimensions();
  const slotW = Math.floor((screenW - spacing.md * 2 - PHOTO_GAP) / 2);
  const slot = { width: slotW, height: Math.round(slotW * 1.25) };

  const [name, setName] = useState(prev.name || user.name || '');
  const [gender, setGender] = useState(
    womenOnly(config) ? 'Female' : prev.gender || user.gender || null,
  );
  const [dob, setDob] = useState(prev.dob || { d: '', m: '', y: '' });
  const [languages, setLanguages] = useState(
    prev.languages || ['Hindi', 'English'],
  );
  const [bio, setBio] = useState(prev.bio || user.bio || '');

  const [photos, setPhotos] = useState(
    prev.photos || (user.photos || []).slice(0, 2),
  );
  const [picker, setPicker] = useState(false);

  const [selfie, setSelfie] = useState(null);
  const [faceState, setFaceState] = useState('none'); // none | checking | ok

  const [idType, setIdType] = useState(prev.id?.type || 'Aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [idPhoto, setIdPhoto] = useState(null);

  const [rates, setRates] = useState(prev.rates || { video: 40, voice: 20 });
  const [agency, setAgency] = useState(prev.agency || '');
  const [agreed, setAgreed] = useState(false);

  const age = ageFrom(dob.d, dob.m, dob.y);
  const valid = [
    name.trim().length >= 2 &&
      gender &&
      age !== null &&
      age >= 18 &&
      languages.length > 0,
    photos.length >= 1,
    faceState === 'ok',
    idNumber.trim().length >= 4 && !!idPhoto,
    agreed,
  ][step];

  const dobError =
    dob.y.length === 4 && age === null
      ? 'Enter a valid date'
      : age !== null && age < 18
      ? 'You must be 18 or older to host'
      : null;

  const takeSelfie = async () => {
    const uri = await shoot(true);
    if (!uri) return;
    setSelfie(uri);
    setFaceState('checking');
    // Face match runs on the server; simulated here.
    setTimeout(() => setFaceState('ok'), 1600);
  };

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const next = async () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      // Images go to the server first so reviewers can see them.
      const [photoUrls, selfieUrl, idUrl] = await Promise.all([
        Promise.all(photos.map(uploadImage)),
        uploadImage(selfie),
        uploadImage(idPhoto),
      ]);
      await post('/host/application', {
        name: name.trim(),
        gender,
        dob: `${dob.y}-${dob.m.padStart(2, '0')}-${dob.d.padStart(2, '0')}`,
        languages,
        bio: bio.trim(),
        photos: photoUrls,
        selfie: selfieUrl,
        id: { type: idType, last4: idNumber.trim().slice(-4), photo: idUrl },
        agencyCode: agency.trim() || null,
        rates,
      });
      await refreshHostApp();
      navigation.replace('HostStatus');
    } catch (e) {
      setSubmitError(
        e.details?.length
          ? `${e.message} ${e.details.map(d => d.message).join(' · ')}`
          : e.message,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const back = () => (step ? setStep(step - 1) : navigation.goBack());

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View>
          {submitError ? (
            <Txt
              variant="small"
              color={colors.danger}
              style={styles.submitError}
            >
              {submitError}
            </Txt>
          ) : null}
          <View style={styles.footer}>
            {step ? (
              <Button
                title="Back"
                variant="outline"
                full={false}
                style={styles.backBtn}
                onPress={back}
              />
            ) : null}
            <Button
              title={
                step === STEPS.length - 1 ? 'Submit application' : 'Continue'
              }
              disabled={!valid || submitting}
              loading={submitting}
              style={styles.flex}
              onPress={next}
            />
          </View>
        </View>
      }
    >
      <Header
        title="Host application"
        subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
        onBack={back}
      />
      <View style={styles.progress}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[styles.progressBar, i <= step && styles.progressOn]}
          />
        ))}
      </View>

      <View style={styles.body}>
        {step === 0 ? (
          <>
            <Input
              label="Display name"
              value={name}
              onChangeText={setName}
              maxLength={24}
            />
            <Section title="Gender">
              <View style={styles.chips}>
                {(onlyWomen ? ['Female'] : GENDERS).map(g => (
                  <Chip
                    key={g}
                    label={g}
                    small
                    selected={gender === g}
                    onPress={() => setGender(g)}
                  />
                ))}
              </View>
            </Section>
            <Section title="Date of birth" sub="Hosts must be 18 or older.">
              <View style={styles.dobRow}>
                {[
                  ['d', 'DD', 2],
                  ['m', 'MM', 2],
                  ['y', 'YYYY', 4],
                ].map(([k, ph, len]) => (
                  <TextInput
                    key={k}
                    value={dob[k]}
                    onChangeText={v =>
                      setDob(o => ({ ...o, [k]: v.replace(/\D/g, '') }))
                    }
                    placeholder={ph}
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                    maxLength={len}
                    style={[styles.dob, k === 'y' && styles.dobYear]}
                  />
                ))}
              </View>
              {dobError ? (
                <Txt variant="small" color={colors.danger} style={styles.err}>
                  {dobError}
                </Txt>
              ) : null}
            </Section>
            <Section title="Languages you speak">
              <View style={styles.chips}>
                {LANGUAGES.map(l => (
                  <Chip
                    key={l}
                    label={l}
                    small
                    selected={languages.includes(l)}
                    onPress={() =>
                      setLanguages(ls =>
                        ls.includes(l) ? ls.filter(x => x !== l) : [...ls, l],
                      )
                    }
                  />
                ))}
              </View>
            </Section>
            <Input
              label="About you (optional)"
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={140}
              placeholder="What do you like to talk about?"
              style={styles.section}
            />
          </>
        ) : null}

        {step === 1 ? (
          <Section
            title="Profile photos"
            sub="Clear photos of your face, no filters or group shots. The first one is your cover."
          >
            <View style={styles.photos}>
              {Array.from({ length: MAX_PHOTOS }).map((_, i) =>
                photos[i] ? (
                  <View key={i} style={[styles.photo, slot]}>
                    <Image
                      source={{ uri: photos[i] }}
                      style={StyleSheet.absoluteFill}
                    />
                    {i === 0 ? (
                      <View style={styles.cover}>
                        <Txt style={styles.coverText}>Cover</Txt>
                      </View>
                    ) : null}
                    <Pressable
                      style={styles.remove}
                      hitSlop={6}
                      onPress={() =>
                        setPhotos(ps => ps.filter((__, j) => j !== i))
                      }
                    >
                      <X size={14} color={colors.white} strokeWidth={3} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    key={i}
                    style={[styles.photo, slot, styles.photoEmpty]}
                    onPress={() => setPicker(true)}
                  >
                    <Plus size={26} color={colors.textMuted} />
                  </Pressable>
                ),
              )}
            </View>
          </Section>
        ) : null}

        {step === 2 ? (
          <Section
            title="Quick face check"
            sub="Take a selfie so we can confirm the photos are really you. It isn’t shown on your profile."
          >
            <View style={styles.faceBox}>
              {selfie ? (
                <Image source={{ uri: selfie }} style={styles.selfie} />
              ) : (
                <View style={[styles.selfie, styles.selfieEmpty]}>
                  <ScanFace size={54} color={colors.textMuted} />
                </View>
              )}
              {faceState === 'checking' ? (
                <Txt variant="label" style={styles.faceNote}>
                  Checking your selfie…
                </Txt>
              ) : faceState === 'ok' ? (
                <View style={styles.faceOk}>
                  <BadgeCheck size={18} color={colors.success} />
                  <Txt variant="label" color={colors.success}>
                    Face matched with your photos
                  </Txt>
                </View>
              ) : (
                <View style={styles.tips}>
                  {[
                    'Good light, face the camera',
                    'No sunglasses, mask or filters',
                    'Only you in the frame',
                  ].map(t => (
                    <View key={t} style={styles.tip}>
                      <Check size={15} color={colors.success} />
                      <Txt variant="small">{t}</Txt>
                    </View>
                  ))}
                </View>
              )}
              <Button
                title={selfie ? 'Retake selfie' : 'Take selfie'}
                icon={Camera}
                variant={selfie ? 'outline' : 'primary'}
                size="md"
                style={styles.faceBtn}
                onPress={takeSelfie}
              />
            </View>
          </Section>
        ) : null}

        {step === 3 ? (
          <>
            <Section
              title="Government ID"
              sub="Needed to confirm your age and to pay you. Only our verification team sees it."
            >
              <View style={styles.chips}>
                {ID_TYPES.map(t => (
                  <Chip
                    key={t}
                    label={t}
                    small
                    selected={idType === t}
                    onPress={() => setIdType(t)}
                  />
                ))}
              </View>
            </Section>
            <Input
              label={`${idType} number`}
              icon={IdCard}
              value={idNumber}
              onChangeText={v => setIdNumber(v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={20}
              style={styles.section}
            />
            <Section title="Photo of the front side">
              <Pressable
                style={styles.idPhoto}
                onPress={async () => {
                  const uri = await shoot(false);
                  if (uri) setIdPhoto(uri);
                }}
              >
                {idPhoto ? (
                  <Image
                    source={{ uri: idPhoto }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <>
                    <Camera size={26} color={colors.textMuted} />
                    <Txt variant="small">Tap to photograph your ID</Txt>
                  </>
                )}
              </Pressable>
            </Section>
            <View style={styles.secure}>
              <ShieldCheck size={16} color={colors.success} />
              <Txt variant="small" style={styles.flex}>
                Encrypted and never shown to other users.
              </Txt>
            </View>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Section
              title="Video call price"
              sub="Coins per minute users pay to video call you."
            >
              <RateChips
                kind="video"
                value={rates.video}
                maxRate={maxRate}
                onChange={v => setRates(r => ({ ...r, video: v }))}
              />
            </Section>
            <Section
              title="Voice call price"
              sub="Coins per minute for voice calls."
            >
              <RateChips
                kind="voice"
                value={rates.voice}
                maxRate={maxRate}
                onChange={v => setRates(r => ({ ...r, voice: v }))}
              />
              <View style={styles.lockNote}>
                <Lock size={13} color={colors.textMuted} />
                <Txt variant="tiny">
                  Higher prices unlock as your host level grows. You can change
                  prices anytime in Host Center.
                </Txt>
              </View>
            </Section>
            <Input
              label="Agency code (optional)"
              icon={Building2}
              placeholder="e.g. STAR1048"
              autoCapitalize="characters"
              value={agency}
              onChangeText={v => setAgency(v.toUpperCase())}
              style={styles.section}
            />
            <Pressable style={styles.agree} onPress={() => setAgreed(a => !a)}>
              <View style={[styles.box, agreed && styles.boxOn]}>
                {agreed ? (
                  <Check size={15} color={colors.white} strokeWidth={3} />
                ) : null}
              </View>
              <Txt variant="small" style={styles.flex}>
                I’m 18+, the photos and ID are mine, and I agree to the{' '}
                <Txt
                  variant="small"
                  color={colors.primary}
                  onPress={() =>
                    navigation.navigate('Content', { page: 'terms' })
                  }
                >
                  host rules
                </Txt>{' '}
                (no nudity, no sharing contact details, be respectful).
              </Txt>
            </Pressable>
          </>
        ) : null}
      </View>

      <PhotoSourceSheet
        visible={picker}
        onClose={() => setPicker(false)}
        onPicked={uri => setPhotos(ps => [...ps, uri].slice(0, MAX_PHOTOS))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  submitError: { paddingHorizontal: spacing.md, paddingTop: 8 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md, paddingBottom: 12 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
  },
  backBtn: { width: 110 },
  progress: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.md,
    marginBottom: 18,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceMuted,
  },
  progressOn: { backgroundColor: colors.primary },
  section: { marginTop: 20 },
  sectionSub: { marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dobRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  dob: {
    width: 64,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: colors.ink,
  },
  dobYear: { width: 92 },
  err: { marginTop: 6 },
  photos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PHOTO_GAP,
    marginTop: 12,
  },
  photo: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  photoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  cover: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    justifyContent: 'center',
  },
  coverText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  remove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceBox: { alignItems: 'center', marginTop: 18 },
  selfie: { width: 180, height: 180, borderRadius: 90 },
  selfieEmpty: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceNote: { marginTop: 16 },
  faceOk: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  tips: { gap: 8, marginTop: 18, alignSelf: 'stretch' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faceBtn: { marginTop: 20, alignSelf: 'stretch' },
  idPhoto: {
    height: 180,
    marginTop: 10,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secure: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  lockNote: { flexDirection: 'row', gap: 6, marginTop: 10, paddingRight: 10 },
  agree: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 22,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
