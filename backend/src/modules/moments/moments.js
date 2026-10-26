// Moments: short photo posts (mostly hosts showing their day). Feed, likes,
// comments, delete; admins can remove posts and comments.
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { badRequest, forbidden, notFound } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { getConfig } from '../config/config.service.js'
import { checkContent } from '../chat/chat.service.js'
import { notify } from '../notifications/notifications.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'

const { Schema } = mongoose

export const TOPICS = ['new', 'song', 'beauty', 'selfie', 'love', 'travel']

const momentSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, default: '' },
    topic: { type: String, enum: TOPICS, default: 'new' },
    media: [{ _id: false, type: { type: String, enum: ['photo'], default: 'photo' }, url: String }],
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'removed'], default: 'active', index: true },
    removedReason: String,
    reports: { type: Number, default: 0 }, // open user reports → flagged in the admin panel
  },
  { timestamps: true },
)
momentSchema.index({ status: 1, createdAt: -1 })
momentSchema.index({ status: 1, topic: 1, createdAt: -1 })

const likeSchema = new Schema(
  { moment: { type: Schema.Types.ObjectId, required: true }, user: { type: Schema.Types.ObjectId, required: true } },
  { timestamps: { createdAt: true, updatedAt: false } },
)
likeSchema.index({ moment: 1, user: 1 }, { unique: true })
likeSchema.index({ user: 1, moment: 1 })

