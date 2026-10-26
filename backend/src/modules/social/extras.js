// Smaller social pieces: leaderboards, profile visitors, "Say hi" greetings.
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { conflict } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { CoinTxn } from '../wallet/wallet.models.js'
import { Earning } from '../earnings/earnings.models.js'
import { Message } from '../chat/chat.models.js'
import { appendMessage, emitMessage, ensureConversation, loadPeer } from '../chat/chat.service.js'
import { istDayStart } from '../hosts/hosts.service.js'

const { Schema } = mongoose

// ---- Visitors -------------------------------------------------------------------

const visitSchema = new Schema({
  profile: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  viewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  times: { type: Number, default: 1 },
  lastAt: { type: Date, default: Date.now },
})
visitSchema.index({ profile: 1, viewer: 1 }, { unique: true })
visitSchema.index({ profile: 1, lastAt: -1 })
export const Visit = mongoose.models.Visit || mongoose.model('Visit', visitSchema)

/** Count a profile view (VIP Elite browses hidden). */
export async function recordVisit(profileId, viewer) {
  if (String(profileId) === String(viewer._id)) return
  if ((viewer.vip?.level || 0) >= 4 && viewer.vip?.until > new Date()) return
  await Visit.updateOne(
    { profile: profileId, viewer: viewer._id },
    { $inc: { times: 1 }, $set: { lastAt: new Date() }, $setOnInsert: { profile: profileId, viewer: viewer._id } },
    { upsert: true },
  ).catch(() => {})
}

export const extrasRoutes = Router()

/** Who viewed my profile. Names are only shown to VIPs (the app blurs the rest). */
extrasRoutes.get(
  '/visitors',
  ah(async (req, res) => {
    const p = paging(req.query)
    const q = { profile: req.user._id }
    const [list, total] = await Promise.all([Visit.find(q).sort({ lastAt: -1 }).skip(p.skip).limit(p.limit).lean(), Visit.countDocuments(q)])
    const users = await User.find({ _id: { $in: list.map(v => v.viewer) } })
    const byId = new Map(users.map(u => [String(u._id), u.toPublic()]))
    const vip = (req.user.vip?.level || 0) > 0 && req.user.vip?.until > new Date()
    res.json({
      locked: !vip,
      ...paged(
        list.filter(v => byId.has(String(v.viewer))).map(v => ({ id: String(v._id), user: byId.get(String(v.viewer)), times: v.times, at: v.lastAt })),
        total,
        p,
      ),
    })
  }),
)

// ---- Leaderboard ----------------------------------------------------------------

const SINCE = { day: () => istDayStart(0), week: () => istDayStart(6), month: () => istDayStart(29) }

/** hosts: coins users spent on them. givers: coins users spent on hosts. */
extrasRoutes.get(
  '/leaderboard',
  ah(async (req, res) => {
    const f = parse(z.object({ type: z.enum(['hosts', 'givers']).default('hosts'), period: z.enum(['day', 'week', 'month']).default('week') }), req.query)
    const since = SINCE[f.period]()
    const rows =
      f.type === 'hosts'
        ? await Earning.aggregate([
            { $match: { createdAt: { $gte: since }, source: { $in: ['video', 'voice', 'chat', 'gift', 'ticket'] }, status: { $ne: 'reversed' } } },
            { $group: { _id: '$host', score: { $sum: '$coins' } } },
            { $sort: { score: -1 } },
            { $limit: 50 },
          ])
        : await CoinTxn.aggregate([
            { $match: { createdAt: { $gte: since }, type: { $in: ['call', 'chat', 'gift', 'ticket'] }, coins: { $lt: 0 } } },
            { $group: { _id: '$user', score: { $sum: { $abs: '$coins' } } } },
            { $sort: { score: -1 } },
            { $limit: 50 },
          ])
    const users = await User.find({ _id: { $in: rows.map(r => r._id) }, status: 'active' })
    const byId = new Map(users.map(u => [String(u._id), u.toPublic()]))
    const items = rows.filter(r => byId.has(String(r._id))).map((r, i) => ({ rank: i + 1, score: r.score, user: byId.get(String(r._id)) }))
    const mine = items.find(i => i.user.id === String(req.user._id)) || null
    res.json({ type: f.type, period: f.period, items, mine })
  }),
)

// ---- Greetings ------------------------------------------------------------------

/** A free "Say hi" opener: once per person you haven't messaged before. */
extrasRoutes.post(
  '/greet/:peerId',
  ah(async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(60).default('Hi 👋') }), req.body || {})
    const me = req.user
    const peer = await loadPeer(req.params.peerId, me)
    if (await Message.exists({ from: me._id, to: peer._id })) throw conflict('You’ve already said hi — continue in chat.', 'already_greeted')
    const conv = await ensureConversation(me._id, peer._id)
    const m = await appendMessage(conv, { from: me._id, to: peer._id, type: 'text', text, cost: 0, greeting: true })
    emitMessage(m, me)
    res.status(201).json({ greeted: true, conversationId: String(conv._id) })
  }),
)

/** Ids I've greeted or messaged (the app shows "Chat" instead of "Say hi"). */
extrasRoutes.get(
  '/greeted',
  ah(async (req, res) => {
    const ids = await Message.distinct('to', { from: req.user._id })
    res.json({ ids: ids.map(String) })
  }),
)
