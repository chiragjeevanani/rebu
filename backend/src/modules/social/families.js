// Families: user groups with a weekly gift total and a level. Creating one
// costs coins; the first family a user ever joins pays a small reward.
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { getConfig } from '../config/config.service.js'
import { checkContent } from '../chat/chat.service.js'
import { creditCoins, debitCoins, withTxn } from '../wallet/economy.service.js'
import { istDayStart } from '../hosts/hosts.service.js'

const { Schema } = mongoose

const familySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: '⭐' },
    desc: { type: String, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: Number, default: 1 },
    totalCoins: { type: Number, default: 0 }, // gifts sent by members, all time → level
    week: { key: String, coins: { type: Number, default: 0 } }, // this week's gifts
    status: { type: String, enum: ['active', 'disbanded'], default: 'active', index: true },
  },
  { timestamps: true },
)
familySchema.index({ name: 1 }, { unique: true, partialFilterExpression: { status: 'active' }, collation: { locale: 'en', strength: 2 } })
familySchema.index({ status: 1, 'week.coins': -1 })

export const Family = mongoose.models.Family || mongoose.model('Family', familySchema)

/** Monday-start IST week key, e.g. 2026-10-26. */
const weekKey = () => {
  const start = istDayStart(0)
  const ist = new Date(start.getTime() + 330 * 60000)
  const back = (ist.getUTCDay() + 6) % 7
  return new Date(ist.getTime() - back * 86400000).toISOString().slice(0, 10)
}

const levelOf = coins => {
  const steps = getConfig().families.levelCoins
  return Math.max(1, steps.filter(c => coins >= c).length)
}

const out = f => ({
  id: String(f._id),
  name: f.name,
  emoji: f.emoji,
  desc: f.desc,
  owner: String(f.owner),
  members: f.members,
  level: levelOf(f.totalCoins),
  weekly: f.week?.key === weekKey() ? f.week.coins : 0,
})

/** Called when a member sends a gift: counts toward the family's week and level. */
export async function addFamilyGift(userId, coins) {
  const u = await User.findById(userId, { familyId: 1 }).lean()
  if (!u?.familyId) return
  const key = weekKey()
  // New week: reset the counter in the same update.
  await Family.updateOne({ _id: u.familyId, 'week.key': key }, { $inc: { 'week.coins': coins, totalCoins: coins } }).then(r =>
    r.matchedCount ? r : Family.updateOne({ _id: u.familyId }, { $set: { week: { key, coins } }, $inc: { totalCoins: coins } }),
  )
}

export const familiesRoutes = Router()

familiesRoutes.get(
  '/',
  ah(async (req, res) => {
    const p = paging(req.query)
    const q = { status: 'active' }
    if (req.query.q) q.name = { $regex: String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const key = weekKey()
    const [list, total] = await Promise.all([
      // This week's leaders first (stale weeks sort as 0).
      Family.aggregate([
        { $match: q },
        { $addFields: { weekly: { $cond: [{ $eq: ['$week.key', key] }, '$week.coins', 0] } } },
        { $sort: { weekly: -1, members: -1, _id: 1 } },
        { $skip: p.skip },
        { $limit: p.limit },
      ]),
      Family.countDocuments(q),
    ])
    res.json({ mine: req.user.familyId ? String(req.user.familyId) : null, ...paged(list.map(out), total, p) })
  }),
)

familiesRoutes.get(
  '/:id',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Family')
    const f = await Family.findOne({ _id: req.params.id, status: 'active' }).lean()
    if (!f) throw notFound('Family')
    const members = await User.find({ familyId: f._id, status: 'active' }).sort({ spent: -1 }).limit(30)
    res.json({ family: out(f), members: members.map(m => ({ ...m.toPublic(), owner: String(m._id) === String(f.owner) })) })
  }),
)

