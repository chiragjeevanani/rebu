// Agora RTC tokens. The App Certificate never leaves the server; the app asks
// for a short-lived token per channel. Without credentials (local dev) we
// return `mock: true` so the app can still run its UI flows.
import pkg from 'agora-token'
import { env } from '../../config/env.js'

const { RtcTokenBuilder, RtcRole } = pkg

export const agoraConfigured = () => Boolean(env.agora.appId && env.agora.certificate)

/**
 * Agora uids are 32-bit ints. Derive a stable one from a Mongo ObjectId so the
 * same user always has the same uid (lets us map Agora events back to users).
 */
export function uidFor(userId) {
  const hex = String(userId).slice(-8)
  return (parseInt(hex, 16) % 2147483646) + 1
}

/** role: 'publisher' (camera/mic on) or 'subscriber' (watch only). */
export function rtcToken({ channel, userId, role = 'publisher', ttl = env.agora.tokenTtl }) {
  const uid = uidFor(userId)
  const expiresAt = Math.floor(Date.now() / 1000) + ttl
  if (!agoraConfigured()) {
    return { appId: null, channel, uid, token: null, role, expiresAt, mock: true }
  }
  const token = RtcTokenBuilder.buildTokenWithUid(
    env.agora.appId,
    env.agora.certificate,
    channel,
    uid,
    role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
    ttl,
    ttl,
  )
  return { appId: env.agora.appId, channel, uid, token, role, expiresAt, mock: false }
}

export const channelName = (kind, id) => `rebu_${kind}_${String(id)}`
