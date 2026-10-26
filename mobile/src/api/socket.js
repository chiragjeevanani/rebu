// One Socket.IO connection per signed-in session (incoming calls, chat,
// live-room events, gifts). Screens subscribe with useSocketEvent(); the
// registry survives reconnects and sign-in order, so subscribers never miss
// a socket that connected after they mounted.
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from './client';

let socket = null;
const listeners = new Map(); // event -> Set<fn>

export function connectSocket(token) {
  disconnectSocket();
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: { token, kind: 'user' },
    reconnection: true,
    reconnectionDelay: 1000,
  });
  socket.onAny((event, payload) => {
    listeners.get(event)?.forEach(fn => fn(payload));
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export const getSocket = () => socket;

export function onSocket(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

/** Subscribe to a socket event for the lifetime of the component. */
export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onSocket(event, payload => ref.current?.(payload)), [event]);
}
