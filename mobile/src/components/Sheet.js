import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';
import Txt from './Txt';

/** Bottom sheet built on Modal. */
export default function Sheet({
  visible,
  onClose,
  title,
  children,
  dark,
  right,
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Inside a Modal the window doesn't resize for the keyboard, so lift the sheet ourselves. */}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            dark && styles.dark,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View
            style={[
              styles.grabber,
              dark && { backgroundColor: 'rgba(255,255,255,0.25)' },
            ]}
          />
          {title ? (
            <View style={styles.titleRow}>
              <Txt variant="h2" color={dark ? colors.white : colors.ink}>
                {title}
              </Txt>
              {right}
            </View>
          ) : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
  },
  dark: { backgroundColor: '#1C1426' },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2DAE8',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
});
