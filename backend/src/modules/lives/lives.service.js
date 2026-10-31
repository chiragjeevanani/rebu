// Lives and rooms: start/join/leave, chat, guests & seats, tickets, gifts,
// end-of-live summary and the heartbeat that ends abandoned lives.
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { Live } from './live.model.js'
import { User } from '../users/user.model.js'
import { Earning } from '../earnings/earnings.models.js'
import { getConfig } from '../config/config.service.js'
import { chargeUserPayHost, withTxn } from '../wallet/economy.service.js'
import { channelName, rtcToken, uidFor } from '../agora/agora.service.js'
import { getIo, isOnline, toAdmins, toLive, toUser } from '../../core/realtime.js'
import { ApiError, badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { onShutdown, onStartup } from '../../hooks.js'

const CHAT_KEEP = 50
const OWNER_GRACE_MS = 60_000
const SWEEP_MS = 15_000

const sid = id => String(id?._id ?? id)
const same = (a, b) => sid(a) === sid(b)
const room = id => `live:${id}`
const oid = id => {
  if (!mongoose.isValidObjectId(sid(id))) throw notFound('User')
  return new mongoose.Types.ObjectId(sid(id))
}

const isRoom = mode => mode === 'party' || mode === 'audio'
const ended = () => conflict('This live has ended.', 'live_ended')

export const tokenFor = (live, userId, role) =>
  rtcToken({ channel: live.channel || channelName('live', live._id), userId, role })

// ---------- shapes ----------

async function usersById(ids) {
  const uniq = [...new Set(ids.map(sid))]
  if (!uniq.length) return new Map()
  const users = await User.find({ _id: { $in: uniq } })
  return new Map(users.map(u => [sid(u), u]))
}

/** Guests (with public users), plus a seat array for rooms. */
export async function guestList(live) {
  const map = await usersById(live.guests.map(g => g.user))
  const guests = live.guests
    .filter(g => map.has(sid(g.user)))
    .map(g => ({ user: map.get(sid(g.user)).toPublic(), uid: uidFor(g.user), seat: g.seat, muted: g.muted, at: g.at }))
  const out = { guests }
  if (isRoom(live.mode)) {
    out.seats = Array.from({ length: live.seats }, (_, i) => guests.find(g => g.seat === i) || null)
  }
  return out
}

async function requestList(live) {
  const map = await usersById(live.requests.map(r => r.user))
  return live.requests
    .filter(r => map.has(sid(r.user)))
    .map(r => ({ user: map.get(sid(r.user)).toPublic(), seat: r.seat, at: r.at }))
}

const chatOut = m => ({
  id: m.id,
  kind: m.kind,
  user: m.user ? { id: sid(m.user), name: m.name, photo: m.photo, vip: m.vip || 0, frame: m.frame || '' } : null,
  text: m.text,
  gift: m.gift,
  at: m.at,
})

/** What anyone may see about a live. `owner` is a User doc (or populated). */
export async function publicLive(live, owner) {
  owner = owner || (await User.findById(live.owner))
  const { guests, seats } = await guestList(live)
  return {
    id: sid(live._id),
    owner: owner ? owner.toPublic() : null,
    ownerUid: uidFor(live.owner), // Agora uid of the host's video
    mode: live.mode,
    title: live.title,
    cover: live.cover || owner?.toPublic().photo || null,
    welcome: live.welcome,
    category: live.category,
    premium: live.mode === 'premium',
    ticket: live.ticket,
    allowGuests: live.allowGuests,
    commentsFrom: live.commentsFrom,
    maxGuests: live.seats,
    status: live.status,
    startedAt: live.startedAt,
    endedAt: live.endedAt,
    endReason: live.endReason,
    viewers: live.viewers,
    peak: live.peak,
    diamonds: live.diamonds,
    guests,
    ...(seats ? { seats } : {}),
  }
}

/** Full view for GET /:id: recent chat and the caller's own state. */
export async function liveDetail(live, me) {
  const out = await publicLive(live)
  const isOwner = same(live.owner, me._id)
  out.chat = live.chat.map(chatOut)
  out.me = {
    isOwner,
    isGuest: live.guests.some(g => same(g.user, me._id)),
    watching: live.viewerIds.some(v => same(v, me._id)),
    hasTicket: live.mode !== 'premium' || isOwner || live.ticketHolders.some(t => same(t, me._id)),
    requested: live.requests.some(r => same(r.user, me._id)),
    canChat: canChat(live, me),
  }
  if (isOwner) out.requests = await requestList(live)
  return out
}

// ---------- moderation ----------

const CONTACT = [
  /\d(?:[\s.\-()]*\d){9,}/, // 10+ digit phone numbers, with separators
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, // e-mail
  /(https?:\/\/|www\.)\S+/i, // links
]

/** Throws if a message breaks the moderation rules (same rules as chat). */
export function moderate(text) {
  const { moderation } = getConfig().settings
  if (moderation.blockContactSharing && CONTACT.some(r => r.test(text))) {
    throw new ApiError(400, 'contact_blocked', 'Sharing phone numbers, e-mails or links isn’t allowed.')
  }
  const lower = text.toLowerCase()
  const hit = (moderation.autoFlagKeywords || []).find(k => k && lower.includes(String(k).toLowerCase()))
  if (hit) return { flagged: true, keyword: hit }
  return { flagged: false }
}

function canChat(live, user) {
  if (same(live.owner, user._id)) return true
  if (live.guests.some(g => same(g.user, user._id))) return true
  if (live.commentsFrom === 'nobody') return false
  if (live.commentsFrom === 'followers') return (user.following || []).some(f => same(f, live.owner))
  return true
}

// ---------- helpers ----------

async function getLive(id, { active = false } = {}) {
  if (!mongoose.isValidObjectId(id)) throw notFound('Live')
  const live = await Live.findById(id)
  if (!live) throw notFound('Live')
  if (active && live.status !== 'live') throw ended()
  return live
}

function assertOwner(live, user) {
  if (!same(live.owner, user._id)) throw forbidden('Only the host can do this.')
}

const followersOf = ownerId => User.find({ following: ownerId }, { _id: 1 }).lean()

const joinSockets = (userId, liveId) => getIo()?.in(`user:${userId}`).socketsJoin(room(liveId))
const leaveSockets = (userId, liveId) => getIo()?.in(`user:${userId}`).socketsLeave(room(liveId))

async function emitGuests(live) {
  toLive(live._id, 'live:guests', { liveId: sid(live._id), ...(await guestList(live)) })
}
async function emitRequests(live) {
  toUser(live.owner, 'live:requests', { liveId: sid(live._id), requests: await requestList(live) })
}

// ---------- start / browse ----------

export async function startLive(owner, { mode, title, cover, ticket, allowGuests, commentsFrom, welcome, category, replace }) {
  const { features, limits } = getConfig().settings
  if (isRoom(mode) && !features.rooms) throw forbidden('Rooms are turned off right now.')
  if (!isRoom(mode) && !features.goLive) throw forbidden('Going live is turned off right now.')
  // Going live and opening rooms is for women only (settings.hostApply.liveWomenOnly).
  // Men can still watch, join rooms and send gifts. Hosts who are men are held to it too.
  if (getConfig().settings.hostApply.liveWomenOnly && owner.gender === 'Male') {
    throw new ApiError(403, 'women_only_live', isRoom(mode) ? 'Creating rooms is available to women only.' : 'Going live is available to women only.')
  }
  if (mode === 'premium') {
    if (!features.premiumLive) throw forbidden('Premium lives are turned off right now.')
    if (!owner.host?.approved || owner.host.status !== 'active') throw forbidden('Only approved hosts can start a premium live.')
    if (!ticket) throw badRequest('Pick a ticket price.')
  }
  const existing = await Live.findOne({ owner: owner._id, status: 'live' }, { _id: 1 })
  // replace: the app lost its previous live (killed, crashed) and is starting over.
  if (existing && replace) await finishLive(existing._id, { reason: 'replaced', by: 'host' })
  else if (existing) throw conflict('You already have a live running.', 'already_live')

  const _id = new mongoose.Types.ObjectId()
  let live
  try {
    live = await Live.create({
      _id,
      owner: owner._id,
      mode,
      title,
      cover: cover || owner.toPublic().photo,
      welcome: isRoom(mode) ? welcome : undefined,
      category: isRoom(mode) ? category : undefined,
      ticket: mode === 'premium' ? ticket : 0,
      allowGuests: allowGuests ?? true,
      commentsFrom: commentsFrom || 'everyone',
      channel: channelName('live', _id),
      seats: isRoom(mode) ? limits.maxRoomSeats : limits.maxGuestsInLive,
      followersAtStart: await User.countDocuments({ following: owner._id }),
    })
  } catch (e) {
    if (e?.code === 11000) throw conflict('You already have a live running.', 'already_live')
    throw e
  }

  joinSockets(owner._id, live._id)
  const pub = await publicLive(live, owner)
  for (const f of await followersOf(owner._id)) toUser(f._id, 'live:started', { live: pub })
  toAdmins('live:started', { liveId: pub.id, mode })
  return { live: pub, agora: tokenFor(live, owner._id, 'publisher') }
}

export async function listLives({ modes, skip, limit }) {
  const q = { status: 'live' }
  if (modes?.length) q.mode = { $in: modes }
  const [rows, total] = await Promise.all([
    Live.find(q).sort({ viewers: -1, startedAt: -1 }).skip(skip).limit(limit).populate('owner'),
    Live.countDocuments(q),
  ])
  const items = []
  for (const l of rows) {
    if (!l.owner) continue
    const owner = l.owner
    l.owner = owner._id
    items.push(await publicLive(l, owner))
  }
  return { items, total }
}

export async function getLiveDetail(id, me) {
  return liveDetail(await getLive(id), me)
}

// ---------- join / leave ----------

export async function joinLive(id, user) {
  const live = await getLive(id, { active: true })
  const uid = user._id

  if (same(live.owner, uid)) {
    joinSockets(uid, live._id)
    return { live: await liveDetail(live, user), agora: tokenFor(live, uid, 'publisher') }
  }
  const owner = await User.findById(live.owner, { blocked: 1 })
  if (owner?.blocked?.some(b => same(b, uid))) throw forbidden('You can’t join this live.')
  // Host lives need a minimum balance to enter (admin-set); rooms are open to all.
  const min = getConfig().economy.minLiveBalance || 0
  const watching = live.viewerIds.some(v => same(v, uid)) || live.guests.some(g => same(g.user, uid))
  if (!isRoom(live.mode) && !watching && user.coins < min) {
    throw new ApiError(402, 'insufficient_coins', `You need at least ${min} coins to join a live.`, { needed: min, balance: user.coins })
  }

  // Premium: pay once per live. Claiming the ticket and paying share a
  // transaction, so a failed payment releases the claim and parallel joins
  // can't double-charge.
  let charged = 0
  let balance
  if (live.mode === 'premium') {
    const r = await withTxn(async s => {
      const claim = await Live.updateOne(
        { _id: live._id, ticketHolders: { $ne: uid } },
        { $addToSet: { ticketHolders: uid } },
        { session: s },
      )
      if (!claim.modifiedCount) return null
      return chargeUserPayHost(
        {
          userId: uid,
          hostId: live.owner,
          coins: live.ticket,
          source: 'ticket',
          txnType: 'ticket',
          title: `Ticket · ${live.title}`,
          ref: { kind: 'Live', id: live._id },
          detail: `Ticket for your live “${live.title}”`,
          fromName: user.name,
        },
        s,
      )
    })
    if (r) {
      charged = live.ticket
      balance = r.balance
    }
  }

  const wasWatching = live.viewerIds.some(v => same(v, uid))
  const updated = await Live.findOneAndUpdate(
    { _id: live._id, status: 'live' },
    { $addToSet: { viewerIds: uid, uniqueViewers: uid } },
    { returnDocument: 'after' },
  )
  if (!updated) throw ended()
  const viewers = updated.viewerIds.length
  updated.viewers = viewers
  updated.peak = Math.max(updated.peak, viewers)
  await Live.updateOne({ _id: live._id }, { $set: { viewers }, $max: { peak: viewers } })

  joinSockets(uid, live._id)
  if (!wasWatching) toLive(live._id, 'live:viewer_joined', { liveId: sid(live._id), user: user.toPublic(), viewers })

  const isGuest = updated.guests.some(g => same(g.user, uid))
  return {
    live: await liveDetail(updated, user),
    agora: tokenFor(updated, uid, isGuest ? 'publisher' : 'subscriber'),
    charged,
    ...(balance !== undefined ? { balance } : {}),
  }
}

/** Removes users from viewers/guests/requests and tells the room. */
async function dropUsers(live, userIds, reason = 'left') {
  const ids = userIds.map(id => new mongoose.Types.ObjectId(sid(id)))
  const hadGuest = live.guests.some(g => ids.some(i => same(i, g.user)))
  const hadRequest = live.requests.some(r => ids.some(i => same(i, r.user)))
  const updated = await Live.findByIdAndUpdate(
    live._id,
    { $pull: { viewerIds: { $in: ids }, guests: { user: { $in: ids } }, requests: { user: { $in: ids } } } },
    { returnDocument: 'after' },
  )
  if (!updated) return null
  updated.viewers = updated.viewerIds.length
  await Live.updateOne({ _id: live._id }, { $set: { viewers: updated.viewers } })
  for (const id of ids) {
    if (live.viewerIds.some(v => same(v, id))) {
      toLive(live._id, 'live:viewer_left', { liveId: sid(live._id), userId: sid(id), viewers: updated.viewers, reason })
    }
  }
  if (hadGuest) await emitGuests(updated)
  if (hadRequest) await emitRequests(updated)
  return updated
}

export async function leaveLive(id, user) {
  const live = await getLive(id)
  if (same(live.owner, user._id)) throw badRequest('End the live instead of leaving it.')
  if (live.status === 'live') await dropUsers(live, [user._id])
  leaveSockets(user._id, live._id)
  return { ok: true }
}

// ---------- chat ----------

export async function sendChat(id, user, text) {
  const live = await getLive(id, { active: true })
  const isOwner = same(live.owner, user._id)
  if (!isOwner && !live.viewerIds.some(v => same(v, user._id))) throw forbidden('Join the live to chat.')
  if (!canChat(live, user)) {
    throw forbidden(live.commentsFrom === 'followers' ? 'Only followers can comment in this live.' : 'Comments are off in this live.')
  }
  const mod = moderate(text)
  const pub = user.toPublic()
  if (mod.flagged) {
    // Held back from the room and sent to the moderators.
    toAdmins('moderation:flag', { kind: 'live_chat', liveId: sid(live._id), user: pub, text, keyword: mod.keyword })
    throw new ApiError(400, 'message_flagged', 'This message can’t be sent. Keep it friendly and safe.')
  }
  const msg = { id: crypto.randomUUID(), kind: 'text', user: user._id, name: pub.name, photo: pub.photo, vip: pub.vip, frame: pub.senderTier?.color || '', text, at: new Date() }
  await Live.updateOne({ _id: live._id }, { $push: { chat: { $each: [msg], $slice: -CHAT_KEEP } } })
  const message = chatOut(msg)
  toLive(live._id, 'live:chat', { liveId: sid(live._id), message })
  return { message }
}

// ---------- requests, guests, seats ----------

export async function requestJoin(id, user, seat) {
  const live = await getLive(id, { active: true })
  const uid = user._id
  if (same(live.owner, uid)) throw badRequest('You’re the host.')
  if (!live.allowGuests) throw forbidden('The host isn’t taking join requests.')
  if (!live.viewerIds.some(v => same(v, uid))) throw forbidden('Join the live first.')
  if (live.guests.some(g => same(g.user, uid))) throw conflict('You’re already on stage.', 'already_guest')
  if (seat != null && (!isRoom(live.mode) || seat >= live.seats)) throw badRequest('Invalid seat.')
  if (live.requests.some(r => same(r.user, uid))) return { ok: true, pending: true }

  const updated = await Live.findOneAndUpdate(
    { _id: live._id, status: 'live', 'requests.user': { $ne: uid } },
    { $push: { requests: { user: uid, seat: seat ?? null } } },
    { returnDocument: 'after' },
  )
  if (updated) {
    toUser(live.owner, 'live:request', { liveId: sid(live._id), user: user.toPublic(), seat: seat ?? null })
    await emitRequests(updated)
  }
  return { ok: true, pending: true }
}

export async function cancelRequest(id, user) {
  const live = await getLive(id)
  const updated = await Live.findByIdAndUpdate(live._id, { $pull: { requests: { user: user._id } } }, { returnDocument: 'after' })
  if (live.requests.some(r => same(r.user, user._id))) await emitRequests(updated)
  return { ok: true }
}

export async function acceptRequest(id, owner, userId) {
  userId = oid(userId)
  const live = await getLive(id, { active: true })
  assertOwner(live, owner)
  const req = live.requests.find(r => same(r.user, userId))
  if (!req) throw notFound('Join request')
  if (live.guests.some(g => same(g.user, userId))) throw conflict('Already on stage.', 'already_guest')
  if (live.guests.length >= live.seats) {
    throw conflict(isRoom(live.mode) ? 'All seats are taken.' : `You can have at most ${live.seats} guests.`, 'guests_full')
  }

  let seat = null
  if (isRoom(live.mode)) {
    const taken = new Set(live.guests.map(g => g.seat))
    seat = req.seat != null && !taken.has(req.seat) ? req.seat : [...Array(live.seats).keys()].find(i => !taken.has(i))
  }
  const uid = userId
  // Conditional update so two quick accepts can't exceed the limit or share a seat.
  const cond = {
    _id: live._id,
    status: 'live',
    'guests.user': { $ne: uid },
    $expr: { $lt: [{ $size: '$guests' }, live.seats] },
  }
  if (seat != null) cond['guests.seat'] = { $ne: seat }
  const updated = await Live.findOneAndUpdate(
    cond,
    { $push: { guests: { user: uid, seat } }, $pull: { requests: { user: uid } } },
    { returnDocument: 'after' },
  )
  if (!updated) throw conflict('That seat was just taken. Try again.', 'guests_full')

  toUser(uid, 'live:accepted', { liveId: sid(live._id), seat, agora: tokenFor(updated, uid, 'publisher') })
  await emitGuests(updated)
  await emitRequests(updated)
  return guestList(updated)
}

export async function declineRequest(id, owner, userId) {
  userId = oid(userId)
  const live = await getLive(id)
  assertOwner(live, owner)
  const updated = await Live.findByIdAndUpdate(live._id, { $pull: { requests: { user: userId } } }, { returnDocument: 'after' })
  if (live.requests.some(r => same(r.user, userId))) {
    toUser(userId, 'live:declined', { liveId: sid(live._id) })
    await emitRequests(updated)
  }
  return { ok: true }
}

/** Owner kicks a guest, or a guest steps down. They stay as a viewer. */
export async function removeGuest(id, actor, userId) {
  userId = oid(userId)
  const live = await getLive(id, { active: true })
  const self = same(actor._id, userId)
  if (!self) assertOwner(live, actor)
  if (!live.guests.some(g => same(g.user, userId))) throw notFound('Guest')
  const updated = await Live.findByIdAndUpdate(live._id, { $pull: { guests: { user: userId } } }, { returnDocument: 'after' })
  toUser(userId, 'live:removed', { liveId: sid(live._id), by: self ? 'self' : 'host', agora: tokenFor(updated, userId, 'subscriber') })
  await emitGuests(updated)
  return guestList(updated)
}

/** Owner mutes/unmutes a guest (guests may also mute themselves). */
export async function muteGuest(id, actor, userId, muted) {
  userId = oid(userId)
  const live = await getLive(id, { active: true })
  if (!same(actor._id, userId)) assertOwner(live, actor)
  const g = live.guests.find(x => same(x.user, userId))
  if (!g) throw notFound('Guest')
  const value = muted ?? !g.muted
  const updated = await Live.findOneAndUpdate(
    { _id: live._id, 'guests.user': userId },
    { $set: { 'guests.$.muted': value } },
    { returnDocument: 'after' },
  )
  toUser(userId, 'live:muted', { liveId: sid(live._id), muted: value, by: same(actor._id, userId) ? 'self' : 'host' })
  await emitGuests(updated)
  return guestList(updated)
}

// ---------- tokens ----------

export async function renewToken(id, user) {
  const live = await getLive(id, { active: true })
  const uid = user._id
  if (same(live.owner, uid) || live.guests.some(g => same(g.user, uid))) return { agora: tokenFor(live, uid, 'publisher') }
  if (live.viewerIds.some(v => same(v, uid))) return { agora: tokenFor(live, uid, 'subscriber') }
  throw forbidden('Join the live first.')
}

// ---------- gifts ----------

/**
 * Called by the gifts module after it has charged the sender for a gift sent
 * with context { type: 'live', id }. `gift` is { key, name, emoji, coins }
 * with `coins` = total coins spent (price × count). Updates diamonds and top
 * gifters and emits live:gift.
 */
export async function recordLiveGift(liveId, fromUser, gift) {
  const from = fromUser?.toPublic ? fromUser : await User.findById(sid(fromUser))
  if (!from) throw notFound('User')
  const coins = Number(gift?.coins) || 0
  const pub = from.toPublic()
  const g = { key: gift.key, name: gift.name, emoji: gift.emoji, coins, count: gift.count || 1, fullScreen: !!gift.fullScreen }
  const msg = { id: crypto.randomUUID(), kind: 'gift', user: from._id, name: pub.name, photo: pub.photo, vip: pub.vip, frame: pub.senderTier?.color || '', gift: g, at: new Date() }

  const bumped = await Live.findOneAndUpdate(
    { _id: liveId, 'gifters.user': from._id },
    { $inc: { diamonds: coins, 'gifters.$.coins': coins }, $set: { 'gifters.$.name': pub.name, 'gifters.$.photo': pub.photo }, $push: { chat: { $each: [msg], $slice: -CHAT_KEEP } } },
    { returnDocument: 'after', projection: { diamonds: 1 } },
  )
  const live =
    bumped ||
    (await Live.findByIdAndUpdate(
      liveId,
      { $inc: { diamonds: coins }, $push: { gifters: { user: from._id, name: pub.name, photo: pub.photo, coins }, chat: { $each: [msg], $slice: -CHAT_KEEP } } },
      { returnDocument: 'after', projection: { diamonds: 1 } },
    ))
  if (!live) throw notFound('Live')
  toLive(liveId, 'live:gift', { liveId: sid(liveId), from: pub, gift: g, message: chatOut(msg), diamonds: live.diamonds })
  return { diamonds: live.diamonds }
}

// ---------- end ----------

export async function liveSummary(live) {
  const gifters = new Map()
  for (const g of live.gifters) {
    const k = sid(g.user)
    const cur = gifters.get(k)
    if (cur) cur.coins += g.coins
    else gifters.set(k, { id: k, name: g.name, photo: g.photo, coins: g.coins })
  }
  const [earn] = await Earning.aggregate([
    { $match: { host: live.owner, 'ref.kind': 'Live', 'ref.id': live._id, status: { $ne: 'reversed' } } },
    { $group: { _id: null, net: { $sum: '$net' }, tickets: { $sum: { $cond: [{ $eq: ['$source', 'ticket'] }, 1, 0] } } } },
  ])
  const followers = await User.countDocuments({ following: live.owner })
  const end = live.endedAt || new Date()
  return {
    liveId: sid(live._id),
    title: live.title,
    mode: live.mode,
    premium: live.mode === 'premium',
    ticket: live.ticket,
    cover: live.cover,
    seconds: Math.max(0, Math.round((end - live.startedAt) / 1000)),
    totalViewers: live.uniqueViewers.length,
    peak: live.peak,
    diamonds: live.diamonds,
    followers: Math.max(0, followers - (live.followersAtStart || 0)),
    tickets: earn?.tickets || 0,
    gifters: [...gifters.values()].sort((a, b) => b.coins - a.coins).slice(0, 3),
    earned: Math.round((earn?.net || 0) * 100) / 100,
  }
}

async function finishLive(liveId, { status = 'ended', reason = 'ended', by = 'host' } = {}) {
  const live = await Live.findOneAndUpdate(
    { _id: liveId, status: 'live' },
    { $set: { status, endedAt: new Date(), endReason: reason, endedBy: by, viewers: 0, requests: [] } },
    { returnDocument: 'after' },
  )
  if (!live) return null
  toLive(live._id, 'live:ended', { liveId: sid(live._id), status, reason })
  toAdmins('live:ended', { liveId: sid(live._id), status, reason })
  getIo()?.in(room(live._id)).socketsLeave(room(live._id))
  return live
}

export async function endLive(id, owner) {
  const live = await getLive(id)
  assertOwner(live, owner)
  const done = (await finishLive(live._id, { reason: 'ended', by: 'host' })) || live
  return { live: await publicLive(done, owner), summary: await liveSummary(done) }
}

export async function getSummary(id, owner) {
  const live = await getLive(id)
  assertOwner(live, owner)
  return { summary: await liveSummary(live) }
}

/** For the admin module: take a live down (status `removed`). */
export async function endLiveByAdmin(liveId, reason, adminName) {
  const live = await finishLive(liveId, { status: 'removed', reason: reason || 'Removed by moderator', by: adminName || 'admin' })
  if (!live) {
    const cur = await Live.findById(liveId)
    if (!cur) throw notFound('Live')
    throw conflict('This live has already ended.', 'live_ended')
  }
  return live
}

// ---------- heartbeat cleanup ----------

/** Ends lives whose host has been offline > 60s; drops offline viewers. */
export async function sweepLives() {
  const now = Date.now()
  const lives = await Live.find({ status: 'live' }, { owner: 1, ownerSeenAt: 1, viewerIds: 1, guests: 1, requests: 1, mode: 1, seats: 1 })
  for (const live of lives) {
    try {
      if (isOnline(live.owner)) {
        await Live.updateOne({ _id: live._id }, { $set: { ownerSeenAt: new Date(now) } })
      } else if (now - (live.ownerSeenAt?.getTime() || 0) > OWNER_GRACE_MS) {
        await finishLive(live._id, { reason: 'host_disconnected', by: 'system' })
        continue
      }
      // Viewers rejoin via POST /:id/join after a reconnect.
      const gone = live.viewerIds.filter(v => !isOnline(v))
      if (gone.length) await dropUsers(live, gone, 'disconnected')
    } catch (e) {
      console.error('[lives] sweep', sid(live._id), e.message)
    }
  }
}

let timer = null
onStartup(async () => {
  // Lives left running by a previous process whose host hasn't been seen.
  const stale = await Live.find({ status: 'live', ownerSeenAt: { $lt: new Date(Date.now() - OWNER_GRACE_MS) } }, { _id: 1 })
  for (const l of stale) await finishLive(l._id, { reason: 'stale', by: 'system' })
  if (stale.length) console.log(`[lives] ended ${stale.length} stale live(s)`)
  timer = setInterval(() => sweepLives().catch(e => console.error('[lives] sweep', e.message)), SWEEP_MS)
  timer.unref?.()
})
onShutdown(() => clearInterval(timer))

/** A reconnecting socket (network blip, server restart) rejoins the lives its user is in. */
export async function rejoinLiveRooms(socket) {
  const id = socket.data.userId
  const lives = await Live.find(
    { status: 'live', $or: [{ owner: id }, { viewerIds: id }, { 'guests.user': id }] },
    { _id: 1 },
  ).lean()
  for (const l of lives) socket.join(room(l._id))
}
