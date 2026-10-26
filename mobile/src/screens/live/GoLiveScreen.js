// Go Live studio (camera button): preview yourself, pick a mode, set a title,
// then start a solo live, a premium live, a video party or an audio room.
import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Pressable,
  StatusBar,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Crown,
  Mic,
  Pencil,
  Settings2,
  SwitchCamera,
  UsersRound,
  Video,
} from 'lucide-react-native';
import { colors, fonts } from '../../theme';
import { HOST_LEVEL_MAX, useApp } from '../../context/AppContext';
import Txt from '../../components/Txt';
import Sheet from '../../components/Sheet';
import Chip from '../../components/Chip';
import Button from '../../components/Button';
import ListRow from '../../components/ListRow';
import RateChips from '../../components/RateChips';
import LiveCamera from '../../components/LiveCamera';
import PhotoSourceSheet from '../../components/PhotoSourceSheet';
import { createRoom } from '../../api/rooms';
import { CoinIcon } from '../../components/CoinPill';

const MODES = [
  { key: 'premium', label: 'Premium', action: 'Go Premium', icon: Crown },
  { key: 'live', label: 'Live', action: 'Go Live', icon: Video },
  { key: 'party', label: 'Party', action: 'Start party', icon: UsersRound },
  { key: 'audio', label: 'Audio', action: 'Start audio', icon: Mic },
];
const TICKETS = [50, 100, 200, 500];
const HINTS = {
  premium: 'Viewers pay a one-time ticket to watch.',
  live: 'Anyone can watch for free and send gifts.',
  party: 'Video room — friends take seats on camera.',
  audio: 'Voice-only room — your camera stays off.',
};

