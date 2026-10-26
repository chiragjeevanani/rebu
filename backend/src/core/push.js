// Phone push through Firebase Cloud Messaging (HTTP v1). Needs a service
// account (FCM_SERVICE_ACCOUNT); without one, sendPush() is a quiet no-op so
// dev and tests run unchanged.
import crypto from 'node:crypto'
import fs from 'node:fs'
import { env } from '../config/env.js'

let account = null
function loadAccount() {
  if (account !== null) return account
  const raw = env.fcmServiceAccount.trim()
  try {
    account = raw ? JSON.parse(raw.startsWith('{') ? raw : fs.readFileSync(raw, 'utf8')) : false
  } catch (e) {
    console.error('[push] FCM_SERVICE_ACCOUNT is not valid JSON or a readable file:', e.message)
    account = false
  }
  return account
}

export const pushEnabled = () => !!loadAccount()

const b64url = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

// OAuth access token from a self-signed JWT, cached until shortly before expiry.
let cached = { token: null, until: 0 }
async function accessToken() {
  if (cached.token && Date.now() < cached.until) return cached.token
  const a = loadAccount()
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'RS256', typ: 'JWT' })
  const claims = b64url({
    iss: a.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
  const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${claims}`), a.private_key).toString('base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`FCM auth failed: ${j.error_description || j.error || r.status}`)
  cached = { token: j.access_token, until: Date.now() + (j.expires_in - 120) * 1000 }
  return cached.token
}

/**
 * Send one push. `data` values must be strings (FCM rule) — we stringify.
 * urgent: high priority + a call-style channel, for incoming calls.
 * Returns 'sent' | 'skipped' | 'invalid_token' | 'failed'.
 */
export async function sendPush(token, { title, body, data = {}, urgent = false }) {
  if (!token || !pushEnabled()) return 'skipped'
  const a = loadAccount()
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify({
        message: {
          token,
          notification: title ? { title, body } : undefined,
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])),
          android: {
            priority: urgent ? 'HIGH' : 'NORMAL',
            ttl: urgent ? '30s' : '86400s',
            notification: title ? { channel_id: urgent ? 'calls' : 'default' } : undefined,
          },
          apns: { headers: { 'apns-priority': urgent ? '10' : '5' } },
        },
      }),
    })
    if (r.ok) return 'sent'
    const j = await r.json().catch(() => ({}))
    const code = j.error?.details?.find(d => d.errorCode)?.errorCode || j.error?.status
    if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'invalid_token'
    console.error('[push] send failed', r.status, code || '')
    return 'failed'
  } catch (e) {
    console.error('[push] send error', e.message)
    return 'failed'
  }
}
