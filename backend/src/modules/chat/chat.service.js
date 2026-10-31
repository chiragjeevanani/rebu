// Shared chat plumbing (also used by gifts sent in a chat).
import mongoose from 'mongoose'
import { User } from '../users/user.model.js'
import { Conversation, Message, conversationKey } from './chat.models.js'
import { getConfig } from '../config/config.service.js'
import { toUser } from '../../core/realtime.js'
import { ApiError, forbidden, notFound } from '../../core/errors.js'
import { notify } from '../notifications/notifications.js'

const same = (a, b) => String(a) === String(b)

/** Find-or-create the conversation for a pair (outside any transaction). */
export async function ensureConversation(a, b) {
  const key = conversationKey(a, b)
  const side = user => ({ user, unread: 0, pinned: false, muted: false, hidden: false, clearedAt: null, lastReadAt: null })
  try {
    return await Conversation.findOneAndUpdate(
      { key },
      { $setOnInsert: { key, members: [a, b], state: [side(a), side(b)], lastAt: new Date() } },
      { upsert: true, returnDocument: 'after' },
    )
  } catch (e) {
    if (e.code === 11000) return Conversation.findOne({ key }) // lost the upsert race
    throw e
  }
}

const preview = m => (m.type === 'image' ? '📷 Photo' : m.type === 'gift' ? `🎁 ${m.gift?.name || 'Gift'}${m.gift?.count > 1 ? ` ×${m.gift.count}` : ''}` : m.text)

/** Writes a message and bumps the conversation (unhides it for both, +1 unread for the receiver). */
export async function appendMessage(conv, doc, session) {
  const [m] = await Message.create([{ ...doc, conversation: conv._id }], { session })
  await Conversation.updateOne(
    { _id: conv._id },
    {
      $set: {
        lastMessage: { id: m._id, from: m.from, type: m.type, text: preview(m), at: m.createdAt },
        lastAt: m.createdAt,
        'state.$[a].hidden': false,
        'state.$[b].hidden': false,
      },
      $inc: { 'state.$[b].unread': 1 },
    },
    { arrayFilters: [{ 'a.user': m.from }, { 'b.user': m.to }], session },
  )
  return m
}

export const shapeMessage = m => ({
  id: String(m._id),
  conversationId: String(m.conversation),
  from: String(m.from),
  to: String(m.to),
  type: m.type,
  text: m.text || '',
  imageUrl: m.imageUrl || null,
  gift: m.gift?.key ? m.gift : null,
  cost: m.cost || 0,
  readAt: m.readAt || null,
  createdAt: m.createdAt,
})

/** chat:message to the receiver and to the sender's other devices. */
export function emitMessage(m, sender) {
  const payload = { conversationId: String(m.conversation), message: shapeMessage(m), from: sender.toPublic() }
  toUser(m.to, 'chat:message', payload)
  toUser(m.from, 'chat:message', payload)
  // Phone push when the receiver's app isn't open (no inbox row: the chat list is the inbox).
  notify(m.to, { kind: 'chat', title: payload.from.name || 'New message', body: preview(m), deeplink: `rebu://chat/${m.from}`, inbox: false, data: { peerId: String(m.from) } })
}

/** Loads the other party; 404s for missing/self/banned, 403s on blocks either way. */
export async function loadPeer(peerId, me) {
  if (!mongoose.isValidObjectId(peerId) || same(peerId, me._id)) throw notFound('User')
  const peer = await User.findById(peerId)
  if (!peer || peer.status === 'banned') throw notFound('User')
  if (peer.blocked?.some(id => same(id, me._id))) throw forbidden('You can’t message this person.')
  if (me.blocked?.some(id => same(id, peer._id))) throw forbidden('You blocked this person. Unblock them to send messages.')
  return peer
}

/** Marks the peer's messages to me as read, zeroes my unread, tells the peer. */
export async function markRead(conv, meId, peerId) {
  const at = new Date()
  const r = await Message.updateMany({ conversation: conv._id, from: peerId, to: meId, readAt: null }, { $set: { readAt: at } })
  await Conversation.updateOne(
    { _id: conv._id },
    { $set: { 'state.$[me].unread': 0, 'state.$[me].lastReadAt': at } },
    { arrayFilters: [{ 'me.user': meId }] },
  )
  if (r.modifiedCount) toUser(peerId, 'chat:read', { conversationId: String(conv._id), by: String(meId), at })
  return r.modifiedCount
}

// ---- moderation ----
const PHONE = /\d(?:[\s-]?\d){6,}/ // 7+ digits, allowing single spaces/dashes between
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i

/** Throws a friendly 400 if text shares contact details (when the admin switch is on). */
export function checkContent(text) {
  if (!text) return
  const { moderation } = getConfig().settings
  if (!moderation?.blockContactSharing) return
  const lower = text.toLowerCase()
  const hit =
    PHONE.test(text) ? 'phone' : EMAIL.test(text) ? 'email' : (moderation.autoFlagKeywords || []).find(k => k && lower.includes(k.toLowerCase())) ? 'keyword' : null
  if (hit) {
    throw new ApiError(
      400,
      'content_blocked',
      'For your safety, sharing phone numbers, emails or other apps isn’t allowed in chat. Keep the conversation on REBU.',
      { reason: hit },
    )
  }
}

