// Call lifecycle and per-minute billing.
//
// Billing is server-side only: minute 1 is charged at connect, minute n+1 at
// connectedAt + n × BILLING_MS. Each charge runs in one transaction that
// (a) bumps call.minutes from n−1 to n only while the call is still
// `connected`, and (b) debits the user / credits the host. So a minute can
// be charged at most once, and never after the call has ended.
import mongoose from 'mongoose'
import { User } from '../users/user.model.js'
import { Call, ACTIVE } from './call.model.js'
import { chargeUserPayHost, withTxn } from '../wallet/economy.service.js'
import { getConfig } from '../config/config.service.js'
import { channelName, rtcToken, uidFor } from '../agora/agora.service.js'
import { toUser, isOnline } from '../../core/realtime.js'
import { notify } from '../notifications/notifications.js'
import { ApiError, badRequest, conflict, forbidden, insufficientCoins, notFound } from '../../core/errors.js'
import { onShutdown, onStartup } from '../../hooks.js'

// Test/ops overrides (production uses the defaults / admin config).
const BILLING_MS = Number(process.env.CALL_BILLING_MS) || 60_000
const GRACE_MS = Number(process.env.CALL_DISCONNECT_GRACE_MS) || 30_000
const ringMs = () => (Number(process.env.CALL_RING_SECS) || getConfig().settings.limits.ringTimeoutSecs || 30) * 1000

const RING_STATUS = { declined: 'declined', cancelled: 'cancelled' } // anything else while ringing → missed
const RING_ONLY = new Set(['declined', 'cancelled', 'timeout'])

// ---- timer registry: callId → { ring, bill } ----
const timers = new Map()

function setTimer(id, kind, t) {
  const key = String(id)
  const entry = timers.get(key) || {}
  clearTimeout(entry[kind])
  entry[kind] = t
  timers.set(key, entry)
}

function clearTimers(id) {
  const entry = timers.get(String(id))
  if (!entry) return
  clearTimeout(entry.ring)
  clearTimeout(entry.bill)
  timers.delete(String(id))
}

export const activeTimerCount = () => timers.size

// ---- shapes ----
const same = (a, b) => String(a) === String(b)
const round2 = n => Math.round((n || 0) * 100) / 100

/** Call as seen by one participant: caller sees coins charged, host sees ₹ earned. */
export function shapeCall(call, viewerId) {
  const c = call.toObject ? call.toObject() : call
  const role = same(c.caller, viewerId) ? 'caller' : 'host'
  return {
    id: String(c._id),
    role,
    caller: String(c.caller),
    host: String(c.host),
    type: c.type,
    random: c.random,
    status: c.status,
    rate: c.rate,
    channel: c.channel,
    // Callers play only the host's stream (other callers may share the channel).
    hostUid: uidFor(c.host),
    callerUid: uidFor(c.caller),
    createdAt: c.createdAt,
    connectedAt: c.connectedAt || null,
    endedAt: c.endedAt || null,
    endReason: c.endReason || null,
    duration: c.duration,
    minutes: c.minutes,
    ...(role === 'caller' ? { chargedCoins: c.chargedCoins, rating: c.rating } : { earned: round2(c.hostNet), giftCoins: c.giftCoins }),
  }
}

const tokenFor = (call, userId) => rtcToken({ channel: call.channel, userId, role: 'publisher' })

// A host can be on several calls at once (settings.limits.maxCallsAtOnce).
// host.calls counts their ringing + connected calls; host.busy means "full".
const maxCalls = () => Math.max(1, getConfig().settings.limits.maxCallsAtOnce || 1)
const callsNow = { $ifNull: ['$host.calls', 0] }
const freeHost = hostId =>
  User.updateOne({ _id: hostId }, [
    { $set: { 'host.calls': { $max: [0, { $subtract: [callsNow, 1] }] } } },
    { $set: { 'host.busy': { $gte: ['$host.calls', maxCalls()] } } },
  ], { updatePipeline: true })