const commentSchema = new Schema(
  {
    moment: { type: Schema.Types.ObjectId, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

export const Moment = mongoose.models.Moment || mongoose.model('Moment', momentSchema)
export const MomentLike = mongoose.models.MomentLike || mongoose.model('MomentLike', likeSchema)
export const MomentComment = mongoose.models.MomentComment || mongoose.model('MomentComment', commentSchema)

const oid = z.string().refine(mongoose.isValidObjectId, 'Invalid id')

async function authors(ids) {
  const us = await User.find({ _id: { $in: [...new Set(ids.map(String))] } })
  return new Map(us.map(u => [String(u._id), u.toPublic()]))
}

async function shape(list, me) {
  const [byId, liked] = await Promise.all([
    authors(list.map(m => m.author)),
    MomentLike.find({ user: me, moment: { $in: list.map(m => m._id) } }, { moment: 1 }).lean(),
  ])
  const likedSet = new Set(liked.map(l => String(l.moment)))
  return list.map(m => ({
    id: String(m._id),
    author: byId.get(String(m.author)) || null,
    text: m.text,
    topic: m.topic,
    media: m.media,
    likes: m.likes,
    comments: m.comments,
    liked: likedSet.has(String(m._id)),
    mine: String(m.author) === String(me),
    at: m.createdAt,
  }))
}

const commentOut = (c, byId) => ({ id: String(c._id), user: byId.get(String(c.user)) || null, text: c.text, at: c.createdAt })

function featureOn() {
  if (getConfig().settings.features?.moments === false) throw forbidden('Moments are turned off right now.')
}

export const momentsRoutes = Router()

/** Feed. tab: all | following | mine | user (with userId). */
momentsRoutes.get(
  '/',
  ah(async (req, res) => {
    const f = parse(
      z.object({ tab: z.enum(['all', 'following', 'mine', 'user']).default('all'), topic: z.enum(TOPICS).optional(), userId: oid.optional() }),
      req.query,
    )
    const p = paging(req.query)
    const q = { status: 'active', author: { $nin: req.user.blocked || [] } }
    if (f.topic && f.topic !== 'new') q.topic = f.topic
    if (f.tab === 'following') q.author = { $in: req.user.following || [], $nin: req.user.blocked || [] }
    if (f.tab === 'mine') q.author = req.user._id
    if (f.tab === 'user') {
      if (!f.userId) throw badRequest('userId is required')
      q.author = f.userId
    }
    const [list, total] = await Promise.all([
      Moment.find(q).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
      Moment.countDocuments(q),
    ])
    res.json(paged(await shape(list, req.user._id), total, p))
  }),
)

momentsRoutes.post(
  '/',
  ah(async (req, res) => {
    featureOn()
    const b = parse(
      z.object({
        text: z.string().trim().max(500).default(''),
        topic: z.enum(TOPICS).default('new'),
        photos: z.array(z.string().url().max(500)).max(9).default([]),
      }),
      req.body,
    )
    if (!b.text && !b.photos.length) throw badRequest('Add a photo or write something.')
    checkContent(b.text)
    const m = await Moment.create({ author: req.user._id, text: b.text, topic: b.topic, media: b.photos.map(url => ({ type: 'photo', url })) })
    const [out] = await shape([m.toObject()], req.user._id)
    res.status(201).json({ moment: out })
  }),
)

async function liveMoment(id) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Moment')
  const m = await Moment.findOne({ _id: id, status: 'active' })
  if (!m) throw notFound('Moment')
  return m
}

momentsRoutes.delete(
  '/:id',
  ah(async (req, res) => {
    const m = await liveMoment(req.params.id)
    if (String(m.author) !== String(req.user._id)) throw forbidden('You can only delete your own moments.')
    m.status = 'removed'
    m.removedReason = 'Deleted by author'
    await m.save()
    res.json({ ok: true })
  }),
)

momentsRoutes.post(
  '/:id/like',
  ah(async (req, res) => {
    const m = await liveMoment(req.params.id)
    const r = await MomentLike.updateOne({ moment: m._id, user: req.user._id }, { $setOnInsert: { moment: m._id, user: req.user._id } }, { upsert: true })
    let likes = m.likes
    if (r.upsertedCount) {
      likes = (await Moment.findByIdAndUpdate(m._id, { $inc: { likes: 1 } }, { returnDocument: 'after', projection: { likes: 1 } })).likes
      if (String(m.author) !== String(req.user._id)) {
        notify(m.author, { kind: 'moment', title: `${req.user.name || 'Someone'} liked your moment`, image: req.user.toPublic().photo, body: m.text.slice(0, 80), deeplink: `rebu://moment/${m._id}` })
      }
    }
    res.json({ liked: true, likes })
  }),
)

momentsRoutes.delete(
  '/:id/like',
  ah(async (req, res) => {
    const m = await liveMoment(req.params.id)
    const r = await MomentLike.deleteOne({ moment: m._id, user: req.user._id })
    let likes = m.likes
    if (r.deletedCount) likes = (await Moment.findOneAndUpdate({ _id: m._id, likes: { $gt: 0 } }, { $inc: { likes: -1 } }, { returnDocument: 'after', projection: { likes: 1 } }))?.likes ?? 0
    res.json({ liked: false, likes })
  }),
)

momentsRoutes.get(
  '/:id/comments',
  ah(async (req, res) => {
    const m = await liveMoment(req.params.id)
    const p = paging(req.query)
    const q = { moment: m._id, status: 'active' }
    const [list, total] = await Promise.all([
      MomentComment.find(q).sort({ createdAt: 1 }).skip(p.skip).limit(p.limit).lean(),
      MomentComment.countDocuments(q),
    ])
    const byId = await authors(list.map(c => c.user))
    res.json(paged(list.map(c => commentOut(c, byId)), total, p))
  }),
)

momentsRoutes.post(
  '/:id/comments',
  ah(async (req, res) => {
    const m = await liveMoment(req.params.id)
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(300) }), req.body)
    checkContent(text)
    const c = await MomentComment.create({ moment: m._id, user: req.user._id, text })
    const { comments } = await Moment.findByIdAndUpdate(m._id, { $inc: { comments: 1 } }, { returnDocument: 'after', projection: { comments: 1 } })
    if (String(m.author) !== String(req.user._id)) {
      notify(m.author, { kind: 'moment', title: `${req.user.name || 'Someone'} commented on your moment`, image: req.user.toPublic().photo, body: text.slice(0, 80), deeplink: `rebu://moment/${m._id}` })
    }
    res.status(201).json({ comment: commentOut(c, new Map([[String(req.user._id), req.user.toPublic()]])), comments })
  }),
)

momentsRoutes.delete(
  '/:id/comments/:commentId',
  ah(async (req, res) => {
    const m = await liveMoment(req.params.id)
    if (!mongoose.isValidObjectId(req.params.commentId)) throw notFound('Comment')
    const c = await MomentComment.findOne({ _id: req.params.commentId, moment: m._id, status: 'active' })
    if (!c) throw notFound('Comment')
    // Your own comment, or any comment on your moment.
    if (String(c.user) !== String(req.user._id) && String(m.author) !== String(req.user._id)) throw forbidden()
    c.status = 'removed'
    await c.save()
    await Moment.updateOne({ _id: m._id, comments: { $gt: 0 } }, { $inc: { comments: -1 } })
    res.json({ ok: true })
  }),
)

// ---- Admin (mounted at /api/admin/moments) --------------------------------------
// The panel's statuses: published | flagged (reported, still visible) | removed.

export const momentsAdmin = Router()
momentsAdmin.use(requireAdmin(Admin, 'moments'))

