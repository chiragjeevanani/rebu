// The app draws one header above the stack screens and one top bar above the
// main tabs, so they stay put while pages slide underneath. Screens still
// write <Header …/> / <TopBar …/> as before: inside such a frame those
// components hand their buttons to the shared bar through this store instead
// of drawing themselves.
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react';

/** { kind: 'stack' | 'tabs', routeKey, headerShown } for the current screen. */
export const FrameContext = createContext(null);
export const useFrame = () => useContext(FrameContext);

const slots = new Map(); // routeKey → { right, onBack }
const listeners = new Set();
const notify = () => listeners.forEach(l => l());
const subscribe = l => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The latest buttons a screen registered (undefined until it mounts). */
export const useSlot = routeKey =>
  useSyncExternalStore(subscribe, () => slots.get(routeKey));

/** Called by a screen on every render: its header buttons follow its state. */
export function useRegisterSlot(routeKey, value) {
  useLayoutEffect(() => {
    slots.set(routeKey, value);
    notify();
  });
  useEffect(
    () => () => {
      slots.delete(routeKey);
      notify();
    },
    [routeKey],
  );
}