// ---- start ----

/** Validates, atomically claims the host (busy=true), creates the ringing call. */
export async function startCall(caller, { hostId, type, random = false }) {
  if (same(hostId, caller._id)) throw badRequest('You can’t call yourself.')
  if (!mongoose.isValidObjectId(hostId)) throw notFound('Host')
  const host = await User.findById(hostId)
  if (!host?.host?.approved || host.host.status !== 'active' || host.status !== 'active') throw notFound('Host')
  if (host.blocked?.some(id => same(id, caller._id)) || caller.blocked?.some(id => same(id, host._id))) {
    throw forbidden('You can’t call this host.')
  }
  if (!host.host.online) throw conflict('This host is offline right now.', 'host_offline')
  if ((host.host.calls || 0) >= maxCalls()) throw conflict('This host is on another call. Try again in a bit.', 'host_busy')
  // A second caller joins the host's current call channel; same call type only.
  const current = await Call.findOne({ host: host._id, status: { $in: ACTIVE } }, { channel: 1, type: 1 }).sort({ createdAt: 1 })
  if (current && current.type !== type) throw conflict(`This host is on a ${current.type} call right now. Try again in a bit.`, 'host_busy')
  const rate = host.host.rates?.[type]
  if (!(rate > 0)) throw badRequest(`This host doesn’t take ${type} calls.`)
  if (caller.coins < rate) throw insufficientCoins(rate, caller.coins)
  if (await Call.exists({ caller: caller._id, status: { $in: ACTIVE } })) {
    throw conflict('You’re already on a call.', 'already_in_call')
  }

  // Claim a call slot atomically; parallel callers can't overfill the host.
  const claim = await User.updateOne(
    { _id: host._id, status: 'active', 'host.approved': true, 'host.status': 'active', 'host.online': true, $expr: { $lt: [callsNow, maxCalls()] } },
    [
      { $set: { 'host.calls': { $add: [callsNow, 1] } } },
      { $set: { 'host.busy': { $gte: ['$host.calls', maxCalls()] } } },
    ],
    { updatePipeline: true },
  )
  if (!claim.modifiedCount) throw conflict('This host is on another call. Try again in a bit.', 'host_busy')

  let call
  try {
    const _id = new mongoose.Types.ObjectId()
    call = await Call.create({ _id, caller: caller._id, host: host._id, type, random, rate, channel: current?.channel || channelName('call', _id) })
  } catch (e) {
    await freeHost(host._id)
    throw e
  }

  setTimer(call._id, 'ring', setTimeout(() => {
    endCall(call._id, { reason: 'timeout' }).catch(e => console.error('[calls] ring timeout', e))
  }, ringMs()))

  // `joining`: the host is already on a call; accepting adds this caller to it.
  toUser(host._id, 'call:incoming', { call: shapeCall(call, host._id), caller: caller.toPublic(), joining: !!current })
  notify(host._id, {
    kind: 'call',
    title: `${caller.name || 'Someone'} is calling`,
    body: call.type === 'video' ? 'Incoming video call' : 'Incoming voice call',
    inbox: false,
    urgent: true,
    data: { callId: String(call._id), type: call.type, caller: caller.toPublic() },
  })
  return { call: shapeCall(call, caller._id), host: host.toPublic(), agora: tokenFor(call, caller._id) }
}