const adminStatus = m => (m.status === 'removed' ? 'removed' : m.reports > 0 ? 'flagged' : 'published')

async function adminShape(list) {
  const us = await User.find({ _id: { $in: list.map(m => m.author) } }, { name: 1, photos: 1, host: 1 }).lean()
  const byId = new Map(us.map(u => [String(u._id), u]))
  return list.map(m => {
    const u = byId.get(String(m.author))
    const isHost = !!u?.host?.approved
    return {
      id: String(m._id),
      authorId: String(m.author),
      authorName: (isHost && u.host.displayName) || u?.name || 'Deleted user',
      authorAvatar: (isHost && u.host.photos?.[0]) || u?.photos?.[0] || null,
      isHost,
      image: m.media?.[0]?.url || null,
      text: m.text,
      likes: m.likes,
      comments: m.comments,
      reports: m.reports || 0,
      ts: new Date(m.createdAt).getTime(),
      status: adminStatus(m),
      removedReason: m.removedReason || '',
    }
  })
}

momentsAdmin.get(
  '/',
  ah(async (req, res) => {
    const f = parse(
      z.object({ status: z.enum(['all', 'flagged', 'published', 'removed']).default('all'), author: z.enum(['user', 'host']).optional(), q: z.string().trim().max(60).optional() }).loose(),
      req.query,
    )
    const p = paging(req.query)
    const base = {}
    if (f.q) base.text = { $regex: f.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    if (f.author) {
      const hostIds = await User.find({ 'host.approved': true }, { _id: 1 }).lean()
      base.author = f.author === 'host' ? { $in: hostIds.map(h => h._id) } : { $nin: hostIds.map(h => h._id) }
    }
    const byStatus = {
      flagged: { status: 'active', reports: { $gt: 0 } },
      published: { status: 'active', reports: { $in: [0, null] } },
      removed: { status: 'removed' },
    }
    const q = f.status === 'all' ? base : { ...base, ...byStatus[f.status] }
    const [list, total, flagged, published, removed] = await Promise.all([
      Moment.find(q).sort(f.status === 'flagged' ? { reports: -1, createdAt: -1 } : { createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
      Moment.countDocuments(q),
      Moment.countDocuments({ ...base, ...byStatus.flagged }),
      Moment.countDocuments({ ...base, ...byStatus.published }),
      Moment.countDocuments({ ...base, ...byStatus.removed }),
    ])
    res.json({ ...paged(await adminShape(list), total, p), counts: { flagged, published, removed } })
  }),
)

momentsAdmin.post(
  '/:id/remove',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Moment')
    const { reason } = parse(z.object({ reason: z.string().trim().min(2).max(200) }), req.body)
    const m = await Moment.findByIdAndUpdate(req.params.id, { $set: { status: 'removed', removedReason: reason } }, { returnDocument: 'after' }).lean()
    if (!m) throw notFound('Moment')
    await audit(req, `Removed moment — ${reason}`, m._id, { author: String(m.author) })
    notify(m.author, { kind: 'safety', title: 'Your moment was removed', body: reason })
    const [out] = await adminShape([m])
    res.json({ moment: out })
  }),
)

momentsAdmin.post(
  '/:id/approve',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Moment')
    const m = await Moment.findByIdAndUpdate(req.params.id, { $set: { status: 'active', reports: 0, removedReason: '' } }, { returnDocument: 'after' }).lean()
    if (!m) throw notFound('Moment')
    await audit(req, 'Approved moment', m._id)
    const [out] = await adminShape([m])
    res.json({ moment: out })
  }),
)

momentsAdmin.post(
  '/bulk-approve',
  ah(async (req, res) => {
    const { ids } = parse(z.object({ ids: z.array(z.string().refine(mongoose.isValidObjectId)).min(1).max(200) }), req.body)
    const r = await Moment.updateMany({ _id: { $in: ids } }, { $set: { status: 'active', reports: 0, removedReason: '' } })
    await audit(req, `Approved ${r.modifiedCount} moments (bulk)`, null)
    res.json({ approved: r.modifiedCount })
  }),
)

/** A user report on a moment flags it for review (reports module calls this). */
export async function flagMoment(id) {
  if (!mongoose.isValidObjectId(id)) return null
  const m = await Moment.findOneAndUpdate({ _id: id, status: 'active' }, { $inc: { reports: 1 } }, { returnDocument: 'after' }).lean()
  return m ? { targetName: m.text?.slice(0, 40) || 'Moment', targetOwner: m.author } : null
}
