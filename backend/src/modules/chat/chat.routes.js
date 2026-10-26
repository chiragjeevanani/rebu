import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { badRequest, forbidden, notFound } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { Conversation, Message, conversationKey } from './chat.models.js'
import { appendMessage, checkContent, emitMessage, ensureConversation, loadPeer, markRead, shapeMessage } from './chat.service.js'
import { chargeUserPayHost, withTxn } from '../wallet/economy.service.js'
import { getConfig } from '../config/config.service.js'

export const chatRoutes = Router()

const same = (a, b) => String(a) === String(b)
const sideOf = (conv, userId) => conv.state.find(s => same(s.user, userId))

function shapeConversation(conv, me, peer) {
  const mine = sideOf(conv, me) || {}
  const last = conv.lastMessage?.id && !(mine.clearedAt && conv.lastMessage.at <= mine.clearedAt) ? conv.lastMessage : null
  return {
    id: String(conv._id),
    peer: peer?.toPublic() || null,
    lastMessage: last ? { id: String(last.id), from: String(last.from), type: last.type, text: last.text, at: last.at, mine: same(last.from, me) } : null,
    unread: mine.unread || 0,
    pinned: !!mine.pinned,
    muted: !!mine.muted,
    lastAt: conv.lastAt,
  }
}

async function myConversation(id, me) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Conversation')
  const conv = await Conversation.findOne({ _id: id, 'state.user': me })
  if (!conv) throw notFound('Conversation')
  return conv
}

/** My chats, latest first (the app floats pinned ones to the top). */
chatRoutes.get(
  '/',
  ah(async (req, res) => {
    const me = req.user._id
    const pg = paging(req.query)
    const filter = { state: { $elemMatch: { user: me, hidden: false } }, 'lastMessage.id': { $ne: null } }
    const [rows, total] = await Promise.all([
      Conversation.find(filter).sort({ lastAt: -1 }).skip(pg.skip).limit(pg.limit),
      Conversation.countDocuments(filter),
    ])
    const peerIds = rows.map(c => c.members.find(m => !same(m, me)))
    const peers = new Map((await User.find({ _id: { $in: peerIds } })).map(u => [String(u._id), u]))
    const items = rows.map((c, i) => shapeConversation(c, me, peers.get(String(peerIds[i]))))
    res.json(paged(items, total, pg))
  }),
)

/** Long-press menu: pin/unpin, mark read/unread, mute. */
chatRoutes.patch(
  '/:conversationId',
  ah(async (req, res) => {
    const body = parse(z.object({ pinned: z.boolean().optional(), unread: z.boolean().optional(), muted: z.boolean().optional() }), req.body)
    const me = req.user._id
    const conv = await myConversation(req.params.conversationId, me)
    const peerId = conv.members.find(m => !same(m, me))
    const set = {}
    if (body.pinned !== undefined) set['state.$[me].pinned'] = body.pinned
    if (body.muted !== undefined) set['state.$[me].muted'] = body.muted
    if (body.unread === true) set['state.$[me].unread'] = Math.max(1, sideOf(conv, me).unread || 0)
    if (Object.keys(set).length) {
      await Conversation.updateOne({ _id: conv._id }, { $set: set }, { arrayFilters: [{ 'me.user': me }] })
    }
    if (body.unread === false) await markRead(conv, me, peerId)
    const [fresh, peer] = await Promise.all([Conversation.findById(conv._id), User.findById(peerId)])
    res.json({ conversation: shapeConversation(fresh, me, peer) })
  }),
)

/** Delete chat for me: hides it and clears my copy of the history. */
chatRoutes.delete(
  '/:conversationId',
  ah(async (req, res) => {
    const me = req.user._id
    const conv = await myConversation(req.params.conversationId, me)
    await Conversation.updateOne(
      { _id: conv._id },
      { $set: { 'state.$[me].hidden': true, 'state.$[me].clearedAt': new Date(), 'state.$[me].unread': 0, 'state.$[me].pinned': false } },
      { arrayFilters: [{ 'me.user': me }] },
    )
    res.json({ ok: true })
  }),
)

