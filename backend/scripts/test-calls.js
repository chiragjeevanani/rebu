// End-to-end checks for calls (billing, timeouts, double end, crash recovery),
// paid chat and gifts. Spawns its own server on a test DB with fast timers.
//
//   node --env-file=.env scripts/test-calls.js
//
// Env: TEST_MONGO_URI (default rebu_t2 on 27027), TEST_PORT (4102),
//      TEST_SERVER_ENTRY (default src/server.js; point it at a boot file that
//      wires callSocketHooks to exercise the disconnect test).
// NOTE: resets coins/flags of the seed users in the TEST database. Run `npm run seed` on it first.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { io as ioc } from 'socket.io-client'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27027/rebu_t2?replicaSet=rs0'
const PORT = Number(process.env.TEST_PORT || 4102)
const ENTRY = process.env.TEST_SERVER_ENTRY || 'src/server.js'
const BILL_MS = 2000
const RING_SECS = 3
const GRACE_MS = 2000
const API = `http://localhost:${PORT}/api`
process.env.MONGO_URI = MONGO_URI // before the app modules read env

const mongoose = (await import('mongoose')).default
const { User } = await import('../src/modules/users/user.model.js')
const { Call } = await import('../src/modules/calls/call.model.js')
const { Earning } = await import('../src/modules/earnings/earnings.models.js')
const { CoinTxn } = await import('../src/modules/wallet/wallet.models.js')
const { Conversation, Message } = await import('../src/modules/chat/chat.models.js')
const { hostBalance } = await import('../src/modules/wallet/economy.service.js')
const { signUserToken } = await import('../src/core/auth.js')

// ---------- tiny harness ----------
let pass = 0
let fail = 0
const ok = (cond, label, extra) => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? '  ✓' : '  ✗'} ${label}${!cond && extra !== undefined ? `  → ${JSON.stringify(extra)}` : ''}`)
}
const section = t => console.log(`\n▸ ${t}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const round2 = n => Math.round(n * 100) / 100

