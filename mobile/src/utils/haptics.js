import { NativeModules, Vibration } from 'react-native';

const { Haptics } = NativeModules;

/** Long-press feedback. */
export const hapticHeavy = () =>
  Haptics ? Haptics.impact('heavy') : Vibration.vibrate(25);

/** Selection feedback (menu item taps). */
export const hapticLight = () =>
  Haptics ? Haptics.impact('light') : Vibration.vibrate(10);
