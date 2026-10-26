// Socket.IO for everything live that isn't audio/video: incoming calls,
// chat messages, live-room chat, join requests, gifts, seat changes.
//
// Rooms:  user:<userId>   — every socket of a signed-in user
//         live:<liveId>   — everyone in a live / party / audio room
//         admin           — admin panel sockets (dashboard counters)
import { Server } from 'socket.io'
import { env } from '../config/env.js'
import { verifyToken } from './auth.js'

let io = null
const online = new Map() // userId -> socket count

export function initRealtime(httpServer, { onConnect, onDisconnect } = {}) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins.length ? env.corsOrigins : true },
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      const kind = socket.handshake.auth?.kind === 'admin' ? 'admin' : 'user'
      const p = verifyToken(token, kind)
      socket.data.userId = p.sub
      socket.data.kind = kind
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', socket => {
    const { userId, kind } = socket.data
    if (kind === 'admin') {
      socket.join('admin')
      return
    }
    socket.join(`user:${userId}`)
    online.set(userId, (online.get(userId) || 0) + 1)
    onConnect?.(socket)
    socket.on('disconnect', () => {
      const n = (online.get(userId) || 1) - 1
      if (n <= 0) online.delete(userId)
      else online.set(userId, n)
      onDisconnect?.(socket, n <= 0)
    })
  })
  return io
}

export const getIo = () => io
export const isOnline = userId => online.has(String(userId))

/** Emit to every device of a user. */
export const toUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload)
/** Emit to everyone in a live / room. */
export const toLive = (liveId, event, payload) => io?.to(`live:${liveId}`).emit(event, payload)
export const toAdmins = (event, payload) => io?.to('admin').emit(event, payload)