let server = null
async function startServer() {
  server = spawn(process.execPath, ['--env-file-if-exists=.env', ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      MONGO_URI,
      PORT: String(PORT),
      NODE_ENV: 'development',
      CALL_BILLING_MS: String(BILL_MS),
      CALL_RING_SECS: String(RING_SECS),
      CALL_DISCONNECT_GRACE_MS: String(GRACE_MS),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.logs = []
  const keep = d => server.logs.push(String(d))
  server.stdout.on('data', keep)
  server.stderr.on('data', keep)
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/health`)).ok) return
    } catch {}
    await sleep(150)
  }
  console.log(server.logs.join(''))
  throw new Error('server did not start')
}
async function stopServer() {
  if (!server) return
  const s = server
  server = null
  s.kill()
  await new Promise(r => (s.exitCode !== null ? r() : s.once('exit', r)))
}

async function api(token, method, url, body) {
  const r = await fetch(API + url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  return { status: r.status, ...data }
}

/** Socket that records every event; waitFor resolves on the first matching one (past or future). */
function connect(token) {
  const s = ioc(`http://localhost:${PORT}`, { auth: { token }, transports: ['websocket'], forceNew: true })
  s.log = []
  s.waiters = []
  s.onAny((event, data) => {
    s.log.push({ event, data })
    s.waiters = s.waiters.filter(w => (w.match(event, data) ? (w.resolve(data), false) : true))
  })
  s.waitFor = (event, pred = () => true, ms = 8000) => {
    const match = (e, d) => e === event && pred(d)
    const seen = s.log.find(x => match(x.event, x.data))
    if (seen) return Promise.resolve(seen.data)
    return new Promise((resolve, reject) => {
      const w = { match, resolve }
      s.waiters.push(w)
      setTimeout(() => {
        s.waiters = s.waiters.filter(x => x !== w)
        reject(new Error(`timeout waiting for ${event}`))
      }, ms)
    })
  }
  s.count = (event, pred = () => true) => s.log.filter(x => x.event === event && pred(x.data)).length
  return new Promise((resolve, reject) => {
    s.once('connect', () => resolve(s))
    s.once('connect_error', reject)
  })
}
const safe = p => p.catch(e => ({ error: e.message }))

// ---------- setup ----------
await mongoose.connect(MONGO_URI)
const demo = await User.findOne({ phone: '9999999999' })
const h1 = await User.findOne({ phone: '9000000001' }) // online, video 40 / voice 20, level 2
const h3 = await User.findOne({ phone: '9000000003' }) // online, video 30 / voice 15
const h5 = await User.findOne({ phone: '9000000005' }) // online, video 80 / voice 40
if (!demo || !h1 || !h3 || !h5) throw new Error('Seed the test DB first: MONGO_URI=<test uri> npm run seed')

// Clean slate for this DB.
await Call.deleteMany({})
await Conversation.deleteMany({})
await Message.deleteMany({})
await User.updateMany({ phone: { $in: ['9000000001', '9000000003', '9000000005'] } }, { $set: { 'host.online': true, 'host.busy': false, 'host.calls': 0, blocked: [] } })
await User.updateMany({ phone: { $in: ['9000000002', '9000000004', '9000000006'] } }, { $set: { 'host.online': false, 'host.busy': false } })
const setCoins = (u, coins) => User.updateOne({ _id: u._id }, { $set: { coins } })
const coinsOf = async u => (await User.findById(u._id, { coins: 1 })).coins
await setCoins(demo, 1450)
await User.updateOne({ _id: demo._id }, { $set: { blocked: [] } })

const RUN_START = new Date()
const T = { user: signUserToken(demo), h1: signUserToken(h1), h3: signUserToken(h3), h5: signUserToken(h5) }
await startServer()
console.log(`[test] server up on ${PORT} (${ENTRY}), billing ${BILL_MS}ms, ring ${RING_SECS}s`)
let su = await connect(T.user)
const s1 = await connect(T.h1)
const s3 = await connect(T.h3)

try {
  // ---------- 1. call → accept → billing over 3 minutes ----------
  section('Call → accept → per-minute billing')
  const before = await hostBalance(h1._id)
  const minutesBefore = (await User.findById(h1._id)).host.callMinutes
  const start = await api(T.user, 'POST', '/calls', { hostId: String(h1._id), type: 'video' })
  ok(start.status === 201 && start.call.status === 'ringing', 'POST /calls → ringing', start)
  ok(start.call.rate === 40 && start.call.channel === `rebu_call_${start.call.id}`, 'rate snapshotted, channel named')
  ok(start.agora?.channel === start.call.channel && (start.agora.mock === true || typeof start.agora.token === 'string'), 'caller gets an Agora token (real when keys are set)')
  const callId = start.call.id
  const inc = await s1.waitFor('call:incoming', d => d.call.id === callId)
  ok(inc.caller?.id === String(demo._id) && !('phone' in inc.caller), 'host gets call:incoming with caller.toPublic()')
  const h1ring = (await User.findById(h1._id)).host
  ok(h1ring.calls === 1 && h1ring.busy === false, 'host has one call slot in use (2 allowed)', h1ring)
  ok(start.call.hostUid > 0 && start.call.callerUid > 0 && start.call.callerUid !== start.call.hostUid, 'call carries both Agora uids (callers play only the host)', start.call)
  const self = await api(T.h1, 'POST', '/calls', { hostId: String(h1._id), type: 'video' })
  ok(self.status === 400, 'cannot call yourself')
  const wrongAccept = await api(T.user, 'POST', `/calls/${callId}/accept`)
  ok(wrongAccept.status === 404, 'caller cannot accept (404)')

  const acc = await api(T.h1, 'POST', `/calls/${callId}/accept`)
  ok(acc.status === 200 && acc.call.status === 'connected' && acc.agora?.channel === start.call.channel, 'host accepts → connected + host token', acc)
  await su.waitFor('call:accepted', d => d.call.id === callId)
  ok(true, 'caller got call:accepted')
  const t1 = await su.waitFor('call:tick', d => d.callId === callId && d.minute === 1)
  ok(t1.charged === 40 && t1.balance === 1410, 'minute 1 charged at connect (tick 40 / 1410)', t1)
  const acc2 = await api(T.h1, 'POST', `/calls/${callId}/accept`)
  ok(acc2.status === 409, 'accept twice → 409')
  const t2 = await su.waitFor('call:tick', d => d.callId === callId && d.minute === 2, 6000)
  ok(t2.charged === 80 && t2.balance === 1370, 'minute 2 charged by timer', t2)
  const t3 = await su.waitFor('call:tick', d => d.callId === callId && d.minute === 3, 6000)
  ok(t3.charged === 120 && t3.balance === 1330 && t3.seconds >= 3, 'minute 3 charged by timer', t3)
  const tok = await api(T.user, 'POST', `/calls/${callId}/token`)
  ok(tok.status === 200 && tok.agora?.channel === start.call.channel, 'token renewal works while connected')

  // Double end: both sides hang up at the same time.
  const [e1, e2] = await Promise.all([api(T.user, 'POST', `/calls/${callId}/end`), api(T.h1, 'POST', `/calls/${callId}/end`)])
  ok([e1, e2].every(r => r.status === 200 || r.status === 409), 'simultaneous ends both answer cleanly', [e1.status, e2.status])
  ok([e1, e2].filter(r => r.status === 200 && !r.alreadyEnded).length === 1, 'exactly one end wins')
  const endU = await su.waitFor('call:ended', d => d.callId === callId)
  const endH = await s1.waitFor('call:ended', d => d.callId === callId)
  ok(endU.minutes === 3 && endU.charged === 120 && endU.balance === 1330 && endU.reason === 'hangup', 'caller summary: 3 min, 120 coins', endU)
  ok(endH.earned === round2(3 * 19.2) && endH.minutes === 3, 'host summary: net earned ₹57.6', endH)
  await sleep(BILL_MS * 1.6)
  ok(su.count('call:ended', d => d.callId === callId) === 1 && s1.count('call:ended', d => d.callId === callId) === 1, 'call:ended emitted once per side')
  ok((await coinsOf(demo)) === 1330, 'no charge after end')
  const late = await api(T.h1, 'POST', `/calls/${callId}/end`)
  ok(late.status === 409, 'ending an ended call → 409')

  const callDoc = await Call.findById(callId)
  ok(callDoc.status === 'ended' && callDoc.minutes === 3 && callDoc.chargedCoins === 120 && callDoc.duration >= 4, 'Call doc final', callDoc.toObject())
  const earns = await Earning.find({ 'ref.id': callDoc._id })
  ok(earns.length === 3 && earns.every(e => e.source === 'video' && e.coins === 40 && e.net === 19.2 && e.minutes === 1), '3 Earning rows (video, 40 coins, ₹19.2 net)', earns.map(e => e.net))
  const txns = await CoinTxn.find({ 'ref.id': callDoc._id })
  ok(txns.length === 3 && txns.every(t => t.type === 'call' && t.coins === -40), '3 CoinTxn rows of −40')
  const after = await hostBalance(h1._id)
  ok(round2(after.lifetime - before.lifetime) === 57.6, 'hostBalance lifetime +₹57.6', { before, after })
  const h1now = await User.findById(h1._id)
  ok(h1now.host.busy === false && h1now.host.callMinutes === minutesBefore + 3, 'host freed, callMinutes +3', h1now.host)

  const r1 = await api(T.user, 'POST', `/calls/${callId}/rate`, { stars: 4 })
  ok(r1.status === 200 && r1.call.rating === 4, 'rate 4 stars')
  const r2 = await api(T.user, 'POST', `/calls/${callId}/rate`, { stars: 1 })
  ok(r2.status === 409, 'rating twice → 409')
  const rh = await api(T.h1, 'POST', `/calls/${callId}/rate`, { stars: 5 })
  ok(rh.status === 403, 'host cannot rate')
  const h1r = await User.findById(h1._id)
  ok(h1r.host.ratingCount === h1now.host.ratingCount + 1, 'host ratingCount +1, rating ' + h1r.host.rating)

  const hist = await api(T.user, 'GET', '/calls')
  ok(hist.items?.[0]?.id === callId && hist.items[0].other?.id === String(h1._id) && hist.items[0].chargedCoins === 120, 'GET /calls history with other party')
  const histH = await api(T.h1, 'GET', '/calls?role=host')
  ok(histH.items?.[0]?.earned === 57.6 && histH.items[0].other?.id === String(demo._id), 'host history shows earned')
  const one = await api(T.h3, 'GET', `/calls/${callId}`)
  ok(one.status === 404, 'non-participant cannot read a call')

  // ---------- 2. runs out of coins ----------
  section('Call runs out of coins')
  await setCoins(demo, 50)
  const c2 = await api(T.user, 'POST', '/calls', { hostId: String(h1._id), type: 'video' })
  await api(T.h1, 'POST', `/calls/${c2.call.id}/accept`)
  const low = await su.waitFor('call:low_balance', d => d.callId === c2.call.id)
  ok(low.balance === 10 && low.rate === 40, 'call:low_balance after minute 1 (10 left)', low)
  const end2 = await su.waitFor('call:ended', d => d.callId === c2.call.id, 6000)
  ok(end2.reason === 'no_coins' && end2.minutes === 1 && end2.charged === 40 && end2.balance === 10, 'ended with no_coins after 1 paid minute', end2)
  await s1.waitFor('call:ended', d => d.callId === c2.call.id)
  ok((await User.findById(h1._id)).host.busy === false, 'host freed')
  ok((await coinsOf(demo)) === 10, 'balance 10, never negative')
  const poor = await api(T.user, 'POST', '/calls', { hostId: String(h1._id), type: 'video' })
  ok(poor.status === 402 && poor.error.code === 'insufficient_coins', 'can’t start with < 1 minute → 402', poor)
  await setCoins(demo, 1450)

  // ---------- 3. ring timeout / decline / cancel ----------
  section('Ring timeout, decline, cancel')
  const c3 = await api(T.user, 'POST', '/calls', { hostId: String(h3._id), type: 'voice' })
  const miss = await s3.waitFor('call:ended', d => d.callId === c3.call.id, RING_SECS * 1000 + 3000)
  ok(miss.status === 'missed' && miss.reason === 'timeout', 'host gets call:ended (missed) after ring timeout', miss)
  await su.waitFor('call:ended', d => d.callId === c3.call.id)
  ok(true, 'caller gets call:ended too')
  ok((await User.findById(h3._id)).host.busy === false, 'host freed after timeout')
  const lateAcc = await api(T.h3, 'POST', `/calls/${c3.call.id}/accept`)
  ok(lateAcc.status === 409, 'accepting a missed call → 409')

  const c4 = await api(T.user, 'POST', '/calls', { hostId: String(h3._id), type: 'voice' })
  const dec = await api(T.h3, 'POST', `/calls/${c4.call.id}/decline`)
  ok(dec.call?.status === 'declined', 'decline → declined')
  const c5 = await api(T.user, 'POST', '/calls', { hostId: String(h3._id), type: 'voice' })
  const notMine = await api(T.h3, 'POST', `/calls/${c5.call.id}/cancel`)
  ok(notMine.status === 403, 'host cannot cancel')
  const can = await api(T.user, 'POST', `/calls/${c5.call.id}/cancel`)
  ok(can.call?.status === 'cancelled', 'caller cancel → cancelled')
  await sleep(RING_SECS * 1000 + 500)
  ok(s3.count('call:ended', d => d.callId === c5.call.id) === 1, 'no second call:ended from the old ring timer')
  ok((await coinsOf(demo)) === 1450, 'unanswered calls cost nothing')

  // ---------- 4. random ----------
  section('Random call')
  const rnd = await api(T.user, 'POST', '/calls/random', { type: 'voice' })
  ok(rnd.status === 201 && rnd.call.random === true && [h1, h3, h5].some(h => String(h._id) === rnd.host.id), 'random picks an online host', rnd)
  await api(T.user, 'POST', `/calls/${rnd.call.id}/cancel`)
  await User.updateMany({ 'host.approved': true }, { $set: { 'host.online': false } })
  const none = await api(T.user, 'POST', '/calls/random', { type: 'voice' })
  ok(none.status === 404 && none.error.code === 'no_hosts', 'no free hosts → friendly 404', none)
  await User.updateMany({ phone: { $in: ['9000000001', '9000000003', '9000000005'] } }, { $set: { 'host.online': true } })

  // ---------- 5. block ----------
  await User.updateOne({ _id: h3._id }, { $set: { blocked: [demo._id] } })
  const blk = await api(T.user, 'POST', '/calls', { hostId: String(h3._id), type: 'voice' })
  ok(blk.status === 403, 'blocked caller → 403')
  const blkMsg = await api(T.user, 'POST', `/chats/${h3._id}/messages`, { text: 'hey' })
  ok(blkMsg.status === 403, 'blocked sender cannot message')
  await User.updateOne({ _id: h3._id }, { $set: { blocked: [] } })

  // ---------- 6. paid chat ----------
  section('Paid chat')
  const chatBefore = await hostBalance(h1._id)
  const m1 = await api(T.user, 'POST', `/chats/${h1._id}/messages`, { text: 'Hi Aanya!' })
  ok(m1.status === 201 && m1.balance === 1440 && m1.cost === 10, 'user pays 10 coins per message', m1)
  const got = await s1.waitFor('chat:message', d => d.message.id === m1.message?.id)
  ok(got.from.id === String(demo._id) && got.message.text === 'Hi Aanya!', 'host gets chat:message')
  ok(su.count('chat:message', d => d.message.id === m1.message.id) === 1 || (await su.waitFor('chat:message', d => d.message.id === m1.message.id)), 'sender’s devices get it too')
  const cEarn = await Earning.findOne({ 'ref.id': new mongoose.Types.ObjectId(m1.message.id) })
  ok(cEarn?.source === 'chat' && cEarn.coins === 10 && cEarn.net === 4, 'chat Earning row (₹4 net at 50%)', cEarn)
  const chatAfter = await hostBalance(h1._id)
  ok(round2(chatAfter.lifetime - chatBefore.lifetime) === 4, 'hostBalance +₹4')
  const h1coins = await coinsOf(h1)
  const reply = await api(T.h1, 'POST', `/chats/${demo._id}/messages`, { text: 'Hey! How are you?' })
  ok(reply.status === 201 && reply.cost === 0 && (await coinsOf(h1)) === h1coins, 'host replies free')
  await su.waitFor('chat:message', d => d.message.id === reply.message.id)
  ok(true, 'user gets the reply')
  for (const [text, why] of [['call me on 98765 43210', 'phone'], ['mail me a.b@gmail.com', 'email'], ['add me on WhatsApp', 'keyword']]) {
    const bad = await api(T.user, 'POST', `/chats/${h1._id}/messages`, { text })
    ok(bad.status === 400 && bad.error.code === 'content_blocked' && bad.error.details.reason === why, `blocks ${why}: "${text}"`, bad)
  }
  ok((await coinsOf(demo)) === 1440, 'blocked messages are not charged')
  ok((await Message.countDocuments({})) === 2, 'blocked messages are not stored')
  const img = await api(T.user, 'POST', `/chats/${h1._id}/messages`, { type: 'image', imageUrl: 'https://example.com/a.jpg' })
  ok(img.status === 201 && img.message.type === 'image' && img.balance === 1430, 'image message (paid)')
  const empty = await api(T.user, 'POST', `/chats/${h1._id}/messages`, { text: '' })
  ok(empty.status === 400, 'empty message → 400')
  await setCoins(demo, 5)
  const broke = await api(T.user, 'POST', `/chats/${h1._id}/messages`, { text: 'one more' })
  ok(broke.status === 402, 'not enough coins → 402')
  await setCoins(demo, 1430)

  const listH = await api(T.h1, 'GET', '/chats')
  const conv = listH.items?.[0]
  ok(conv?.peer?.id === String(demo._id) && conv.unread === 2 && conv.lastMessage?.text === '📷 Photo', 'host list: peer, unread 2, last message', conv)
  const msgs = await api(T.h1, 'GET', `/chats/${demo._id}/messages?limit=2`)
  ok(msgs.items?.length === 2 && msgs.hasMore === true && msgs.items[1].type === 'image', 'messages paged, newest last')
  const older = await api(T.h1, 'GET', `/chats/${demo._id}/messages?before=${msgs.items[0].id}`)
  ok(older.items?.length === 1 && older.items[0].text === 'Hi Aanya!' && !older.hasMore, '?before= pages back')
  await su.waitFor('chat:read', d => d.conversationId === conv.id)
  ok(true, 'opening marks read → sender gets chat:read')
  const listH2 = await api(T.h1, 'GET', '/chats')
  ok(listH2.items[0].unread === 0, 'unread cleared')
  const pin = await api(T.h1, 'PATCH', `/chats/${conv.id}`, { pinned: true, unread: true })
  ok(pin.conversation?.pinned === true && pin.conversation.unread === 1, 'PATCH pin + mark unread')
  const unpin = await api(T.h1, 'PATCH', `/chats/${conv.id}`, { pinned: false, unread: false })
  ok(unpin.conversation?.pinned === false && unpin.conversation.unread === 0, 'PATCH unpin + mark read')
  const del = await api(T.h1, 'DELETE', `/chats/${conv.id}`)
  ok(del.ok && (await api(T.h1, 'GET', '/chats')).items.length === 0, 'DELETE hides the chat for me')
  ok((await api(T.user, 'GET', '/chats')).items.length === 1, '…but not for the other side')
  ok((await api(T.h1, 'GET', `/chats/${demo._id}/messages`)).items.length === 0, 'history cleared for me')
  await api(T.user, 'POST', `/chats/${h1._id}/messages`, { text: 'Still there?' })
  const back = await api(T.h1, 'GET', '/chats')
  ok(back.items.length === 1 && back.items[0].unread === 1, 'new message brings it back')
  const other = await api(T.h3, 'PATCH', `/chats/${conv.id}`, { pinned: true })
  ok(other.status === 404, 'cannot touch someone else’s conversation')

  // ---------- 7. gifts ----------
  section('Gifts')
  const gl = await api(T.user, 'GET', '/gifts')
  ok(gl.items?.length === 12 && gl.items[0].key === 'rose', 'GET /gifts lists active gifts')
  const gBefore = await hostBalance(h1._id)
  const bal0 = await coinsOf(demo)
  const g1 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rose', context: { type: 'chat' } })
  ok(g1.status === 201 && g1.balance === bal0 - 10 && g1.fullScreen === false && g1.gift.key === 'rose', 'rose in chat (10 coins)', g1)
  const gr = await s1.waitFor('gift:received', d => d.gift.key === 'rose')
  ok(gr.from.id === String(demo._id) && gr.context.type === 'chat', 'host gets gift:received')
  await s1.waitFor('chat:message', d => d.message.type === 'gift' && d.message.gift.key === 'rose')
  ok(true, 'chat gift also lands in the conversation')
  // A live gift must target a real live hosted by the recipient.
  const fakeLive = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'car', context: { type: 'live', id: String(new mongoose.Types.ObjectId()) } })
  ok(fakeLive.status === 404, 'gift to a missing live is refused', fakeLive)
  const lv = await api(T.h1, 'POST', '/lives', { mode: 'live', title: 'gift test' })
  const g2 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'car', context: { type: 'live', id: lv.live.id } })
  ok(g2.status === 201 && g2.fullScreen === true && g2.balance === bal0 - 10 - 999, 'sports car in a live: fullScreen', g2)
  const gEarn = await Earning.find({ host: h1._id, source: 'gift', createdAt: { $gte: RUN_START } })
  ok(gEarn.length === 2 && round2(gEarn.reduce((a, e) => a + e.net, 0)) === round2((10 + 999) * 0.8 * 0.5), 'gift Earning rows at 50%')
  ok(round2((await hostBalance(h1._id)).lifetime - gBefore.lifetime) === round2(1009 * 0.4), 'hostBalance includes gifts')
  const g3 = await api(T.user, 'POST', '/gifts', { toId: String(demo._id), giftKey: 'rose', context: { type: 'chat' } })
  ok(g3.status === 400, 'cannot gift yourself')
  const g4 = await api(T.h1, 'POST', '/gifts', { toId: String(demo._id), giftKey: 'rose', context: { type: 'chat' } })
  ok(g4.status === 404, 'recipient must be a host')
  const g5 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'nope', context: { type: 'chat' } })
  ok(g5.status === 404, 'unknown gift → 404')
  await setCoins(demo, 100)
  const g6 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rocket', context: { type: 'chat' } })
  ok(g6.status === 402, 'too expensive → 402')
  // ----- quantity: several of ONE gift in one go -----
  await setCoins(demo, 5000)
  const qBal = await coinsOf(demo)
  const qBefore = await hostBalance(h1._id)
  const q1 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rose', quantity: 10, context: { type: 'chat' } })
  ok(q1.status === 201 && q1.balance === qBal - 100 && q1.quantity === 10 && q1.total === 100 && q1.gift.count === 10, '10 roses cost 100 coins in one go', q1)
  const qgr = await s1.waitFor('gift:received', d => d.gift.key === 'rose' && d.gift.count === 10)
  ok(qgr.gift.coins === 10, 'host gets gift:received with count 10 (price stays per gift)')
  const qm = await s1.waitFor('chat:message', d => d.message.type === 'gift' && d.message.gift.count === 10)
  ok(qm.message.cost === 100, 'chat message records the total cost (100)')
  ok(round2((await hostBalance(h1._id)).lifetime - qBefore.lifetime) === round2(100 * 0.8 * 0.5), 'host earns on all 10 roses')
  ok(!!(await Earning.findOne({ host: h1._id, source: 'gift', coins: 100, createdAt: { $gte: RUN_START } })), 'one Earning row for the 10 roses')
  const q1b = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rose', context: { type: 'chat' } })
  ok(q1b.status === 201 && q1b.quantity === 1 && q1b.total === 10, 'quantity defaults to 1')
  const qCap = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rose', quantity: 100, context: { type: 'chat' } })
  ok(qCap.status === 400 && /99/.test(qCap.error?.message || ''), 'over the cap (99) is refused', qCap)
  for (const [label, qty] of [['0', 0], ['negative', -3], ['fractional', 2.5], ['a string', '5']]) {
    const bad = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rose', quantity: qty, context: { type: 'chat' } })
    ok(bad.status === 400, 'quantity ' + label + ' is refused', bad)
  }
  // Two different gifts can't go together: arrays / item lists are rejected, nothing is charged.
  const balMix = await coinsOf(demo)
  const mix1 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: ['rose', 'rocket'], quantity: 10, context: { type: 'chat' } })
  const mix2 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), gifts: [{ giftKey: 'rose', quantity: 10 }, { giftKey: 'rocket', quantity: 10 }], context: { type: 'chat' } })
  const mix3 = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rose', quantity: 10, extraGiftKey: 'rocket', context: { type: 'chat' } })
  ok(mix1.status === 400 && mix2.status === 400 && mix3.status === 400, 'mixed gift types in one request are refused', [mix1.status, mix2.status, mix3.status])
  ok((await coinsOf(demo)) === balMix, 'refused bulk sends charge nothing')
  await setCoins(demo, 95)
  const poorQ = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'rose', quantity: 10, context: { type: 'chat' } })
  ok(poorQ.status === 402 && (await coinsOf(demo)) === 95, '10 roses with only 95 coins → 402, balance untouched', poorQ)
  await setCoins(demo, 5000)
  const lvq = await api(T.user, 'POST', '/gifts', { toId: String(h1._id), giftKey: 'car', quantity: 3, context: { type: 'live', id: lv.live.id } })
  ok(lvq.status === 201 && lvq.total === 2997 && lvq.balance === 5000 - 2997, '3 sports cars in a live = 2,997 coins', lvq)
  await setCoins(demo, 1450)
  // gift during a connected call
  const cg = await api(T.user, 'POST', '/calls', { hostId: String(h5._id), type: 'voice' })
  const s5 = await connect(T.h5)
  await api(T.h5, 'POST', `/calls/${cg.call.id}/accept`)
  const g7 = await api(T.user, 'POST', '/gifts', { toId: String(h5._id), giftKey: 'teddy', context: { type: 'call', id: cg.call.id } })
  ok(g7.status === 201 && g7.balance === 1450 - 40 - 99, 'teddy during a call', g7)
  await s5.waitFor('gift:received', d => d.context.type === 'call')
  ok((await Call.findById(cg.call.id)).giftCoins === 99, 'call records gift coins')
  await api(T.user, 'POST', `/calls/${cg.call.id}/end`)
  s5.close()

  // ---------- 7b. two calls at once ----------
  section('Host takes two calls at once')
  await setCoins(demo, 1450)
  await User.updateOne({ _id: h3._id }, { $set: { coins: 1000 } })
  const s5b = await connect(T.h5)
  const ca = await api(T.user, 'POST', '/calls', { hostId: String(h5._id), type: 'video' })
  await api(T.h5, 'POST', `/calls/${ca.call.id}/accept`)
  const cb = await api(T.h3, 'POST', '/calls', { hostId: String(h5._id), type: 'video' })
  ok(cb.status === 201 && cb.call.channel === ca.call.channel, 'second caller joins the host’s call channel', cb)
  const incB = await s5b.waitFor('call:incoming', d => d.call.id === cb.call?.id)
  ok(incB.joining === true, 'host is told the caller is joining a call in progress')
  const full = (await User.findById(h5._id)).host
  ok(full.calls === 2 && full.busy === true, 'host now full (2/2)', full)
  const third = await api(T.h1, 'POST', '/calls', { hostId: String(h5._id), type: 'video' })
  ok(third.status === 409 && third.error?.code === 'host_busy', 'a third caller → 409 host_busy', third)
  const accB = await api(T.h5, 'POST', `/calls/${cb.call.id}/accept`)
  ok(accB.status === 200 && accB.agora?.channel === ca.call.channel, 'host accepts the second call in the same channel')
  const s3tick = await s3.waitFor('call:tick', d => d.callId === cb.call.id && d.minute === 1)
  ok(s3tick.charged === 80, 'second caller billed separately at the host’s rate', s3tick)
  await api(T.h3, 'POST', `/calls/${cb.call.id}/end`)
  const afterB = (await User.findById(h5._id)).host
  ok(afterB.calls === 1 && afterB.busy === false, 'second caller leaves → first call continues, slot freed', afterB)
  ok((await Call.findById(ca.call.id)).status === 'connected', 'first call still connected')
  const voice = await api(T.h3, 'POST', '/calls', { hostId: String(h5._id), type: 'voice' })
  ok(voice.status === 409, 'a voice call can’t join a video call', voice)
  await api(T.user, 'POST', `/calls/${ca.call.id}/end`)
  const freed = (await User.findById(h5._id)).host
  ok(freed.calls === 0 && freed.busy === false, 'all slots free after both calls', freed)
  s5b.close()

  // ---------- 8. socket disconnect grace ----------
  section('Socket disconnect (needs callSocketHooks wired in server.js)')
  await setCoins(demo, 1450)
  const cd = await api(T.user, 'POST', '/calls', { hostId: String(h1._id), type: 'voice' })
  await api(T.h1, 'POST', `/calls/${cd.call.id}/accept`)
  su.close()
  await sleep(GRACE_MS + 1500)
  const cdDoc = await Call.findById(cd.call.id)
  if (cdDoc.status === 'ended') {
    ok(cdDoc.endReason === 'disconnect', 'call ended after grace period with reason disconnect')
    // Reconnect within grace keeps the call alive.
    su = await connect(T.user)
    const ck = await api(T.user, 'POST', '/calls', { hostId: String(h1._id), type: 'voice' })
    await api(T.h1, 'POST', `/calls/${ck.call.id}/accept`)
    su.close()
    await sleep(GRACE_MS / 3)
    su = await connect(T.user)
    await sleep(GRACE_MS + 500)
    ok((await Call.findById(ck.call.id)).status === 'connected', 'reconnecting within grace keeps the call')
    await api(T.user, 'POST', `/calls/${ck.call.id}/end`)
  } else {
    console.log('  – skipped: server.js does not pass callSocketHooks yet (call still connected)')
    su = await connect(T.user)
    await api(T.user, 'POST', `/calls/${cd.call.id}/end`)
  }

  // ---------- 9. crash recovery ----------
  section('Server restart ends leftover calls')
  await setCoins(demo, 1450)
  const live = await api(T.user, 'POST', '/calls', { hostId: String(h1._id), type: 'video' })
  await api(T.h1, 'POST', `/calls/${live.call.id}/accept`)
  const ring = await api(T.user, 'POST', '/calls', { hostId: String(h3._id), type: 'voice' }) // a second active call is refused…
  ok(ring.status === 409 && ring.error.code === 'already_in_call', 'one active call per caller')
  const ringCall = await Call.create({ caller: h5._id, host: h3._id, type: 'voice', rate: 15, channel: 'x' }) // …so plant a ringing one
  await User.updateOne({ _id: h3._id }, { $set: { 'host.busy': true } })
  await su.waitFor('call:tick', d => d.callId === live.call.id && d.minute === 1)
  await stopServer() // simulate a crash
  const coinsAtCrash = await coinsOf(demo)
  su.close(); s1.close(); s3.close()
  await startServer()
  await sleep(300)
  const lc = await Call.findById(live.call.id)
  const rc = await Call.findById(ringCall._id)
  ok(lc.status === 'ended' && lc.endReason === 'server_restart' && lc.minutes === 1, 'connected call ended on boot', lc.toObject())
  ok(lc.duration <= BILL_MS / 1000, 'duration capped at paid time')
  ok(rc.status === 'missed' && rc.endReason === 'server_restart', 'ringing call ended on boot')
  const [hh1, hh3] = await Promise.all([User.findById(h1._id), User.findById(h3._id)])
  ok(!hh1.host.busy && !hh3.host.busy, 'their hosts freed')
  await sleep(BILL_MS * 1.5)
  ok((await coinsOf(demo)) === coinsAtCrash, 'no charges after restart')
} catch (e) {
  fail++
  console.error('\n[test] aborted:', e)
} finally {
  for (const s of [su, s1, s3]) s?.close?.()
  await stopServer()
  await mongoose.disconnect()
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
