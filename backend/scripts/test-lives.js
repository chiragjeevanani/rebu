// End-to-end checks for /api/lives against a running server.
//   MONGO_URI=... PORT=4103 npm start      (in another shell)
//   MONGO_URI=... PORT=4103 node --env-file-if-exists=.env scripts/test-lives.js
// (or BASE=http://host:port). Same MONGO_URI as the server.
// Tokens are signed directly (no OTP round-trips, so the OTP rate limit
// doesn't get in the way of re-runs).
import { io } from 'socket.io-client'
import { connectDb, disconnectDb } from '../src/config/db.js'
import { loadConfig } from '../src/modules/config/config.service.js'
import { signUserToken } from '../src/core/auth.js'
import { User } from '../src/modules/users/user.model.js'
import { Earning } from '../src/modules/earnings/earnings.models.js'
import { Live } from '../src/modules/lives/live.model.js'
import { creditCoins } from '../src/modules/wallet/economy.service.js'
import { recordLiveGift } from '../src/modules/lives/lives.service.js'

// Never run against the dev database by accident: these tests spend coins.
if (/\/rebu(\?|$)/.test(process.env.MONGO_URI || '') && !process.env.FORCE) {
  console.error('Refusing to run against the dev database (rebu). Use npm test, or set FORCE=1.')
  process.exit(1)
}

