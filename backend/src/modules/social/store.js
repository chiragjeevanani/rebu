// Coin store: avatar frames / entry effects / chat bubbles (time-limited),
// VIP and royal-club memberships, and the diamonds → coins swap. Prices come
// from config (admin-editable); every coin movement goes through debit/credit.
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, parse } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { getConfig } from '../config/config.service.js'
import { creditCoins, debitCoins, withTxn } from '../wallet/economy.service.js'

const { Schema } = mongoose
const DAY = 86400000

const userItemSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    itemId: { type: String, required: true },
    category: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)
userItemSchema.index({ user: 1, itemId: 1 }, { unique: true })

export const UserItem = mongoose.models.UserItem || mongoose.model('UserItem', userItemSchema)

const later = (until, days) => new Date(Math.max(Date.now(), until ? new Date(until).getTime() : 0) + days * DAY)
const active = until => !!until && new Date(until) > new Date()

/** Royal tiers predating coinsBack: read it from the "N coins back" perk. */
const coinsBack = t => t.coinsBack ?? Number(/([\d,]+) coins back/.exec(t.perks.join(' '))?.[1]?.replace(/,/g, '') || 0)

async function state(userId) {
  const [u, items] = await Promise.all([
    User.findById(userId, { coins: 1, diamonds: 1, vip: 1, royal: 1, equipped: 1 }).lean(),
    UserItem.find({ user: userId, expiresAt: { $gt: new Date() } }).lean(),
  ])
  const owned = new Set(items.map(i => i.itemId))
  // An expired item can't stay equipped.
  const equipped = Object.fromEntries(Object.entries(u.equipped || {}).map(([k, v]) => [k, v && owned.has(v) ? v : null]))
  return {
    balance: u.coins,
    diamonds: u.diamonds || 0,
    vip: active(u.vip?.until) ? { level: u.vip.level, until: u.vip.until } : { level: 0, until: null },
    royal: active(u.royal?.until) ? { key: u.royal.key, until: u.royal.until } : null,
    owned: items.map(i => ({ itemId: i.itemId, category: i.category, expiresAt: i.expiresAt })),
    equipped,
  }
}

export const storeRoutes = Router()

storeRoutes.get(
  '/',
  ah(async (req, res) => {
    const c = getConfig()
    res.json({
      items: c.storeItems.filter(i => i.active),
      vipTiers: c.vipTiers.filter(t => t.active),
      royalClub: c.royalClub.filter(t => t.active).map(t => ({ ...t, coinsBack: coinsBack(t) })),
      diamondsPerCoin: c.diamondsPerCoin,
      ...(await state(req.user._id)),
    })
  }),
)

storeRoutes.post(
  '/items/:id/buy',
  ah(async (req, res) => {
    const item = getConfig().storeItems.find(i => i.id === req.params.id && i.active)
    if (!item) throw notFound('Item')
    const me = req.user._id
    await withTxn(async s => {
      await debitCoins(me, item.price, { type: 'store', title: `${item.emoji} ${item.name} · ${item.days} days`, meta: { itemId: item.id } }, s)
      const cur = await UserItem.findOne({ user: me, itemId: item.id }).session(s)
      // Buying again while it's still active extends it.
      await UserItem.updateOne(
        { user: me, itemId: item.id },
        { $set: { category: item.category, expiresAt: later(cur?.expiresAt, item.days) } },
        { upsert: true, session: s },
      )
      await User.updateOne({ _id: me }, { $set: { [`equipped.${item.category}`]: item.id } }, { session: s })
    })
    res.status(201).json(await state(me))
  }),
)

storeRoutes.post(
  '/equip',
  ah(async (req, res) => {
    const { category, itemId } = parse(z.object({ category: z.enum(['frame', 'entry', 'bubble']), itemId: z.string().nullable() }), req.body)
    if (itemId) {
      const own = await UserItem.exists({ user: req.user._id, itemId, category, expiresAt: { $gt: new Date() } })
      if (!own) throw badRequest('You don’t own that item (or it has expired).')
    }
    await User.updateOne({ _id: req.user._id }, { $set: { [`equipped.${category}`]: itemId || null } })
    res.json(await state(req.user._id))
  }),
)

/** VIP for coins. Same level extends; a higher level upgrades; no downgrade while active. */
storeRoutes.post(
  '/vip',
  ah(async (req, res) => {
    const { level } = parse(z.object({ level: z.number().int().min(1) }), req.body)
    const tier = getConfig().vipTiers.find(t => t.level === level && t.active)
    if (!tier) throw notFound('VIP plan')
    const me = req.user._id
    await withTxn(async s => {
      const u = await User.findById(me, { vip: 1 }).session(s)
      const on = active(u.vip?.until)
      if (on && u.vip.level > level) throw conflict(`You already have VIP ${u.vip.level}.`, 'vip_higher')
      await debitCoins(me, tier.price, { type: 'vip', title: `${tier.name} · ${tier.days} days`, meta: { level } }, s)
      const until = on && u.vip.level === level ? later(u.vip.until, tier.days) : later(null, tier.days)
      await User.updateOne({ _id: me }, { $set: { vip: { level, until } } }, { session: s })
    })
    res.status(201).json(await state(me))
  }),
)

/** Royal club (crowns): 30 days, with some coins back. */
storeRoutes.post(
  '/royal',
  ah(async (req, res) => {
    const { key } = parse(z.object({ key: z.string().min(1).max(24) }), req.body)
    const tier = getConfig().royalClub.find(t => t.key === key && t.active)
    if (!tier) throw notFound('Royal tier')
    const me = req.user._id
    const back = coinsBack(tier)
    await withTxn(async s => {
      const u = await User.findById(me, { royal: 1 }).session(s)
      const same = active(u.royal?.until) && u.royal.key === key
      await debitCoins(me, tier.price, { type: 'royal', title: `${tier.emoji} ${tier.name} · 30 days`, meta: { key } }, s)
      await User.updateOne({ _id: me }, { $set: { royal: { key, until: same ? later(u.royal.until, 30) : later(null, 30) } } }, { session: s })
      if (back > 0) await creditCoins(me, back, { type: 'royal', title: `${tier.name} coins back`, meta: { key } }, s)
    })
    res.status(201).json(await state(me))
  }),
)

/** Swap diamonds for coins at config.diamondsPerCoin. */
storeRoutes.post(
  '/diamonds/exchange',
  ah(async (req, res) => {
    const { diamonds } = parse(z.object({ diamonds: z.number().int().positive() }), req.body)
    const rate = getConfig().diamondsPerCoin
    const coins = Math.floor(diamonds / rate)
    if (coins < 1) throw badRequest(`You need at least ${rate} diamonds for 1 coin.`)
    const spend = coins * rate
    const me = req.user._id
    await withTxn(async s => {
      const u = await User.findOneAndUpdate({ _id: me, diamonds: { $gte: spend } }, { $inc: { diamonds: -spend } }, { session: s, returnDocument: 'after' })
      if (!u) throw badRequest('You don’t have that many diamonds.')
      await creditCoins(me, coins, { type: 'exchange', title: `Swapped ${spend} diamonds`, meta: { diamonds: spend } }, s)
    })
    res.status(201).json({ coins, diamondsSpent: spend, ...(await state(me)) })
  }),
)