export default function GoLiveScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, isHost, hostRates, setHostRates, hostLevel } = useApp();
  const first = user.name.split(' ')[0];

  const [mode, setMode] = useState('live');
  const [position, setPosition] = useState('front');
  const [title, setTitle] = useState('Hey! Come say hi 👋');
  const [cover, setCover] = useState(user.photos[0]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [picker, setPicker] = useState(false);
  const [settings, setSettings] = useState(false);
  const [ticket, setTicket] = useState(100);
  const [allowGuests, setAllowGuests] = useState(true);
  const [comments, setComments] = useState('Everyone');
  const [rate, setRate] = useState(hostRates.video);

  const current = MODES.find(m => m.key === mode);
  // Paid lives (tickets / per-minute calls) need an approved host account.
  const needsHost = mode === 'premium' && !isHost;

  const start = () => {
    if (needsHost) {
      navigation.navigate('BecomeHost');
      return;
    }
    const name = title.trim() || `${first}’s live`;
    if (mode === 'party' || mode === 'audio') {
      createRoom({
        title: name,
        welcome: 'Welcome! Be kind and have fun 💜',
        category: 'Chat',
        kind: mode === 'party' ? 'video' : 'voice',
        cover,
      })
        .then(r => navigation.replace('Room', r))
        .catch(e => Alert.alert('Couldn’t open the room', e.message));
      return;
    }
    navigation.replace('MyLive', {
      title: name,
      premium: mode === 'premium',
      ticket,
      position,
      allowGuests,
      cover,
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LiveCamera position={position} off={mode === 'audio'} cover={cover} />
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.4)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0)',
          'rgba(0,0,0,0.6)',
        ]}
        locations={[0, 0.2, 0.6, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {mode === 'audio' ? (
        <View style={styles.audio} pointerEvents="none">
          <Image source={{ uri: cover }} style={styles.audioAvatar} />
          <View style={styles.audioMic}>
            <Mic size={18} color={colors.white} />
          </View>
        </View>
      ) : null}

      {/* Top: back + side tools */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <ArrowLeft size={28} color={colors.white} />
        </Pressable>
        <View style={styles.side}>
          {mode !== 'audio' ? (
            <Pressable
              style={styles.sideBtn}
              hitSlop={6}
              onPress={() =>
                setPosition(p => (p === 'front' ? 'back' : 'front'))
              }
            >
              <SwitchCamera size={25} color={colors.white} />
            </Pressable>
          ) : null}
          <Pressable
            style={styles.sideBtn}
            hitSlop={6}
            onPress={() => setSettings(true)}
          >
            <Settings2 size={25} color={colors.white} />
          </Pressable>
          {isHost && (mode === 'live' || mode === 'premium') ? (
            <Pressable
              style={styles.ratePill}
              onPress={() => setSettings(true)}
            >
              <CoinIcon size={16} />
              <Txt style={styles.rateText}>{rate}/min</Txt>
            </Pressable>
          ) : null}
          {mode === 'premium' && isHost ? (
            <Pressable
              style={styles.ratePill}
              onPress={() => setSettings(true)}
            >
              <Txt style={styles.rateText}>🎟 {ticket}</Txt>
            </Pressable>
          ) : null}
        </View>
      </View>

      <KeyboardAvoidingView behavior="padding" style={styles.bottom}>
        {needsHost ? (
          <View style={styles.hostCard}>
            <Crown size={20} color={colors.coin} />
            <View style={styles.flex}>
              <Txt style={styles.hostTitle}>Premium is for hosts</Txt>
              <Txt style={styles.hostSub}>
                Become a host to sell tickets and earn from private calls.
              </Txt>
            </View>
          </View>
        ) : (
          <Txt style={styles.hint}>{HINTS[mode]}</Txt>
        )}

        {/* Cover + title */}
        <View style={styles.meta}>
          <Pressable style={styles.cover} onPress={() => setPicker(true)}>
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} />
            <View style={styles.coverEdit}>
              <Pencil size={13} color={colors.white} />
            </View>
          </Pressable>
          <Pressable
            style={styles.titleBox}
            onPress={() => setEditingTitle(true)}
          >
            <Txt style={styles.titleLabel}>
              {mode === 'party' || mode === 'audio'
                ? 'Room name'
                : 'Live title'}
            </Txt>
            {editingTitle ? (
              <TextInput
                autoFocus
                value={title}
                onChangeText={setTitle}
                onBlur={() => setEditingTitle(false)}
                maxLength={60}
                style={styles.titleInput}
                placeholder="What’s your live about?"
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
            ) : (
              <Txt style={styles.titleText} numberOfLines={2}>
                {title || 'Add a title'}
              </Txt>
            )}
            <Pencil
              size={16}
              color="rgba(255,255,255,0.7)"
              style={styles.titlePencil}
            />
          </Pressable>
        </View>

        {/* Modes: the selected one is the start button */}
        <View
          style={[styles.modes, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          {MODES.map(m =>
            m.key === mode ? (
              <Pressable key={m.key} style={styles.go} onPress={start}>
                <current.icon
                  size={20}
                  color={colors.white}
                  fill={m.key === 'live' ? colors.white : 'transparent'}
                />
                <Txt style={styles.goText}>
                  {needsHost ? 'Become a host' : current.action}
                </Txt>
              </Pressable>
            ) : (
              <Pressable
                key={m.key}
                style={styles.mode}
                onPress={() => setMode(m.key)}
                hitSlop={6}
              >
                <Txt style={styles.modeText}>{m.label}</Txt>
              </Pressable>
            ),
          )}
        </View>
      </KeyboardAvoidingView>

      <Sheet
        visible={settings}
        onClose={() => setSettings(false)}
        title={
          mode === 'party' || mode === 'audio'
            ? 'Room settings'
            : 'Live settings'
        }
        dark
      >
        {isHost && (mode === 'live' || mode === 'premium') ? (
          <>
            <Txt style={styles.sheetLabel}>Private call price per minute</Txt>
            <Txt style={styles.sheetSub}>
              Viewers can call you 1-on-1 from your live at this price.
            </Txt>
            <RateChips
              dark
              kind="video"
              value={rate}
              maxRate={HOST_LEVEL_MAX[hostLevel]}
              onChange={setRate}
            />
          </>
        ) : null}
        {mode === 'premium' && isHost ? (
          <>
            <Txt style={[styles.sheetLabel, styles.sheetGap]}>Ticket price</Txt>
            <View style={styles.chips}>
              {TICKETS.map(t => (
                <Chip
                  key={t}
                  small
                  variant="glass"
                  label={`🎟 ${t} coins`}
                  selected={ticket === t}
                  onPress={() => setTicket(t)}
                />
              ))}
            </View>
          </>
        ) : null}
        <Txt style={[styles.sheetLabel, styles.sheetGap]}>Who can comment</Txt>
        <View style={styles.chips}>
          {['Everyone', 'Followers', 'Nobody'].map(c => (
            <Chip
              key={c}
              small
              variant="glass"
              label={c}
              selected={comments === c}
              onPress={() => setComments(c)}
            />
          ))}
        </View>
        {mode !== 'audio' && mode !== 'party' ? (
          <View style={styles.sheetGap}>
            <ListRow
              dark
              icon={UsersRound}
              iconColor={colors.white}
              title="Join requests"
              subtitle="Viewers can ask to join you on video (max 2)"
              toggle={allowGuests}
              onToggle={setAllowGuests}
              last
            />
          </View>
        ) : null}
        <Button
          title="Save"
          style={styles.sheetGap}
          onPress={() => {
            if (isHost && rate !== hostRates.video) {
              setHostRates({ ...hostRates, video: rate });
            }
            setSettings(false);
          }}
        />
      </Sheet>

      <PhotoSourceSheet
        visible={picker}
        onClose={() => setPicker(false)}
        onPicked={setCover}
      />
    </View>
  );
}

const glass = 'rgba(0,0,0,0.35)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  side: { alignItems: 'flex-end', gap: 18 },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    backgroundColor: glass,
  },
  rateText: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  audio: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioAvatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: colors.white,
  },
  audioMic: {
    marginTop: -22,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  hint: {
    alignSelf: 'center',
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.white,
    backgroundColor: glass,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  hostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  hostTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  hostSub: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  meta: { flexDirection: 'row', gap: 12, paddingHorizontal: 14 },
  cover: {
    width: 76,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#333',
  },
  coverEdit: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: {
    flex: 1,
    padding: 12,
    paddingRight: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  titleLabel: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.7)',
  },
  titleText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white,
    marginTop: 4,
  },
  titleInput: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.white,
    padding: 0,
    marginTop: 4,
  },
  titlePencil: { position: 'absolute', top: 12, right: 12 },
  modes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  mode: { paddingHorizontal: 6, paddingVertical: 10 },
  modeText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  go: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
  },
  goText: { fontFamily: fonts.bold, fontSize: 17, color: colors.white },
  sheetLabel: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  sheetSub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  sheetGap: { marginTop: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
});
