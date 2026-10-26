import { Router } from 'express'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { badRequest, notFound } from '../../core/errors.js'
import { User } from './user.model.js'
import { CoinTxn } from '../wallet/wallet.models.js'
import { checkContent } from '../chat/chat.service.js'
import { notify } from '../notifications/notifications.js'

export const meRoutes = Router()

meRoutes.get('/', (req, res) => res.json({ user: req.user.toSelf() }))

const profileSchema = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  gender: z.enum(['Female', 'Male', 'Other']).optional(),
  dob: z.coerce.date().optional(),
  city: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(300).optional(),
  job: z.string().trim().max(40).optional(),
  interests: z.array(z.string().trim().min(1).max(30)).max(6).optional(),
  photos: z.array(z.string().url()).max(6).optional(),
  email: z.string().email().optional(),
})

meRoutes.patch(
  '/',
  ah(async (req, res) => {
    const patch = parse(profileSchema, req.body)
    // Profiles can't be a way around the no-phone-numbers rule.
    checkContent([patch.name, patch.bio, patch.job].filter(Boolean).join(' '))
    if (patch.dob) {
      const age = (Date.now() - patch.dob.getTime()) / (365.25 * 864e5)
      if (age < 18) throw badRequest('You must be 18 or older to use REBU.')
    }
    Object.assign(req.user, patch)
    if (req.user.name && req.user.gender && req.user.dob) req.user.profileDone = true
    await req.user.save()
    res.json({ user: req.user.toSelf() })
  }),
)

meRoutes.put(
  '/device',
  ah(async (req, res) => {
    const d = parse(
      z.object({ platform: z.enum(['android', 'ios']), pushToken: z.string().max(400).optional(), appVersion: z.string().max(20).optional() }),
      req.body,
    )
    req.user.device = { ...req.user.device, ...d }
    req.user.lastActive = new Date()
    await req.user.save()
    res.json({ ok: true })
  }),
)

/** Coin history (recharges, calls, chats, gifts…). */
meRoutes.get(
  '/coins',
  ah(async (req, res) => {
    const p = paging(req.query)
    const q = { user: req.user._id }
    const [items, total] = await Promise.all([
      CoinTxn.find(q).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
      CoinTxn.countDocuments(q),
    ])
    res.json({ balance: req.user.coins, ...paged(items, total, p) })
  }),
)

meRoutes.post(
  '/following/:id',
  ah(async (req, res) => {
    const target = await User.findById(req.params.id, { _id: 1 })
    if (!target) throw notFound('User')
    const r = await User.updateOne({ _id: req.user._id }, { $addToSet: { following: target._id } })
    if (r.modifiedCount) {
      await User.updateOne({ _id: target._id }, { $inc: { followersCount: 1 } })
      notify(target._id, { kind: 'follow', title: `${req.user.name || 'Someone'} followed you`, body: 'Say hi and start a chat.', image: req.user.toPublic().photo, deeplink: `rebu://user/${req.user._id}` })
    }
    res.json({ following: true })
  }),
)
meRoutes.delete(
  '/following/:id',
  ah(async (req, res) => {
    const r = await User.updateOne({ _id: req.user._id }, { $pull: { following: req.params.id } })
    if (r.modifiedCount) await User.updateOne({ _id: req.params.id, followersCount: { $gt: 0 } }, { $inc: { followersCount: -1 } })
    res.json({ following: false })
  }),
)
meRoutes.post(
  '/blocked/:id',
  ah(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $addToSet: { blocked: req.params.id }, $pull: { following: req.params.id } })
    res.json({ blocked: true })
  }),
)

meRoutes.delete(
  '/blocked/:id',
  ah(async (req, res) => {
    await User.updateOne({ _id: req.user._id }, { $pull: { blocked: req.params.id } })
    res.json({ blocked: false })
  }),
)

/** People I blocked. */
meRoutes.get(
  '/blocked',
  ah(async (req, res) => {
    const users = await User.find({ _id: { $in: req.user.blocked || [] } })
    res.json({ items: users.map(u => u.toPublic()) })
  }),
)

/** My followers or who I follow. */
meRoutes.get(
  '/connections',
  ah(async (req, res) => {
    const { tab } = parse(z.object({ tab: z.enum(['followers', 'following']).default('followers') }), req.query)
    const p = paging(req.query)
    const q = tab === 'followers' ? { following: req.user._id, status: 'active' } : { _id: { $in: req.user.following || [] }, status: 'active' }
    const [list, total] = await Promise.all([User.find(q).sort({ _id: -1 }).skip(p.skip).limit(p.limit), User.countDocuments(q)])
    res.json(paged(list.map(u => u.toPublic()), total, p))
  }),
)

/** Ask for the blue tick: a selfie the safety team compares with the profile photos. */
meRoutes.post(
  '/verification',
  ah(async (req, res) => {
    const { selfie } = parse(z.object({ selfie: z.string().url().max(500) }), req.body)
    if (req.user.verified) throw badRequest('You’re already verified.')
    req.user.verification = { status: 'pending', selfie, at: new Date() }
    await req.user.save()
    res.status(201).json({ verification: { status: 'pending', at: req.user.verification.at } })
  }),
)

/** Self-service delete (Play Store requirement). Keeps ledgers for accounting. */
meRoutes.delete(
  '/',
  ah(async (req, res) => {
    const u = req.user
    u.status = 'banned'
    u.statusReason = 'Deleted by user'
    u.phone = `deleted_${u._id}_${u.phone}`
    u.name = 'Deleted user'
    u.photos = []
    u.bio = ''
    u.email = undefined
    u.device = {}
    if (u.host) u.host.online = false
    await u.save()
    res.json({ ok: true })
  }),
)