familiesRoutes.post(
  '/',
  ah(async (req, res) => {
    const b = parse(
      z.object({ name: z.string().trim().min(3).max(24), emoji: z.string().trim().min(1).max(8).default('⭐'), desc: z.string().trim().max(120).default('') }),
      req.body,
    )
    checkContent(`${b.name} ${b.desc}`)
    if (req.user.familyId) throw conflict('Leave your family before creating one.', 'in_family')
    const cost = getConfig().families.createCost
    try {
      const f = await withTxn(async s => {
        const [doc] = await Family.create([{ ...b, owner: req.user._id, week: { key: weekKey(), coins: 0 } }], { session: s })
        const r = await User.updateOne({ _id: req.user._id, familyId: null }, { $set: { familyId: doc._id } }, { session: s })
        if (!r.modifiedCount) throw conflict('Leave your family before creating one.', 'in_family')
        if (cost > 0) await debitCoins(req.user._id, cost, { type: 'family', title: `Created family ${b.emoji} ${b.name}` }, s)
        return doc
      })
      res.status(201).json({ family: out(f) })
    } catch (e) {
      if (e?.code === 11000) throw conflict('That family name is taken.', 'name_taken')
      throw e
    }
  }),
)

familiesRoutes.post(
  '/:id/join',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Family')
    const { joinReward, maxMembers } = getConfig().families
    const me = req.user._id
    const result = await withTxn(async s => {
      const f = await Family.findOneAndUpdate(
        { _id: req.params.id, status: 'active', members: { $lt: maxMembers } },
        { $inc: { members: 1 } },
        { session: s, returnDocument: 'after' },
      )
      if (!f) {
        if (await Family.exists({ _id: req.params.id, status: 'active' }).session(s)) throw conflict('This family is full.', 'family_full')
        throw notFound('Family')
      }
      const u = await User.findOneAndUpdate({ _id: me, familyId: null }, { $set: { familyId: f._id } }, { session: s, returnDocument: 'before' })
      if (!u) throw conflict('Leave your family before joining another.', 'in_family')
      let reward = 0
      if (!u.familyRewarded && joinReward > 0) {
        await User.updateOne({ _id: me }, { $set: { familyRewarded: true } }, { session: s })
        await creditCoins(me, joinReward, { type: 'family', title: `Joined ${f.emoji} ${f.name}` }, s)
        reward = joinReward
      }
      return { family: out(f), reward }
    })
    res.json(result)
  }),
)

familiesRoutes.post(
  '/leave',
  ah(async (req, res) => {
    const me = req.user._id
    const fid = req.user.familyId
    if (!fid) throw badRequest('You’re not in a family.')
    await withTxn(async s => {
      const f = await Family.findById(fid).session(s)
      await User.updateOne({ _id: me }, { $set: { familyId: null } }, { session: s })
      if (!f || f.status !== 'active') return
      f.members = Math.max(0, f.members - 1)
      if (String(f.owner) === String(me)) {
        // Owner leaves: hand over to the longest-standing big spender, or disband if empty.
        const next = await User.findOne({ familyId: f._id, _id: { $ne: me } }, { _id: 1 }).sort({ spent: -1 }).session(s)
        if (next) f.owner = next._id
        else f.status = 'disbanded'
      }
      await f.save({ session: s })
    })
    res.json({ ok: true })
  }),
)

/** Owner edits the description / emoji. */
familiesRoutes.patch(
  '/:id',
  ah(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('Family')
    const b = parse(z.object({ emoji: z.string().trim().min(1).max(8).optional(), desc: z.string().trim().max(120).optional() }), req.body)
    checkContent(b.desc)
    const f = await Family.findOne({ _id: req.params.id, status: 'active' })
    if (!f) throw notFound('Family')
    if (String(f.owner) !== String(req.user._id)) throw forbidden('Only the family owner can edit it.')
    Object.assign(f, b)
    await f.save()
    res.json({ family: out(f.toObject()) })
  }),
)
