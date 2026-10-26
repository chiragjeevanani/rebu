// The in-app inbox (bell screen) plus phone push. notify() is the one call
// other modules make: it stores the item, tells an open app over the socket,
// and pushes to the phone when the user isn't connected.
import { Router } from 'express'
import mongoose from 'mongoose'
import { ah, paged, paging } from '../../core/http.js'
import { isOnline, toUser } from '../../core/realtime.js'
import { sendPush } from '../../core/push.js'
import { onShutdown, onStartup } from '../../hooks.js'
import { User } from '../users/user.model.js'
import { Notification as Broadcast } from '../admin/content.models.js'

const { Schema } = mongoose

export const KINDS = ['follow', 'gift', 'call', 'chat', 'payout', 'host', 'moment', 'support', 'safety', 'reward', 'system', 'promo']

const inboxSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: KINDS, default: 'system' },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    image: String,
    deeplink: String, // e.g. rebu://chat/<userId>
    data: Schema.Types.Mixed,
    broadcast: { type: Schema.Types.ObjectId, ref: 'PushNotification' },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
inboxSchema.index({ user: 1, createdAt: -1 })
inboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }) // keep 90 days

export const Inbox = mongoose.models.Inbox || mongoose.model('Inbox', inboxSchema)

const out = n => ({
  id: String(n._id),
  kind: n.kind,
  title: n.title,
  body: n.body,
  image: n.image || null,
  deeplink: n.deeplink || null,
  data: n.data || null,
  read: !!n.readAt,
  at: n.createdAt,
})

/** Clear a token FCM says is dead so we stop sending to it. */
async function dropToken(userId, token) {
  await User.updateOne({ _id: userId, 'device.pushToken': token }, { $unset: { 'device.pushToken': 1 } })
}

/**
 * Tell a user about something.
 *   inbox: false   → push/socket only (e.g. a ringing call)
 *   push: 'offline' (default) | 'always' | false
 *   urgent: incoming-call style push
 */
export async function notify(userId, { kind = 'system', title, body = '', image, deeplink, data, inbox = true, push = 'offline', urgent = false }) {
  try {
    let item = null
    if (inbox) {
      const doc = await Inbox.create({ user: userId, kind, title, body, image, deeplink, data })
      item = out(doc)
      toUser(userId, 'notification:new', { notification: item })
    }
    if (push === 'always' || (push === 'offline' && !isOnline(userId))) {
      const u = await User.findById(userId, { 'device.pushToken': 1 }).lean()
      const token = u?.device?.pushToken
      if (token) {
        const r = await sendPush(token, { title, body, urgent, data: { kind, deeplink: deeplink || '', ...(data || {}) } })
        if (r === 'invalid_token') await dropToken(userId, token)
      }
    }
    return item
  } catch (e) {
    // Notifications never break the action that triggered them.
    console.error('[notify]', e.message)
    return null
  }
}

// ---- Admin broadcasts ----------------------------------------------------------

/** Users an admin audience targets (see content.routes AUDIENCES). */
export async function audienceQuery(audience) {
  const now = Date.now()
  const DAY = 86400000
  const users = { 'host.approved': { $ne: true }, status: 'active' }
  const hosts = { 'host.approved': true, 'host.status': 'active' }
  switch (audience) {
    case 'Paying users': return { ...users, spent: { $gt: 0 } }
    case 'VIP members': return { ...users, 'vip.level': { $gt: 0 }, 'vip.until': { $gt: new Date() } }
    case 'Inactive 14+ days': return { ...users, lastActive: { $lt: new Date(now - 14 * DAY) } }
    case 'New users (7 days)': return { ...users, createdAt: { $gte: new Date(now - 7 * DAY) } }
    case 'All hosts': return hosts
    case 'Hosts offline today': return { ...hosts, 'host.online': { $ne: true } }
    case 'Followers of live hosts': {
      const live = (await User.find({ ...hosts, 'host.online': true }, { _id: 1 }).lean()).map(u => u._id)
      return live.length ? { status: 'active', following: { $in: live } } : { _id: null }
    }
    default: return users
  }
}

/** Fan a sent broadcast out to every targeted user's inbox + phone. */
export async function deliverBroadcast(b) {
  const q = await audienceQuery(b.audience)
  let delivered = 0
  let batch = []
  const flush = async () => {
    if (!batch.length) return
    await Inbox.insertMany(
      batch.map(u => ({ user: u._id, kind: 'promo', title: b.title, body: b.body, deeplink: b.deeplink || undefined, broadcast: b._id })),
      { ordered: false },
    )
    for (const u of batch) {
      toUser(u._id, 'notification:new', { notification: { kind: 'promo', title: b.title, body: b.body, deeplink: b.deeplink || null, read: false, at: new Date() } })
      const token = u.device?.pushToken
      if (!token) continue
      const r = await sendPush(token, { title: b.title, body: b.body, data: { kind: 'promo', deeplink: b.deeplink || '' } })
      if (r === 'sent') delivered++
      if (r === 'invalid_token') await dropToken(u._id, token)
    }
    batch = []
  }
  for await (const u of User.find(q, { _id: 1, 'device.pushToken': 1 }).lean().cursor()) {
    batch.push(u)
    if (batch.length >= 500) await flush()
  }
  await flush()
  await Broadcast.updateOne({ _id: b._id }, { $set: { delivered } })
  return delivered
}

// Scheduled broadcasts go out within a minute of their time.
let timer = null
async function sendDue() {
  const due = await Broadcast.find({ status: 'scheduled', scheduledAt: { $lte: new Date() } }).lean()
  for (const b of due) {
    // Claim it first so two servers never send the same broadcast twice.
    const claimed = await Broadcast.findOneAndUpdate({ _id: b._id, status: 'scheduled' }, { $set: { status: 'sent', sentAt: new Date() } }, { returnDocument: 'after' }).lean()
    if (claimed) await deliverBroadcast(claimed).catch(e => console.error('[broadcast]', e.message))
  }
}
onStartup(() => {
  timer = setInterval(() => sendDue().catch(e => console.error('[broadcast] tick', e.message)), 60000)
})
onShutdown(() => clearInterval(timer))

// ---- App routes (mounted at /api/notifications) ---------------------------------

export const notificationsRoutes = Router()

notificationsRoutes.get(
  '/',
  ah(async (req, res) => {
    const p = paging(req.query)
    const q = { user: req.user._id }
    const [items, total, unread] = await Promise.all([
      Inbox.find(q).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
      Inbox.countDocuments(q),
      Inbox.countDocuments({ ...q, readAt: null }),
    ])
    res.json({ unread, ...paged(items.map(out), total, p) })
  }),
)

/** Mark everything (or the given ids) read. */
notificationsRoutes.post(
  '/read',
  ah(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(mongoose.isValidObjectId) : null
    const q = { user: req.user._id, readAt: null, ...(ids && { _id: { $in: ids } }) }
    const r = await Inbox.updateMany(q, { $set: { readAt: new Date() } })
    res.json({ updated: r.modifiedCount })
  }),
)

notificationsRoutes.delete(
  '/:id',
  ah(async (req, res) => {
    if (mongoose.isValidObjectId(req.params.id)) await Inbox.deleteOne({ _id: req.params.id, user: req.user._id })
    res.json({ ok: true })
  }),
)
