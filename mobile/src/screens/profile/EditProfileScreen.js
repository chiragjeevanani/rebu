import React, { useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, View } from 'react-native';
import { Briefcase, MapPin, Plus, User, X } from 'lucide-react-native';
import { colors, radius, spacing } from '../../theme';
import { INTERESTS } from '../../data/mock';
import { useApp } from '../../context/AppContext';
import { patch, uploadImage } from '../../api/client';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Chip from '../../components/Chip';
import Button from '../../components/Button';
import PhotoSourceSheet from '../../components/PhotoSourceSheet';

// Fixed pixel sizes: percentage width + aspectRatio inside a wrapping row
// lays out incorrectly on Android.
const SLOT_W = (Dimensions.get('window').width - spacing.md * 2 - 20) / 3;

export default function EditProfileScreen({ navigation }) {
  const { user, applyServerUser } = useApp();
  const [form, setForm] = useState({
    ...user,
    photos: user.server?.photos?.length ? user.photos : [],
    job: user.server?.job || '',
    interests: user.server?.interests || [],
  });
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggle = key =>
    set(
      'interests',
      form.interests.includes(key)
        ? form.interests.filter(i => i !== key)
        : [...form.interests, key].slice(0, 6),
    );

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      // New photos are local files until uploaded.
      const photos = await Promise.all(form.photos.map(uploadImage));
      const r = await patch('/me', {
        name: form.name.trim(),
        city: form.city.trim(),
        bio: form.bio.trim(),
        job: form.job.trim(),
        interests: form.interests,
        photos,
      });
      applyServerUser(r.user);
      navigation.goBack();
    } catch (e) {
      setError(
        e.details?.length
          ? `${e.message} ${e.details.map(d => d.message).join(' · ')}`
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          {error ? (
            <Txt variant="small" color={colors.danger} style={styles.error}>
              {error}
            </Txt>
          ) : null}
          <Button
            title="Save changes"
            onPress={save}
            loading={busy}
            disabled={
              busy || form.name.trim().length < 2 || !form.photos.length
            }
          />
        </View>
      }
    >
      <Header title="Edit profile" />
      <View style={styles.body}>
        <Txt variant="label" style={styles.label}>
          Photos ({form.photos.length}/6)
        </Txt>
        <View style={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => {
            const uri = form.photos[i];
            return (
              <Pressable
                key={i}
                style={styles.slot}
                onPress={() => !uri && setPicker(true)}
              >
                {uri ? (
                  <>
                    <Image source={{ uri }} style={StyleSheet.absoluteFill} />
                    <Pressable
                      style={styles.remove}
                      onPress={() =>
                        set(
                          'photos',
                          form.photos.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <X size={13} color={colors.white} strokeWidth={3} />
                    </Pressable>
                  </>
                ) : (
                  <View style={styles.add}>
                    <Plus size={22} color={colors.primary} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <Input
          label="Name"
          icon={User}
          value={form.name}
          onChangeText={v => set('name', v)}
          style={styles.field}
        />
        <Input
          label="Job title"
          icon={Briefcase}
          value={form.job}
          onChangeText={v => set('job', v)}
          style={styles.field}
        />
        <Input
          label="City"
          icon={MapPin}
          value={form.city}
          onChangeText={v => set('city', v)}
          style={styles.field}
        />
        <Input
          label="About me"
          multiline
          maxLength={300}
          value={form.bio}
          onChangeText={v => set('bio', v)}
          style={styles.field}
        />

        <Txt variant="label" style={styles.label}>
          Interests
        </Txt>
        <View style={styles.wrap}>
          {INTERESTS.map(i => (
            <Chip
              key={i.key}
              small
              label={i.label}
              emoji={i.emoji}
              selected={form.interests.includes(i.key)}
              onPress={() => toggle(i.key)}
            />
          ))}
        </View>
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
  error: { marginBottom: 8 },
  body: { paddingHorizontal: spacing.md, paddingTop: 4 },
  label: { marginBottom: 10 },
  field: { marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  slot: {
    width: SLOT_W,
    height: SLOT_W * 1.25,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  add: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#F4B6C9',
    borderRadius: radius.md,
    backgroundColor: '#FFF7FA',
  },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(17,10,26,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
