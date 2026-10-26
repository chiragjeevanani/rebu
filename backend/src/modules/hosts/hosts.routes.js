import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { notFound } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { Live } from '../lives/live.model.js'
import { recordVisit } from '../social/extras.js'

// Which of these hosts are live right now → { ownerId: liveId }.
async function liveIds(ids) {
  const lives = await Live.find({ owner: { $in: ids }, status: 'live' }, { owner: 1, mode: 1 }).lean()
  return Object.fromEntries(lives.map(l => [String(l.owner), { id: String(l._id), mode: l.mode }]))
}
const withLive = (u, map) => ({ ...u.toPublic(), live: map[String(u._id)] || null })

export const hostsRoutes = Router()

const SORTS = {
  popular: { 'host.callMinutes': -1, _id: -1 },
  new: { 'host.approvedAt': -1, _id: -1 },
  rating: { 'host.rating': -1, 'host.ratingCount': -1, _id: -1 },
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Approved, active hosts the viewer can see (neither side has blocked the other).
const visibleHosts = viewer => ({
  'host.approved': true,
  'host.status': 'active',
  status: 'active',
  _id: { $nin: [viewer._id, ...(viewer.blocked || [])] },
  blocked: { $ne: viewer._id },
})

hostsRoutes.get(
  '/',
  ah(async (req, res) => {
    const f = parse(
      z.object({
        online: z.enum(['0', '1', 'true', 'false']).optional(),
        q: z.string().trim().max(60).optional(),
        sort: z.enum(['popular', 'new', 'rating']).default('popular'),
      }),
      req.query,
    )
    const p = paging(req.query)
    const q = visibleHosts(req.user)
    if (f.online === '1' || f.online === 'true') Object.assign(q, { 'host.online': true, 'host.busy': false })
    if (f.q) {
      const re = new RegExp(escapeRe(f.q), 'i')
      q.$or = [{ 'host.displayName': re }, { name: re }, { city: re }]
    }
    const [items, total] = await Promise.all([
      User.find(q).sort(SORTS[f.sort]).skip(p.skip).limit(p.limit),
      User.countDocuments(q),
    ])
    const live = await liveIds(items.map(u => u._id))
    res.json(paged(items.map(u => withLive(u, live)), total, p))
  }),
)

hostsRoutes.get(
  '/:id',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Host')
    const host = await User.findOne({ ...visibleHosts(req.user), _id: req.params.id })
    if (!host || req.user.blocked?.some(b => b.equals(host._id))) throw notFound('Host')
    recordVisit(host._id, req.user)
    res.json({
      host: withLive(host, await liveIds([host._id])),
      following: req.user.following.some(f => f.equals(host._id)),
    })
  }),
)
