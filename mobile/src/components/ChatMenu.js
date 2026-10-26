import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ListPlus,
  MailWarning,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react-native';
import { colors, fonts } from '../theme';
import Txt from './Txt';
import { hapticLight } from '../utils/haptics';
import { Portal } from './Portal';

const ITEM_H = 54;
const WIDTH = 240;

function Item({ icon: Icon, label, danger, trailing, onPress }) {
  const tint = danger ? colors.danger : colors.ink;
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      {Icon ? <Icon size={22} color={tint} strokeWidth={1.8} /> : null}
      <Txt style={[styles.label, { color: tint }]} numberOfLines={1}>
        {label}
      </Txt>
      {trailing}
    </Pressable>
  );
}

/**
 * Long-press menu for a chat row, anchored under the pressed row
 * (or above it when there isn't room below).
 *
 * anchor: { y, height } of the row in window coordinates.
 * lists:  [{ name, has }] — lists the chat can be added to.
 */
export default function ChatMenu({
  chat,
  anchor,
  lists,
  onClose,
  onToggleList,
  onToggleRead,
  onTogglePin,
  onDelete,
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [sub, setSub] = useState(false);

  useEffect(() => setSub(false), [chat]);

  // Hardware back closes the menu instead of leaving the screen.
  useEffect(() => {
    if (!chat) return;
    const sub$ = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub$.remove();
  }, [chat, onClose]);

  if (!chat || !anchor) return null;

  const rows = sub ? lists.length + 1 : 4;
  const menuH = rows * ITEM_H + 12;
  const below = anchor.y + anchor.height - 10;
  const top =
    below + menuH < screenH - 90 ? below : Math.max(40, anchor.y - menuH + 10);

  const act = fn => () => {
    fn(chat);
    onClose();
  };

  return (
    // Drawn in the app's own window (not a Modal), so the finger still
    // down from the long-press can't dismiss it the moment it opens.
    <Portal>
      {/* Any new touch outside — tap, swipe or drag — closes it on touch-down.
          Sized explicitly: absolute-fill collapses to 0 at the app root. */}
      <View
        style={[styles.backdrop, { width: screenW, height: screenH + 200 }]}
        onStartShouldSetResponder={() => true}
        onResponderGrant={onClose}
      />
      <View style={[styles.menu, { top }]}>
        {sub ? (
          <>
            <Item
              icon={ChevronLeft}
              label="Add to List"
              onPress={() => setSub(false)}
            />
            {lists.map(l => (
              <Item
                key={l.name}
                label={l.name}
                onPress={act(() => onToggleList(chat, l.name))}
                trailing={
                  l.has ? (
                    <Check size={20} color={colors.primary} strokeWidth={2.4} />
                  ) : null
                }
              />
            ))}
          </>
        ) : (
          <>
            <Item
              icon={ListPlus}
              label="Add to List"
              onPress={() => setSub(true)}
              trailing={<ChevronRight size={18} color={colors.textMuted} />}
            />
            <Item
              icon={chat.unread ? CheckCheck : MailWarning}
              label={chat.unread ? 'Mark as Read' : 'Mark as Unread'}
              onPress={act(onToggleRead)}
            />
            <Item
              icon={chat.pinned ? PinOff : Pin}
              label={chat.pinned ? 'Unpin' : 'Pin'}
              onPress={act(onTogglePin)}
            />
            <Item icon={Trash2} label="Delete" danger onPress={act(onDelete)} />
          </>
        )}
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  menu: {
    position: 'absolute',
    left: 8,
    width: WIDTH,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  item: {
    height: ITEM_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
  },
  itemPressed: { backgroundColor: colors.surfaceMuted },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: 16.5 },
});
