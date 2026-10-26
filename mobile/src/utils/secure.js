import { useCallback } from 'react';
import { NativeModules } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

const { SecureScreen } = NativeModules;

/**
 * Blocks screenshots and screen recording while the calling screen is focused
 * (Android FLAG_SECURE). Use on every screen showing private content.
 */
export function useSecureScreen() {
  useFocusEffect(
    useCallback(() => {
      SecureScreen?.enable();
      return () => SecureScreen?.disable();
    }, []),
  );
}
