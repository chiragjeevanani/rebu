// Admin Socket.IO connection (room `admin`). Pages subscribe through
// useAdminEvent(); the store connects after login and disconnects on logout.
import { io } from 'socket.io-client'
import { API_BASE } from './client'

let socket = null
const listeners = new Map() // event -> Set(handler)

function attach(ev) {
  if (!socket) return
  socket.off(ev)
  socket.on(ev, payload => listeners.get(ev)?.forEach(fn => fn(payload, ev)))
}

export function connectAdminSocket(token) {
  disconnectAdminSocket()
  if (!token) return
  socket = io(API_BASE || undefined, {
    auth: { token, kind: 'admin' },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10000,
  })
  socket.on('connect_error', () => {
    // Backend down or token expired — Socket.IO keeps retrying; REST 401s sign out.
  })
  for (const ev of listeners.keys()) attach(ev)
}

export function disconnectAdminSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
  }
  socket = null
}

/** Subscribe; returns an unsubscribe function. */
export function onAdminEvent(ev, fn) {
  if (!listeners.has(ev)) {
    listeners.set(ev, new Set())
    attach(ev)
  }
  listeners.get(ev).add(fn)
  return () => listeners.get(ev)?.delete(fn)
}
