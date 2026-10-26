// The only code that moves coins or rupees. Everything else calls these, so
// balances can't drift: coin balances change with an atomic conditional
// update, and every change writes a ledger row in the same transaction.
import mongoose from 'mongoose'
import { User } from '../users/user.model.js'
import { CoinTxn } from './wallet.models.js'
import { Earning, Withdrawal } from '../earnings/earnings.models.js'
import { getConfig } from '../config/config.service.js'
import { insufficientCoins, notFound } from '../../core/errors.js'

const round2 = n => Math.round(n * 100) / 100

/** Run fn(session) inside a transaction; joins an outer session if given. */
export async function withTxn(fn, session) {
  if (session) return fn(session)
  const s = await mongoose.startSession()
  try {
    let out
    await s.withTransaction(async () => {
      out = await fn(s)
    })
    return out
  } finally {
    await s.endSession()
  }
}

/** Take coins from a user; throws 402 insufficient_coins if they can't pay. */
export async function debitCoins(userId, coins, { type, title, ref, meta } = {}, session) {
  if (!(coins > 0)) throw new Error('debitCoins needs a positive amount')
  return withTxn(async s => {
    const u = await User.findOneAndUpdate(
      { _id: userId, coins: { $gte: coins } },
      { $inc: { coins: -coins } },
      { returnDocument: 'after', session: s, projection: { coins: 1 } },
    )
    if (!u) {
      const cur = await User.findById(userId, { coins: 1 }).session(s)
      if (!cur) throw notFound('User')
      throw insufficientCoins(coins, cur.coins)
    }
    await CoinTxn.create([{ user: userId, type, coins: -coins, balance: u.coins, title, ref, meta }], { session: s })
    return u.coins
  }, session)
}

/** Give coins to a user (purchases, refunds, bonuses, admin adjustments). */
export async function creditCoins(userId, coins, { type, title, ref, meta } = {}, session) {
  if (!(coins > 0)) throw new Error('creditCoins needs a positive amount')
  return withTxn(async s => {
    const u = await User.findByIdAndUpdate(userId, { $inc: { coins } }, { returnDocument: 'after', session: s, projection: { coins: 1 } })
    if (!u) throw notFound('User')
    await CoinTxn.create([{ user: userId, type, coins, balance: u.coins, title, ref, meta }], { session: s })
    return u.coins
  }, session)
}

/**
 * gross → REBU commission → agency share → host net, in ₹.
 * Higher host levels get a commission discount (config.hostLevels).
 */
export function splitEarning({ source, coins, agencyId, level = 1 }) {
  const { economy, hostLevels } = getConfig()
  const discount = hostLevels.find(l => l.level === level)?.commissionDiscount || 0
  const pct = Math.max(0, (economy.commission[source] ?? 0) - (source === 'bonus' ? 0 : discount))
  const gross = round2(coins * economy.coinInr)
  const commission = round2((gross * pct) / 100)
  const share = gross - commission
  // REBU-funded bonuses are the host's alone; agencies share only user-paid earnings.
  const agency = agencyId && source !== 'bonus' ? round2((share * economy.agencyCut) / 100) : 0
  return { gross, commission, commissionPct: pct, agency, net: round2(share - agency) }
}

/** Credit a host for something a user paid for (or a bonus). */
export async function recordEarning(hostId, { source, coins, from, fromName, minutes, detail, ref }, session) {
  return withTxn(async s => {
    const host = await User.findById(hostId, { host: 1 }).session(s)
    if (!host?.host?.approved) throw notFound('Host')
    const level = host.host.levelOverride || host.host.level
    const split = splitEarning({ source, coins, agencyId: host.host.agencyId, level })
    const [e] = await Earning.create(
      [{ host: hostId, source, coins, from, fromName, minutes, detail, ref, agencyId: host.host.agencyId, ...split }],
      { session: s },
    )
    return e
  }, session)
}

/** Admin ₹ correction to a host's earnings (positive or negative). */
export async function adjustEarnings(hostId, amount, detail, session) {
  return withTxn(async s => {
    const [e] = await Earning.create(
      [{ host: hostId, source: 'bonus', coins: 0, gross: amount, commission: 0, commissionPct: 0, agency: 0, net: round2(amount), detail }],
      { session: s },
    )
    return e
  }, session)
}

/**
 * User pays coins and the host earns, atomically (calls, chat, gifts, tickets).
 * Returns { balance, earning }.
 */
export async function chargeUserPayHost({ userId, hostId, coins, source, txnType, title, ref, minutes, detail, fromName }, session) {
  return withTxn(async s => {
    const balance = await debitCoins(userId, coins, { type: txnType || source, title, ref }, s)
    const earning = await recordEarning(hostId, { source, coins, from: userId, fromName, minutes, detail, ref }, s)
    return { balance, earning }
  }, session)
}

/** Host balances derived from the ledger, so they can't drift. */
export async function hostBalance(hostId, session) {
  const id = new mongoose.Types.ObjectId(String(hostId))
  const [earn] = await Earning.aggregate([
    { $match: { host: id, status: { $ne: 'reversed' } } },
    {
      $group: {
        _id: null,
        lifetime: { $sum: '$net' },
        onHold: { $sum: { $cond: [{ $eq: ['$status', 'review'] }, '$net', 0] } },
      },
    },
  ]).session(session || null)
  const [wd] = await Withdrawal.aggregate([
    { $match: { host: id, status: { $ne: 'rejected' } } },
    {
      $group: {
        _id: null,
        withdrawn: { $sum: '$amount' },
        pending: { $sum: { $cond: [{ $in: ['$status', ['requested', 'processing']] }, '$amount', 0] } },
      },
    },
  ]).session(session || null)
  const lifetime = round2(earn?.lifetime || 0)
  const onHold = round2(earn?.onHold || 0)
  const withdrawn = round2(wd?.withdrawn || 0)
  return {
    lifetime,
    onHold,
    withdrawn,
    pendingPayout: round2(wd?.pending || 0),
    available: Math.max(0, round2(lifetime - onHold - withdrawn)),
  }
}

/** Host level from total connected call minutes (unless an admin overrode it). */
export function levelForMinutes(minutes) {
  const { hostLevels } = getConfig()
  return hostLevels.filter(l => minutes >= l.minutes).pop()?.level || 1
}