const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 4103}`
let pass = 0
let fail = 0
const ok = (cond, label, extra) => {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${label}`)
  } else {
    fail += 1
    console.log(`  ✗ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '')
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

await connectDb()
await loadConfig()

// ---------- users ----------
const phones = { demo: '9999999999', h1: '9000000001', h2: '9000000002', h3: '9000000003', h4: '9000000004', h5: '9000000005', h6: '9000000006' }
const U = {}
for (const [k, phone] of Object.entries(phones)) {
  const u = await User.findOne({ phone })
  if (!u) throw new Error(`Missing seed user ${phone} — run npm run seed`)
  U[k] = { doc: u, id: String(u._id), token: signUserToken(u), events: [] }
}
// Clean slate: end leftovers, top up coins, demo not following h1 yet.
await Live.updateMany({ owner: { $in: Object.values(U).map(u => u.doc._id) }, status: 'live' }, { $set: { status: 'ended', endedAt: new Date() } })
for (const k of ['demo', 'h2', 'h3', 'h4', 'h5', 'h6']) {
  const u = await User.findById(U[k].id)
  if (u.coins < 600) await creditCoins(u._id, 1000 - u.coins, { type: 'admin_adjust', title: 'test top-up' })
}
await User.updateOne({ _id: U.demo.id }, { $pull: { following: U.h1.doc._id } })

async function api(who, method, path, body) {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${U[who].token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await r.json().catch(() => ({}))
  return { status: r.status, ...json }
}

// ---------- sockets ----------
for (const [k, u] of Object.entries(U)) {
  u.socket = io(BASE, { auth: { token: u.token }, transports: ['websocket'] })
  u.socket.onAny((event, payload) => u.events.push({ event, payload }))
  await new Promise((res, rej) => {
    u.socket.once('connect', res)
    u.socket.once('connect_error', e => rej(new Error(`${k} socket: ${e.message}`)))
  })
}
const got = (who, event, pred = () => true) => U[who].events.some(e => e.event === event && pred(e.payload))
const last = (who, event) => [...U[who].events].reverse().find(e => e.event === event)?.payload
async function waitFor(who, event, pred, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (got(who, event, pred)) return true
    await sleep(25)
  }
  return false
}
const coinsOf = async k => (await User.findById(U[k].id, { coins: 1 })).coins

try {
  // ===== premium live =====
  console.log('\nPremium live')
  let r = await api('demo', 'POST', '/lives', { mode: 'premium', title: 'Nope', ticket: 100 })
  ok(r.status === 403, 'non-host cannot start a premium live', r)
  r = await api('h1', 'POST', '/lives', { mode: 'premium', title: 'Late night chat', ticket: 75 })
  ok(r.status === 400, 'ticket must be 50/100/200/500', r.status)

  r = await api('h1', 'POST', '/lives', { mode: 'premium', title: 'Late night chat', ticket: 100, commentsFrom: 'everyone' })
  ok(r.status === 201 && r.live?.premium && r.agora?.role === 'publisher', 'host starts premium live with publisher token', r)
  const liveId = r.live?.id
  ok(r.live?.maxGuests === 2, 'max guests = 2 from config', r.live?.maxGuests)
  r = await api('h1', 'POST', '/lives', { mode: 'live', title: 'Second' })
  ok(r.status === 409 && r.error?.code === 'already_live', 'one active live per user', r)

  // replace: an app that lost its live (killed mid-stream) starts over cleanly.
  r = await api('demo', 'POST', '/lives', { mode: 'live', title: 'Lost' })
  const lostId = r.live?.id
  r = await api('demo', 'POST', '/lives', { mode: 'live', title: 'Again', replace: true })
  ok(r.status === 201 && r.live?.id !== lostId, 'replace: true starts a new live over the old one', r)
  const again = r.live?.id
  r = await api('demo', 'GET', `/lives/${lostId}/summary`)
  ok(r.summary?.liveId === lostId, 'replaced live still has its summary', r)
  r = await api('demo', 'GET', '/lives?mode=live')
  ok(!r.items?.some(l => l.id === lostId), 'replaced live is no longer listed', r.items?.map(l => l.id))
  await api('demo', 'POST', `/lives/${again}/end`)

  r = await api('demo', 'GET', '/lives?mode=premium,live')
  ok(r.items?.some(l => l.id === liveId && l.owner?.id === U.h1.id && !l.owner.phone), 'GET /lives lists it with owner toPublic', r)

  const before = await coinsOf('demo')
  r = await api('demo', 'POST', `/lives/${liveId}/join`)
  ok(r.status === 200 && r.charged === 100 && r.agora?.role === 'subscriber', 'viewer pays ticket, gets subscriber token', r)
  ok((await coinsOf('demo')) === before - 100 && r.balance === before - 100, 'balance debited by 100', { before, balance: r.balance })
  const earnings = await Earning.find({ host: U.h1.id, 'ref.kind': 'Live', 'ref.id': liveId, source: 'ticket' })
  ok(earnings.length === 1 && earnings[0].coins === 100 && earnings[0].net > 0, 'host earning recorded (ticket, ref Live)', earnings.map(e => e.net))
  ok(await waitFor('h1', 'live:viewer_joined', p => p.user?.id === U.demo.id && p.viewers === 1), 'host gets live:viewer_joined')

  r = await api('demo', 'POST', `/lives/${liveId}/leave`)
  ok(r.ok, 'viewer leaves')
  ok(await waitFor('h1', 'live:viewer_left', p => p.userId === U.demo.id), 'host gets live:viewer_left')
  r = await api('demo', 'POST', `/lives/${liveId}/join`)
  ok(r.charged === 0 && (await coinsOf('demo')) === before - 100, 'rejoin is free', r.charged)
  ok(r.live?.me?.hasTicket === true, 'GET-shape me.hasTicket true')

  for (const k of ['h2', 'h3', 'h4']) {
    r = await api(k, 'POST', `/lives/${liveId}/join`)
    ok(r.charged === 100, `${k} joins and pays`, r)
  }

  // ===== chat =====
  console.log('\nChat')
  r = await api('demo', 'POST', `/lives/${liveId}/chat`, { text: 'Hello from Delhi!' })
  ok(r.message?.text === 'Hello from Delhi!', 'chat accepted', r)
  ok(await waitFor('h1', 'live:chat', p => p.message?.text === 'Hello from Delhi!'), 'host receives live:chat')
  ok(await waitFor('h2', 'live:chat', p => p.message?.user?.id === U.demo.id), 'other viewer receives live:chat')
  r = await api('demo', 'POST', `/lives/${liveId}/chat`, { text: 'call me 98765 43210' })
  ok(r.status === 400 && r.error?.code === 'contact_blocked', 'phone number blocked', r)
  r = await api('demo', 'POST', `/lives/${liveId}/chat`, { text: 'add me on WhatsApp' })
  ok(r.status === 400 && r.error?.code === 'message_flagged', 'flag keyword blocked', r)
  r = await api('h5', 'POST', `/lives/${liveId}/chat`, { text: 'hi' })
  ok(r.status === 403, 'non-viewer cannot chat', r.status)
  r = await api('h4', 'GET', `/lives/${liveId}`)
  ok(r.live?.chat?.some(m => m.text === 'Hello from Delhi!'), 'GET /:id returns recent chat for late joiners')

  // ===== guests =====
  console.log('\nJoin requests & guests')
  for (const k of ['h2', 'h3', 'h4']) {
    r = await api(k, 'POST', `/lives/${liveId}/requests`)
    ok(r.pending, `${k} asks to join`, r)
  }
  ok(await waitFor('h1', 'live:requests', p => p.requests?.length === 3), 'host gets live:requests (3)')
  r = await api('h1', 'GET', `/lives/${liveId}`)
  ok(r.live?.requests?.length === 3, 'owner sees requests in GET /:id')

  r = await api('h2', 'POST', `/lives/${liveId}/requests/${U.h3.id}/accept`)
  ok(r.status === 403, 'only owner can accept', r.status)
  r = await api('h1', 'POST', `/lives/${liveId}/requests/${U.h2.id}/accept`)
  ok(r.guests?.length === 1, 'accept guest 1', r)
  ok(await waitFor('h2', 'live:accepted', p => p.agora?.role === 'publisher'), 'guest gets live:accepted with publisher token')
  ok(await waitFor('demo', 'live:guests', p => p.guests?.length === 1 && p.guests[0].user.id === U.h2.id), 'room gets live:guests')
  r = await api('h1', 'POST', `/lives/${liveId}/requests/${U.h3.id}/accept`)
  ok(r.guests?.length === 2, 'accept guest 2', r)
  r = await api('h1', 'POST', `/lives/${liveId}/requests/${U.h4.id}/accept`)
  ok(r.status === 409 && r.error?.code === 'guests_full', '3rd guest rejected (max 2)', r)
  r = await api('h1', 'POST', `/lives/${liveId}/requests/${U.h4.id}/decline`)
  ok(r.ok && (await waitFor('h4', 'live:declined')), 'decline → live:declined')

  r = await api('h1', 'POST', `/lives/${liveId}/guests/${U.h2.id}/mute`, { muted: true })
  ok(r.guests?.find(g => g.user.id === U.h2.id)?.muted === true, 'owner mutes guest')
  ok(await waitFor('h2', 'live:muted', p => p.muted === true), 'guest gets live:muted')
  r = await api('h2', 'POST', `/lives/${liveId}/token`)
  ok(r.agora?.role === 'publisher', 'guest token renewal = publisher')
  r = await api('demo', 'POST', `/lives/${liveId}/token`)
  ok(r.agora?.role === 'subscriber', 'viewer token renewal = subscriber')
  r = await api('h5', 'POST', `/lives/${liveId}/token`)
  ok(r.status === 403, 'non-participant token refused')

  r = await api('h1', 'POST', `/lives/${liveId}/guests/${U.h3.id}/remove`)
  ok(r.guests?.length === 1, 'owner removes guest')
  ok(await waitFor('h3', 'live:removed', p => p.by === 'host' && p.agora?.role === 'subscriber'), 'removed guest gets live:removed + subscriber token')

  // ===== gifts (what /api/gifts will call) + follower =====
  await recordLiveGift(liveId, U.demo.id, { key: 'rose', name: 'Rose', emoji: '🌹', coins: 20, count: 2 })
  await recordLiveGift(liveId, U.h2.doc, { key: 'teddy', name: 'Teddy', emoji: '🧸', coins: 99 })
  await recordLiveGift(liveId, U.demo.id, { key: 'rose', name: 'Rose', emoji: '🌹', coins: 10 })
  await User.updateOne({ _id: U.demo.id }, { $addToSet: { following: U.h1.doc._id } })

  // ===== end =====
  console.log('\nEnd + summary')
  r = await api('demo', 'POST', `/lives/${liveId}/end`)
  ok(r.status === 403, 'only owner can end')
  r = await api('h1', 'POST', `/lives/${liveId}/end`)
  const s = r.summary
  const [agg] = await Earning.aggregate([{ $match: { 'ref.kind': 'Live', 'ref.id': (await Live.findById(liveId))._id } }, { $group: { _id: null, net: { $sum: '$net' } } }])
  ok(r.live?.status === 'ended', 'live status ended')
  ok(s && s.seconds >= 0 && s.totalViewers === 4 && s.peak === 4, 'summary viewers/peak', s)
  ok(s?.diamonds === 129, 'summary diamonds = gift coins', s?.diamonds)
  ok(s?.gifters?.[0]?.id === U.h2.id && s.gifters[1]?.coins === 30, 'top gifters sorted', s?.gifters)
  ok(s?.followers === 1, 'new followers tracked', s?.followers)
  ok(s?.tickets === 4 && Math.abs(s.earned - agg.net) < 0.01 && s.earned > 0, `earned ₹${s?.earned} matches earnings`, { s, agg })
  ok(await waitFor('demo', 'live:ended', p => p.liveId === liveId), 'room gets live:ended')
  r = await api('demo', 'POST', `/lives/${liveId}/join`)
  ok(r.status === 409 && r.error?.code === 'live_ended', 'cannot join an ended live')

  // ===== party room =====
  console.log('\nParty room')
  r = await api('demo', 'POST', '/lives', { mode: 'party', title: 'Arjun’s room', welcome: 'Welcome!', category: 'Chat' })
  ok(r.status === 201 && r.live?.seats?.length === 8 && r.live.seats.every(x => x === null), 'any user starts a party room with 8 seats', r)
  const roomId = r.live?.id
  for (const k of ['h5', 'h6']) await api(k, 'POST', `/lives/${roomId}/join`)
  r = await api('h5', 'POST', `/lives/${roomId}/requests`, { seat: 3 })
  ok(r.pending, 'h5 asks for seat 3')
  r = await api('h6', 'POST', `/lives/${roomId}/requests`, { seat: 3 })
  r = await api('h6', 'POST', `/lives/${roomId}/requests`, { seat: 9 })
  ok(r.status === 400, 'invalid seat rejected')
  r = await api('demo', 'POST', `/lives/${roomId}/requests/${U.h5.id}/accept`)
  ok(r.seats?.[3]?.user?.id === U.h5.id, 'h5 seated at 3', r.seats?.map(x => x?.user?.id || null))
  ok(await waitFor('h5', 'live:accepted', p => p.seat === 3 && p.agora?.role === 'publisher'), 'h5 gets live:accepted seat 3')
  r = await api('demo', 'POST', `/lives/${roomId}/requests/${U.h6.id}/accept`)
  ok(r.seats?.[0]?.user?.id === U.h6.id, 'h6 wanted taken seat 3 → gets first free seat 0')
  r = await api('h6', 'POST', `/lives/${roomId}/guests/${U.h6.id}/remove`)
  ok(r.seats?.[0] === null, 'guest leaves seat themselves')
  r = await api('demo', 'POST', `/lives/${roomId}/end`)
  ok(r.summary?.mode === 'party' && r.summary.totalViewers === 2, 'party ends with summary', r.summary)

  // ===== audio room =====
  r = await api('h6', 'POST', '/lives', { mode: 'audio', title: 'Late night talk' })
  ok(r.status === 201 && r.live?.seats?.length === 8, 'audio room starts with seats')
  await api('h6', 'POST', `/lives/${r.live.id}/end`)
} catch (e) {
  fail += 1
  console.error('test crashed:', e)
} finally {
  for (const u of Object.values(U)) u.socket?.close()
  await disconnectDb()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
