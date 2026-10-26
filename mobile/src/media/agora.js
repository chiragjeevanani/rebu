// Agora RTC for calls and lives. One engine for the app; useAgoraChannel()
// joins a channel with a server-issued token and reports remote users.
import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import {
  ChannelProfileType,
  ClientRoleType,
  createAgoraRtcEngine,
} from 'react-native-agora';

let engine = null;
let engineAppId = null;

function getEngine(appId) {
  if (engine && engineAppId === appId) return engine;
  if (engine) engine.release();
  engine = createAgoraRtcEngine();
  engine.initialize({
    appId,
    channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
  });
  engineAppId = appId;
  return engine;
}

export async function ensureAvPermissions(video = true) {
  if (Platform.OS !== 'android') return true;
  const wanted = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (video) wanted.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const res = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every(p => res[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/**
 * agora: { appId, token, channel, uid, role: 'publisher'|'subscriber', mock }
 * Returns { joined, remoteUids, error, setMuted, setCameraOn, switchCamera,
 *           setSpeaker, renew(token), setRole(role) }.
 * With a mock token (server has no Agora keys) nothing connects; UI still works.
 */
export function useAgoraChannel(agora, { video = true, enabled = true } = {}) {
  const [joined, setJoined] = useState(false);
  const [remoteUids, setRemoteUids] = useState([]);
  const [error, setError] = useState(null);
  const eng = useRef(null);

  const key =
    agora && !agora.mock && enabled ? `${agora.channel}:${agora.uid}` : null;

  // Guest accepted / removed: same channel, switch role and (un)publish
  // without leaving, and adopt the new token.
  const role = agora?.role;
  const roleRef = useRef(role);
  useEffect(() => {
    const e = eng.current;
    if (!key || !e || roleRef.current === role) return;
    roleRef.current = role;
    const pub = role === 'publisher';
    if (pub && video) {
      e.enableVideo();
      e.startPreview();
    }
    e.updateChannelMediaOptions({
      token: agora.token,
      clientRoleType: pub
        ? ClientRoleType.ClientRoleBroadcaster
        : ClientRoleType.ClientRoleAudience,
      publishMicrophoneTrack: pub,
      publishCameraTrack: pub && video,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const handler = {
      onJoinChannelSuccess: () => !cancelled && setJoined(true),
      onUserJoined: (_c, uid) =>
        !cancelled && setRemoteUids(l => (l.includes(uid) ? l : [...l, uid])),
      onUserOffline: (_c, uid) =>
        !cancelled && setRemoteUids(l => l.filter(x => x !== uid)),
      onError: (code, msg) =>
        !cancelled && code !== 0 && setError(`${code} ${msg || ''}`),
    };
    (async () => {
      const ok = await ensureAvPermissions(video);
      if (cancelled) return;
      if (!ok) {
        setError('Camera/microphone permission denied');
        return;
      }
      const e = getEngine(agora.appId);
      eng.current = e;
      e.registerEventHandler(handler);
      if (video) {
        e.enableVideo();
        e.startPreview();
      } else {
        e.disableVideo();
      }
      e.setEnableSpeakerphone(true);
      const publisher = agora.role !== 'subscriber';
      e.joinChannel(agora.token, agora.channel, agora.uid, {
        clientRoleType: publisher
          ? ClientRoleType.ClientRoleBroadcaster
          : ClientRoleType.ClientRoleAudience,
        publishMicrophoneTrack: publisher,
        publishCameraTrack: publisher && video,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
    })();
    return () => {
      cancelled = true;
      const e = eng.current;
      if (e) {
        e.unregisterEventHandler(handler);
        e.leaveChannel();
        e.stopPreview();
      }
      setJoined(false);
      setRemoteUids([]);
    };
    // Re-join only when the channel/uid changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    joined,
    remoteUids,
    error,
    live: !!key,
    setMuted: m => eng.current?.muteLocalAudioStream(m),
    setCameraOn: on => {
      eng.current?.enableLocalVideo(on);
      eng.current?.muteLocalVideoStream(!on);
    },
    switchCamera: () => eng.current?.switchCamera(),
    setSpeaker: on => eng.current?.setEnableSpeakerphone(on),
    renew: token => eng.current?.renewToken(token),
    setRole: role => {
      const pub = role === 'publisher';
      eng.current?.setClientRole(
        pub
          ? ClientRoleType.ClientRoleBroadcaster
          : ClientRoleType.ClientRoleAudience,
      );
      eng.current?.updateChannelMediaOptions({
        publishMicrophoneTrack: pub,
        publishCameraTrack: pub && video,
      });
    },
  };
}