/** Messages with a person, newest last. Page back with ?before=<messageId>. Marks them read. */
chatRoutes.get(
  '/:peerId/messages',
  ah(async (req, res) => {
    const q = parse(z.object({ before: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).loose(), req.query)
    const me = req.user._id
    if (!mongoose.isValidObjectId(req.params.peerId) || same(req.params.peerId, me)) throw notFound('User')
    const peer = await User.findById(req.params.peerId)
    if (!peer) throw notFound('User')
    const conv = await Conversation.findOne({ key: conversationKey(me, peer._id) })
    if (!conv) return res.json({ conversationId: null, peer: peer.toPublic(), items: [], hasMore: false })

    const mine = sideOf(conv, me)
    const filter = { conversation: conv._id }
    if (mine?.clearedAt) filter.createdAt = { $gt: mine.clearedAt }
    if (q.before) {
      if (!mongoose.isValidObjectId(q.before)) throw badRequest('Invalid before')
      filter._id = { $lt: q.before }
    }
    const limit = q.limit || 30
    const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1)
    const hasMore = rows.length > limit
    await markRead(conv, me, peer._id)
    res.json({
      conversationId: String(conv._id),
      peer: peer.toPublic(),
      items: rows.slice(0, limit).reverse().map(shapeMessage),
      hasMore,
    })
  }),
)

const sendSchema = z
  .object({
    type: z.enum(['text', 'image']).default('text'),
    text: z.string().trim().max(1000).optional(),
    imageUrl: z.url().optional(),
  })
  .refine(b => (b.type === 'text' ? !!b.text : !!b.imageUrl), { message: 'Message is empty' })

/** Send a message. Users pay `messageCost` per message to a host; hosts reply free. */
chatRoutes.post(
  '/:peerId/messages',
  ah(async (req, res) => {
    const body = parse(sendSchema, req.body)
    const me = req.user
    const cfg = getConfig()
    if (cfg.settings.features?.chat === false) throw forbidden('Chat is turned off right now.')
    const peer = await loadPeer(req.params.peerId, me)
    checkContent(body.text) // before any charge

    const paid = !me.host?.approved && peer.host?.approved && peer.host.status === 'active'
    const cost = paid ? cfg.economy.messageCost || 0 : 0
    const conv = await ensureConversation(me._id, peer._id)
    const _id = new mongoose.Types.ObjectId()

    const out = await withTxn(async s => {
      let balance = null
      if (cost > 0) {
        ;({ balance } = await chargeUserPayHost(
          {
            userId: me._id,
            hostId: peer._id,
            coins: cost,
            source: 'chat',
            txnType: 'chat',
            title: `Message · ${peer.host?.displayName || peer.name}`,
            ref: { kind: 'Message', id: _id },
            detail: 'Chat message',
            fromName: me.name,
          },
          s,
        ))
      }
      const m = await appendMessage(
        conv,
        { _id, from: me._id, to: peer._id, type: body.type, text: body.text || '', imageUrl: body.imageUrl, cost },
        s,
      )
      return { m, balance }
    })

    emitMessage(out.m, me)
    res.status(201).json({ message: shapeMessage(out.m), balance: out.balance ?? me.coins, cost })
  }),
)

chatRoutes.post(
  '/:peerId/read',
  ah(async (req, res) => {
    const me = req.user._id
    if (!mongoose.isValidObjectId(req.params.peerId)) throw notFound('User')
    const conv = await Conversation.findOne({ key: conversationKey(me, req.params.peerId) })
    if (!conv) return res.json({ ok: true, read: 0 })
    const read = await markRead(conv, me, req.params.peerId)
    res.json({ ok: true, read })
  }),
)
