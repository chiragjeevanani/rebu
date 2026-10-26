import React, { useEffect } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  Camera,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import { CameraOff } from 'lucide-react-native';
import { colors, fonts } from '../theme';
import Txt from './Txt';

/**
 * Full-screen camera preview for going live. Asks for camera + mic access,
 * pauses while the screen is in the background, and falls back to the
 * cover photo when the camera is off (audio rooms, no permission).
 */
export default function LiveCamera({ position = 'front', off, cover, style }) {
  const focused = useIsFocused();
  const cam = useCameraPermission();
  const mic = useMicrophonePermission();

  useEffect(() => {
    (async () => {
      if (!cam.hasPermission && cam.canRequestPermission) {
        await cam.requestPermission();
      }
      if (!mic.hasPermission && mic.canRequestPermission) {
        await mic.requestPermission();
      }
    })();
    // Ask once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showCamera = !off && cam.hasPermission;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, style]}>
      {showCamera ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={position}
          isActive={focused}
          resizeMode="cover"
        />
      ) : (
        <>
          {cover ? (
            <Image
              source={{ uri: cover }}
              style={StyleSheet.absoluteFill}
              blurRadius={off ? 18 : 30}
            />
          ) : null}
          <View style={styles.dim} />
          {!off ? (
            <View style={styles.center}>
              <CameraOff size={34} color={colors.white} />
              <Txt style={styles.title}>Camera is off</Txt>
              <Txt style={styles.sub}>
                Allow camera and microphone to go live.
              </Txt>
              <Pressable
                style={styles.btn}
                onPress={() =>
                  cam.canRequestPermission
                    ? cam.requestPermission()
                    : Linking.openSettings()
                }
              >
                <Txt style={styles.btnText}>
                  {cam.canRequestPermission ? 'Allow access' : 'Open settings'}
                </Txt>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#111' },
  dim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  title: { fontFamily: fonts.bold, fontSize: 18, color: colors.white },
  sub: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  btn: {
    marginTop: 10,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  btnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
});
