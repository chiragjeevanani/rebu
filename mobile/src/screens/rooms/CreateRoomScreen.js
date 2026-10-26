import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AudioLines, Video } from 'lucide-react-native';
import { colors, spacing } from '../../theme';
import { ROOM_CATEGORIES } from '../../data/social';
import { useApp } from '../../context/AppContext';
import { createRoom } from '../../api/rooms';
import Screen from '../../components/Screen';
import Header from '../../components/Header';
import Txt from '../../components/Txt';
import Input from '../../components/Input';
import Chip from '../../components/Chip';
import Button from '../../components/Button';
import Segmented from '../../components/Segmented';

export default function CreateRoomScreen({ navigation }) {
  const { user } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = user.name.split(' ')[0];
  const [title, setTitle] = useState(`${first}’s room`);
  const [welcome, setWelcome] = useState('Welcome! Be kind and have fun 💜');
  const [category, setCategory] = useState('Chat');
  const [kind, setKind] = useState('voice');

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await createRoom({
        title: title.trim() || `${first}’s room`,
        welcome: welcome.trim(),
        category,
        kind,
        cover: user.photos[0],
      });
      navigation.replace('Room', r);
    } catch (e) {
      setError(e.message);
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
            title="Create & open room"
            disabled={!title.trim() || busy}
            loading={busy}
            onPress={create}
          />
        </View>
      }
    >
      <Header title="Create a room" />
      <View style={styles.body}>
        <Txt variant="label" style={styles.label}>
          Room type
        </Txt>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { key: 'voice', label: 'Voice room' },
            { key: 'video', label: 'Video room' },
          ]}
        />
        <View style={styles.hint}>
          {kind === 'video' ? (
            <Video size={16} color={colors.secondary} />
          ) : (
            <AudioLines size={16} color={colors.warning} />
          )}
          <Txt variant="small" style={styles.flex}>
            {kind === 'video'
              ? 'Your camera is shown on stage; up to 8 people can join seats.'
              : 'Audio only; up to 8 people can join seats and talk.'}
          </Txt>
        </View>
        <Input
          label="Room name"
          value={title}
          onChangeText={setTitle}
          maxLength={40}
          style={styles.field}
        />
        <Input
          label="Welcome message"
          value={welcome}
          onChangeText={setWelcome}
          maxLength={80}
          style={styles.field}
        />
        <Txt variant="label" style={styles.label}>
          Category
        </Txt>
        <View style={styles.chips}>
          {ROOM_CATEGORIES.map(c => (
            <Chip
              key={c}
              small
              label={c}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  error: { marginBottom: 8 },
  flex: { flex: 1 },
  body: { paddingHorizontal: spacing.md },
  label: { marginTop: 16, marginBottom: 10 },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  field: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { paddingHorizontal: spacing.md, paddingTop: 10 },
});