/** Random match: an online, free host the caller can afford, preferring ones not called in the last day. */
export async function startRandomCall(caller, type) {
  if (getConfig().settings.features?.randomCall === false) throw forbidden('Random calls are turned off right now.')
  const recent = await Call.distinct('host', { caller: caller._id, createdAt: { $gte: new Date(Date.now() - 86_400_000) } })
  const exclude = [caller._id, ...(caller.blocked || [])]
  const base = {
    status: 'active',
    'host.approved': true,
    'host.status': 'active',
    'host.online': true,
    'host.busy': false,
    blocked: { $ne: caller._id },
  }
  const affordable = { ...base, [`host.rates.${type}`]: { $gt: 0, $lte: caller.coins } }
  const sample = (match, size) => User.aggregate([{ $match: match }, { $sample: { size } }, { $project: { _id: 1 } }])
  const fresh = await sample({ ...affordable, _id: { $nin: [...exclude, ...recent] } }, 5)
  const any = fresh.length < 5 ? await sample({ ...affordable, _id: { $nin: exclude } }, 5) : []
  const ids = [...new Set([...fresh, ...any].map(r => String(r._id)))]

  for (const hostId of ids) {
    try {
      return await startCall(caller, { hostId, type, random: true })
    } catch (e) {
      if (['host_busy', 'host_offline'].includes(e.code)) continue // lost a race; try the next one
      throw e
    }
  }
  // Nobody affordable: say so if there are free hosts the user just can't pay for.
  const cheapest = await User.findOne({ ...base, _id: { $nin: exclude } }, { 'host.rates': 1 }).sort({ [`host.rates.${type}`]: 1 })
  if (cheapest && cheapest.host.rates[type] > caller.coins) throw insufficientCoins(cheapest.host.rates[type], caller.coins)
  throw new ApiError(404, 'no_hosts', 'No hosts are free right now. Try again in a minute.')
}

// ---- accept + billing ----

