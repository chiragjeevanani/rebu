import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ImagePlus, X } from 'lucide-react-native';
import { colors, radius, spacing } from '../../theme';
import { TOPICS } from '../../data/social';
import { useApp } from '../../context/AppContext';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Chip from '../../components/Chip';
import Button from '../../components/Button';
import PhotoSourceSheet from '../../components/PhotoSourceSheet';

export default function CreateMomentScreen({ navigation }) {
  const { user, addMoment } = useApp();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [topic, setTopic] = useState(null);
  const [picker, setPicker] = useState(false);
  const canPost = text.trim() || photo;

  const post = () => {
    addMoment({
      id: `my${Date.now()}`,
      author: { name: 'You', photo: user.photos[0] },
      type: photo ? 'photo' : 'text',
      media: photo,
      topic,
      text: text.trim(),
      time: 'Just now',
      likes: 0,
      comments: 0,
    });
    navigation.goBack();
  };

  return (
    <Screen
      scroll
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button title="Post moment" disabled={!canPost} onPress={post} />
        </View>
      }
    >
      <Header title="New moment" />
      <View style={styles.body}>
        <Input
          multiline
          maxLength={300}
          placeholder="Share what’s on your mind…"
          value={text}
          onChangeText={setText}
        />
        <Txt variant="label" style={styles.label}>
          Photo
        </Txt>
        {photo ? (
          <View style={styles.photo}>
            <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} />
            <Pressable style={styles.remove} onPress={() => setPhoto(null)}>
              <X size={14} color={colors.white} strokeWidth={3} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.photo, styles.add]}
            onPress={() => setPicker(true)}
          >
            <ImagePlus size={30} color={colors.primary} />
            <Txt variant="small" color={colors.primary}>
              Add photo
            </Txt>
          </Pressable>
        )}
        <Txt variant="label" style={styles.label}>
          Topic
        </Txt>
        <View style={styles.chips}>
          {TOPICS.map(t => (
            <Chip
              key={t.key}
              small
              label={`#${t.label}`}
              selected={topic === t.key}
              onPress={() => setTopic(topic === t.key ? null : t.key)}
            />
          ))}
        </View>
        <Txt variant="tiny" style={styles.note}>
          Moments are reviewed. Nudity, contact details or spam lead to a ban.
        </Txt>
      </View>
      <PhotoSourceSheet
        visible={picker}
        onClose={() => setPicker(false)}
        onPicked={setPhoto}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.md },
  label: { marginTop: 20, marginBottom: 10 },
  photo: {
    width: 150,
    height: 200,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#F4B6C9',
    backgroundColor: '#FFF7FA',
  },
  remove: {
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { marginTop: 16, lineHeight: 16 },
  footer: { paddingHorizontal: spacing.md, paddingTop: 10 },
});