export async function acceptCall(callId, hostUser) {
  const call = await Call.findOneAndUpdate(
    { _id: callId, host: hostUser._id, status: 'ringing' },
    { $set: { status: 'connected', connectedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!call) {
    const cur = await Call.findById(callId, { host: 1, status: 1 })
    if (!cur || !same(cur.host, hostUser._id)) throw notFound('Call')
    throw conflict('This call is no longer ringing.', 'call_not_ringing')
  }
  clearTimers(call._id)
  const caller = await User.findById(call.caller, { name: 1 })
  toUser(call.caller, 'call:accepted', { call: shapeCall(call, call.caller) })

  const ctx = { id: call._id, caller: call.caller, host: call.host, type: call.type, rate: call.rate, connectedAt: call.connectedAt.getTime(), fromName: caller?.name }
  const first = await chargeMinute(ctx, 1)
  if (first.skipped) throw conflict('This call has already ended.', 'call_ended')
  if (!first.ok) {
    await endCall(call._id, { reason: 'no_coins' })
    throw conflict('The caller ran out of coins.', 'caller_no_coins')
  }
  scheduleNext(ctx, 1)
  const fresh = await Call.findById(call._id)
  return { call: shapeCall(fresh, hostUser._id), agora: tokenFor(call, hostUser._id) }
}

/** Charges minute n. → { ok, balance } | { ok: false, noCoins } | { ok: false, skipped } */
async function chargeMinute(ctx, n) {
  let res
  try {
    res = await withTxn(async s => {
      const c = await Call.findOneAndUpdate(
        { _id: ctx.id, status: 'connected', minutes: n - 1 },
        { $inc: { minutes: 1, chargedCoins: ctx.rate } },
        { session: s, returnDocument: 'after' },
      )
      if (!c) return null // ended, or this minute is already paid
      const { balance, earning } = await chargeUserPayHost(
        {
          userId: ctx.caller,
          hostId: ctx.host,
          coins: ctx.rate,
          source: ctx.type,
          txnType: 'call',
          title: `${ctx.type === 'video' ? 'Video' : 'Voice'} call · min ${n}`,
          ref: { kind: 'Call', id: ctx.id },
          minutes: 1,
          detail: `Minute ${n} × ${ctx.rate} coins`,
          fromName: ctx.fromName,
        },
        s,
      )
      await Call.updateOne({ _id: ctx.id }, { $inc: { hostNet: earning.net } }, { session: s })
      return { balance, charged: c.chargedCoins }
    })
  } catch (e) {
    if (e.code === 'insufficient_coins') return { ok: false, noCoins: true }
    throw e
  }
  if (!res) return { ok: false, skipped: true }

  const seconds = Math.round((Date.now() - ctx.connectedAt) / 1000)
  toUser(ctx.caller, 'call:tick', { callId: String(ctx.id), minute: n, seconds, charged: res.charged, balance: res.balance, rate: ctx.rate })
  if (res.balance < ctx.rate) {
    toUser(ctx.caller, 'call:low_balance', { callId: String(ctx.id), balance: res.balance, rate: ctx.rate })
  }
  return { ok: true, balance: res.balance }
}

/** Arms the timer for minute n+1 at an absolute time (no setInterval drift). */
function scheduleNext(ctx, n, attempt = 0) {
  const delay = attempt ? 3000 : Math.max(0, ctx.connectedAt + n * BILLING_MS - Date.now())
  setTimer(ctx.id, 'bill', setTimeout(async () => {
    try {
      const r = await chargeMinute(ctx, n + 1)
      if (r.ok) scheduleNext(ctx, n + 1)
      else if (r.noCoins) await endCall(ctx.id, { reason: 'no_coins' })
      // skipped → the call already ended
    } catch (e) {
      console.error('[calls] billing error', e)
      // Don't give away free minutes on a DB hiccup: retry a few times, then end.
      if (attempt < 3) scheduleNext(ctx, n, attempt + 1)
      else await endCall(ctx.id, { reason: 'error' }).catch(() => {})
    }
  }, delay))
}

// ---- end ----

/**
 * Ends a call from whatever state it's in. Safe to call any number of times
 * from anywhere: only the first conditional update wins, the rest return null.
 */
export async function endCall(callId, { reason = 'hangup', by = null } = {}) {
  for (let i = 0; i < 3; i++) {
    const cur = await Call.findById(callId, { status: 1, connectedAt: 1, minutes: 1 })
    if (!cur) return null
    if (cur.status === 'ringing') {
      const c = await Call.findOneAndUpdate(
        { _id: callId, status: 'ringing' },
        { $set: { status: RING_STATUS[reason] || 'missed', endReason: reason, endedBy: by, endedAt: new Date() } },
        { returnDocument: 'after' },
      )
      if (c) return finishRinging(c)
      continue // accepted meanwhile
    }
    if (cur.status === 'connected') {
      if (RING_ONLY.has(reason)) return null
      const endedAt = new Date()
      let duration = Math.max(0, Math.round((endedAt - cur.connectedAt) / 1000))
      // After a crash nobody was billing; don't report unpaid time.
      if (reason === 'server_restart') duration = Math.min(duration, cur.minutes * Math.round(BILLING_MS / 1000))
      const c = await Call.findOneAndUpdate(
        { _id: callId, status: 'connected' },
        { $set: { status: 'ended', endReason: reason, endedBy: by, endedAt, duration } },
        { returnDocument: 'after' },
      )
      if (c) return finishConnected(c)
      continue
    }
    return null // already final
  }
  return null
}

async function finishRinging(c) {
  clearTimers(c._id)
  await freeHost(c.host)
  const base = { callId: String(c._id), status: c.status, reason: c.endReason, duration: 0, minutes: 0 }
  toUser(c.caller, 'call:ended', { ...base, charged: 0, call: shapeCall(c, c.caller) })
  toUser(c.host, 'call:ended', { ...base, earned: 0, call: shapeCall(c, c.host) })
  if (c.status === 'missed') {
    User.findById(c.caller).then(u =>
      notify(c.host, { kind: 'call', title: `Missed ${c.type} call`, body: `${u?.name || 'Someone'} tried to call you.`, image: u?.toPublic().photo, deeplink: 'rebu://calls' }),
    )
  }
  return { call: c }
}

async function finishConnected(c) {
  clearTimers(c._id)
  await User.updateOne({ _id: c.host }, { $inc: { 'host.callMinutes': c.minutes } })
  await freeHost(c.host)
  const payer = await User.findById(c.caller, { coins: 1 })
  const base = { callId: String(c._id), status: c.status, reason: c.endReason, duration: c.duration, minutes: c.minutes }
  toUser(c.caller, 'call:ended', { ...base, charged: c.chargedCoins, balance: payer?.coins ?? null, call: shapeCall(c, c.caller) })
  toUser(c.host, 'call:ended', { ...base, earned: round2(c.hostNet), call: shapeCall(c, c.host) })
  return { call: c }
}

// ---- participant helpers for routes ----

export async function loadParticipantCall(callId, userId) {
  if (!mongoose.isValidObjectId(callId)) throw notFound('Call')
  const call = await Call.findById(callId)
  if (!call || (!same(call.caller, userId) && !same(call.host, userId))) throw notFound('Call')
  return call
}

export async function rateCall(callId, userId, stars) {
  const call = await loadParticipantCall(callId, userId)
  if (!same(call.caller, userId)) throw forbidden('Only the caller can rate a call.')
  if (call.status !== 'ended') throw conflict('You can rate a call after it ends.', 'call_not_ended')
  const updated = await Call.findOneAndUpdate(
    { _id: call._id, status: 'ended', rating: null },
    { $set: { rating: stars } },
    { returnDocument: 'after' },
  )
  if (!updated) throw conflict('You already rated this call.', 'already_rated')
  // Running average, computed in one atomic pipeline update.
  const count = { $ifNull: ['$host.ratingCount', 0] }
  const avg = { $ifNull: ['$host.rating', 0] }
  await User.updateOne(
    { _id: call.host },
    [{
      $set: {
        'host.rating': { $round: [{ $divide: [{ $add: [{ $multiply: [avg, count] }, stars] }, { $add: [count, 1] }] }, 2] },
        'host.ratingCount': { $add: [count, 1] },
      },
    }],
    { updatePipeline: true },
  )
  return updated
}

// ---- socket disconnect grace ----

const graceTimers = new Map() // userId → timeout

/** Pass to initRealtime(server, callSocketHooks) in server.js. */
export const callSocketHooks = {
  onConnect(socket) {
    const id = socket.data.userId
    clearTimeout(graceTimers.get(id))
    graceTimers.delete(id)
  },
  onDisconnect(socket, last) {
    if (!last) return
    const userId = socket.data.userId
    clearTimeout(graceTimers.get(userId))
    graceTimers.set(userId, setTimeout(async () => {
      graceTimers.delete(userId)
      if (isOnline(userId)) return
      try {
        const calls = await Call.find({ status: 'connected', $or: [{ caller: userId }, { host: userId }] }, { _id: 1 })
        for (const c of calls) await endCall(c._id, { reason: 'disconnect', by: userId })
      } catch (e) {
        console.error('[calls] disconnect cleanup', e)
      }
    }, GRACE_MS))
  },
}

// ---- boot / shutdown ----

onStartup(async () => {
  // Calls left ringing/connected by a crash: end them (no more charges) and free their hosts.
  const stale = await Call.find({ status: { $in: ACTIVE } }, { _id: 1 })
  for (const c of stale) await endCall(c._id, { reason: 'server_restart' })
  if (stale.length) console.log(`[calls] ended ${stale.length} call(s) left over from the last run`)
  // No call is active now, so every host's call slots are free.
  await User.updateMany({ 'host.approved': true, $or: [{ 'host.calls': { $gt: 0 } }, { 'host.busy': true }] }, { $set: { 'host.calls': 0, 'host.busy': false } })
})

onShutdown(() => {
  for (const id of [...timers.keys()]) clearTimers(id)
  for (const t of graceTimers.values()) clearTimeout(t)
  graceTimers.clear()
})
