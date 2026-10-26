// End-to-end checks for moments, store/VIP/royal/diamonds, tasks, families,
// leaderboard, visitors, greetings and notifications, against a running server.
//   MONGO_URI=<test db> PORT=4205 npm start      (in another shell)
//   MONGO_URI=<test db> PORT=4205 node scripts/test-social.js
// Normally run through `npm test`, which gives it a fresh seeded database.
import { io } from 'socket.io-client'
import { connectDb, disconnectDb } from '../src/config/db.js'
import { loadConfig } from '../src/modules/config/config.service.js'
import { signUserToken } from '../src/core/auth.js'
import { User } from '../src/modules/users/user.model.js'
import { creditCoins } from '../src/modules/wallet/economy.service.js'
import { Live } from '../src/modules/lives/live.model.js'

// Never run against the dev database by accident: these tests spend coins.
if (/\/rebu(\?|$)/.test(process.env.MONGO_URI || '') && !process.env.FORCE) {
  console.error('Refusing to run against the dev database (rebu). Use npm test, or set FORCE=1.')
  process.exit(1)
}

const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 4205}`
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

const phones = { demo: '9999999999', h1: '9000000001', h2: '9000000002' }
const U = {}
for (const [k, phone] of Object.entries(phones)) {
  const u = await User.findOne({ phone })
  if (!u) throw new Error(`Missing seed user ${phone} — run npm run seed`)
  U[k] = { id: String(u._id), token: signUserToken(u), events: [] }
}
// A second ordinary user (rooms, families).
const u2 = await User.findOneAndUpdate(
  { phone: '9111100002' },
  { $setOnInsert: { phone: '9111100002', name: 'Kabir', gender: 'Male', dob: new Date('1998-01-01'), profileDone: true } },
  { upsert: true, returnDocument: 'after' },
)
U.u2 = { id: String(u2._id), token: signUserToken(u2), events: [] }
for (const k of ['demo', 'u2']) await creditCoins(U[k].id, 20000, { type: 'admin_adjust', title: 'test top-up' })

async function api(who, method, path, body) {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(who && { authorization: `Bearer ${U[who].token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await r.json().catch(() => ({}))
  return { status: r.status, ...json }
}
const coinsOf = async k => (await User.findById(U[k].id, { coins: 1 })).coins

// Sockets (for notification:new).
for (const [k, u] of Object.entries(U)) {
  u.socket = io(BASE, { auth: { token: u.token }, transports: ['websocket'] })
  u.socket.onAny((event, payload) => u.events.push({ event, payload }))
  await new Promise((res, rej) => {
    u.socket.once('connect', res)
    u.socket.once('connect_error', e => rej(new Error(`${k} socket: ${e.message}`)))
  })
}
async function waitFor(who, event, pred = () => true, ms = 2000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (U[who].events.some(e => e.event === event && pred(e.payload))) return true
    await sleep(25)
  }
  return false
}

// ---------------------------------------------------------------- moments
console.log('moments')
let r = await api('h1', 'POST', '/moments', { text: '', photos: [] })
ok(r.status === 400, 'empty moment rejected', r.status)
r = await api('h1', 'POST', '/moments', { text: 'Call me on 98765 43210', photos: [] })
ok(r.status === 400 && r.error?.code === 'content_blocked', 'phone number in moment blocked', r)
r = await api('h1', 'POST', '/moments', { text: 'Sunday vibes ☀️', topic: 'love', photos: ['https://picsum.photos/id/64/600/800'] })
ok(r.status === 201 && r.moment?.mine && r.moment.media.length === 1, 'host posts a moment', r)
const momentId = r.moment?.id
r = await api('demo', 'GET', '/moments?tab=all')
ok(r.items?.some(m => m.id === momentId && !m.mine && m.author?.id === U.h1.id), 'feed shows it with author', r.items?.length)
r = await api('demo', 'GET', '/moments?tab=following')
ok(!r.items?.some(m => m.id === momentId), 'following tab hides hosts you don’t follow')
await api('demo', 'POST', `/me/following/${U.h1.id}`)
r = await api('demo', 'GET', '/moments?tab=following')
ok(r.items?.some(m => m.id === momentId), 'following tab shows it after following')
ok(await waitFor('h1', 'notification:new', p => p.notification.kind === 'follow'), 'host notified of the follow')
r = await api('demo', 'GET', '/moments?topic=love')
ok(r.items?.some(m => m.id === momentId), 'topic filter')
r = await api('demo', 'POST', `/moments/${momentId}/like`)
ok(r.liked && r.likes === 1, 'like', r)
r = await api('demo', 'POST', `/moments/${momentId}/like`)
ok(r.likes === 1, 'liking twice counts once', r)
ok(await waitFor('h1', 'notification:new', p => p.notification.kind === 'moment'), 'author notified of the like')
r = await api('demo', 'GET', '/moments')
ok(r.items?.find(m => m.id === momentId)?.liked === true, 'feed marks it liked')
r = await api('demo', 'POST', `/moments/${momentId}/comments`, { text: 'Beautiful 😍' })
ok(r.status === 201 && r.comments === 1, 'comment', r)
const commentId = r.comment?.id
r = await api('u2', 'GET', `/moments/${momentId}/comments`)
ok(r.items?.length === 1 && r.items[0].user?.id === U.demo.id, 'comments list', r)
r = await api('u2', 'DELETE', `/moments/${momentId}/comments/${commentId}`)
ok(r.status === 403, 'others can’t delete my comment', r.status)
r = await api('h1', 'DELETE', `/moments/${momentId}/comments/${commentId}`)
ok(r.ok, 'author removes a comment on their moment', r)
r = await api('demo', 'DELETE', `/moments/${momentId}/like`)
ok(r.liked === false && r.likes === 0, 'unlike', r)
r = await api('demo', 'DELETE', `/moments/${momentId}`)
ok(r.status === 403, 'can’t delete someone else’s moment', r.status)
r = await api('h1', 'GET', '/moments?tab=mine')
ok(r.items?.length >= 1 && r.items.every(m => m.mine), 'mine tab')
r = await api('h1', 'DELETE', `/moments/${momentId}`)
ok(r.ok, 'delete own moment')
r = await api('demo', 'GET', '/moments')
ok(!r.items?.some(m => m.id === momentId), 'deleted moment leaves the feed')

// ---------------------------------------------------------------- store
console.log('store')
r = await api('demo', 'GET', '/store')
ok(r.items?.length > 0 && r.vipTiers?.length > 0 && r.royalClub?.[0]?.coinsBack > 0, 'catalog', r.items?.length)
const item = r.items.find(i => i.category === 'frame')
let before = await coinsOf('demo')
r = await api('demo', 'POST', `/store/items/${item.id}/buy`)
ok(r.status === 201 && r.equipped?.frame === item.id && r.balance === before - item.price, 'buy frame → equipped, coins taken', r)
const firstExpiry = new Date(r.owned.find(o => o.itemId === item.id).expiresAt)
r = await api('demo', 'POST', `/store/items/${item.id}/buy`)
const secondExpiry = new Date(r.owned.find(o => o.itemId === item.id).expiresAt)
ok(secondExpiry - firstExpiry > 6 * 86400000, 'buying again extends it', { firstExpiry, secondExpiry })
r = await api('demo', 'POST', '/store/equip', { category: 'frame', itemId: null })
ok(r.equipped?.frame === null, 'unequip')
r = await api('demo', 'POST', '/store/equip', { category: 'entry', itemId: 's4' })
ok(r.status === 400, 'can’t equip what you don’t own', r.status)
r = await api('h2', 'GET', `/hosts/${U.h1.id}`) // sanity: public profile still works
r = await api('demo', 'POST', '/store/vip', { level: 2 })
ok(r.status === 201 && r.vip?.level === 2, 'VIP 2 for coins', r)
r = await api('demo', 'POST', '/store/vip', { level: 1 })
ok(r.status === 409 && r.error?.code === 'vip_higher', 'no downgrade while VIP 2 is active', r)
before = await coinsOf('demo')
r = await api('demo', 'POST', '/store/royal', { key: 'silver' })
ok(r.status === 201 && r.royal?.key === 'silver' && r.balance === before - 4999 + 300, 'royal silver with 300 coins back', { balance: r.balance, before })
r = await api('demo', 'POST', '/store/royal', { key: 'nope' })
ok(r.status === 404, 'unknown royal tier 404')
r = await api('demo', 'GET', `/me`)
ok(r.user?.royal?.key === 'silver' && r.user?.vip?.level === 2, '/me carries VIP + royal')

// ---------------------------------------------------------------- rooms: gifts to non-hosts → diamonds
console.log('diamonds')
await Live.updateMany({ owner: U.u2.id, status: 'live' }, { $set: { status: 'ended', endedAt: new Date() } })
r = await api('u2', 'POST', '/lives', { mode: 'party', title: 'Kabir’s room' })
ok(r.status === 201, 'non-host opens a party room', r)
const roomId = r.live?.id
await api('demo', 'POST', `/lives/${roomId}/join`)
before = await coinsOf('demo')
r = await api('demo', 'POST', '/gifts', { toId: U.u2.id, giftKey: 'heart', context: { type: 'live', id: roomId } })
ok(r.status === 201 && r.balance === before - 20, 'gift a non-host in a room', r)
let k = await User.findById(U.u2.id, { diamonds: 1 })
ok(k.diamonds === 20, 'receiver got 20 diamonds', k.diamonds)
r = await api('demo', 'POST', '/gifts', { toId: U.u2.id, giftKey: 'heart', context: { type: 'chat' } })
ok(r.status === 404, 'non-hosts can’t get gifts outside rooms', r.status)
before = await coinsOf('u2')
r = await api('u2', 'POST', '/store/diamonds/exchange', { diamonds: 15 })
ok(r.status === 201 && r.coins === 7 && r.diamondsSpent === 14 && r.diamonds === 6 && r.balance === before + 7, 'swap 15 diamonds → 7 coins (14 used)', r)
r = await api('u2', 'POST', '/store/diamonds/exchange', { diamonds: 100 })
ok(r.status === 400, 'can’t swap more than you have', r.status)
await api('u2', 'POST', `/lives/${roomId}/end`)

// ---------------------------------------------------------------- greetings + tasks
console.log('greetings + tasks')
r = await api('u2', 'POST', `/social/greet/${U.h1.id}`, { text: 'Hi 👋' })
ok(r.status === 201, 'say hi (free)', r)
r = await api('u2', 'POST', `/social/greet/${U.h1.id}`, { text: 'Hello again' })
ok(r.status === 409 && r.error?.code === 'already_greeted', 'only once per person', r)
r = await api('u2', 'GET', '/social/greeted')
ok(r.ids?.includes(U.h1.id), 'greeted list')
r = await api('u2', 'GET', '/tasks')
const greet = r.user?.find(t => t.id === 'greet3')
ok(greet?.progress === 1 && !greet.claimed, 'greeting counts toward the task', greet)
r = await api('u2', 'POST', '/tasks/greet3/claim')
ok(r.status === 400, 'can’t claim before finishing', r.status)
before = await coinsOf('u2')
r = await api('u2', 'POST', '/tasks/checkin/claim')
ok(r.status === 201 && r.balance === before + 10, 'claim check-in +10', r)
r = await api('u2', 'POST', '/tasks/checkin/claim')
ok(r.status === 409, 'claim twice → 409', r.status)
r = await api('u2', 'GET', '/tasks')
ok(r.user.find(t => t.id === 'checkin').claimed && r.host.length === 0, 'board marks claimed; no host tasks for users')
r = await api('demo', 'GET', '/tasks')
ok(r.user.find(t => t.id === 'gift1')?.progress === 1, 'gift sent today counts')
r = await api('h1', 'GET', '/tasks')
ok(r.host?.length === 3, 'hosts see host tasks', r.host?.length)
r = await api('h1', 'POST', '/tasks/h_calls/claim')
ok(r.status === 400, 'host task not done yet', r.status)

// ---------------------------------------------------------------- families
console.log('families')
before = await coinsOf('demo')
r = await api('demo', 'POST', '/families', { name: 'Star Talent', emoji: '⭐', desc: 'Friendly people' })
ok(r.status === 201 && r.family?.members === 1, 'create a family', r)
const famId = r.family?.id
ok((await coinsOf('demo')) === before - 1000, 'creation costs 1000 coins')
r = await api('u2', 'POST', '/families', { name: 'star talent' })
ok(r.status === 409 && r.error?.code === 'name_taken', 'names are unique (case-insensitive)', r)
before = await coinsOf('u2')
r = await api('u2', 'POST', `/families/${famId}/join`)
ok(r.family?.members === 2 && r.reward === 50, 'join + first-join reward', r)
ok((await coinsOf('u2')) === before + 50, 'reward credited')
r = await api('u2', 'POST', `/families/${famId}/join`)
ok(r.status === 409, 'can’t join twice', r.status)
await api('u2', 'POST', '/gifts', { toId: U.h1.id, giftKey: 'rose', context: { type: 'chat' } })
await sleep(200)
r = await api('u2', 'GET', `/families/${famId}`)
ok(r.family?.weekly === 10 && r.members?.length === 2, 'member gifts count toward the week', r.family)
r = await api('u2', 'GET', '/families')
ok(r.mine === famId && r.items?.[0]?.id === famId, 'list shows mine')
r = await api('u2', 'POST', '/families/leave')
ok(r.ok, 'leave')
before = await coinsOf('u2')
r = await api('u2', 'POST', `/families/${famId}/join`)
ok(r.reward === 0 && (await coinsOf('u2')) === before, 'no second join reward', r)
r = await api('u2', 'PATCH', `/families/${famId}`, { desc: 'mine now' })
ok(r.status === 403, 'only the owner edits', r.status)
await api('demo', 'POST', '/families/leave')
r = await api('u2', 'GET', `/families/${famId}`)
ok(r.family?.owner === U.u2.id, 'owner leaving hands the family over', r.family)

// ---------------------------------------------------------------- visitors + leaderboard
console.log('visitors + leaderboard')
await api('u2', 'GET', `/hosts/${U.h1.id}`)
await api('u2', 'GET', `/hosts/${U.h1.id}`)
await sleep(100)
r = await api('h1', 'GET', '/social/visitors')
const v = r.items?.find(x => x.user.id === U.u2.id)
ok(v?.times === 2 && r.locked === true, 'visitors list (locked for non-VIP)', r)
r = await api('h1', 'GET', '/social/leaderboard?type=hosts&period=day')
ok(r.items?.[0]?.user?.id === U.h1.id && r.items[0].score > 0, 'host leaderboard', r.items?.[0])
r = await api('h1', 'GET', '/social/leaderboard?type=givers&period=week')
ok(r.items?.some(i => i.user.id === U.u2.id), 'givers leaderboard')

// ---------------------------------------------------------------- notifications
console.log('notifications')
r = await api('h1', 'GET', '/notifications')
ok(r.unread >= 2 && r.items?.some(n => n.kind === 'follow') && r.items.some(n => n.kind === 'gift'), 'inbox has follow + gift', r.items?.map(n => n.kind))
r = await api('h1', 'POST', '/notifications/read', {})
ok(r.updated >= 2, 'mark all read')
r = await api('h1', 'GET', '/notifications')
ok(r.unread === 0, 'unread is 0')
// Admin broadcast → every targeted user's inbox.
const login = await fetch(`${BASE}/api/auth/admin/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@rebu.app', password: 'admin123' }),
}).then(x => x.json())
r = await fetch(`${BASE}/api/admin/content/notifications`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
  body: JSON.stringify({ title: 'Weekend bonus', body: '20% extra coins', audience: 'All hosts', sendNow: true }),
}).then(x => x.json())
ok(r.notification?.status === 'sent', 'admin sends a broadcast', r)
ok(await waitFor('h2', 'notification:new', p => p.notification.title === 'Weekend bonus', 3000), 'host gets it live')
r = await api('h2', 'GET', '/notifications')
ok(r.items?.some(n => n.kind === 'promo' && n.title === 'Weekend bonus'), 'in the host’s inbox')
r = await api('u2', 'GET', '/notifications')
ok(!r.items?.some(n => n.title === 'Weekend bonus'), 'not sent to users outside the audience')

// ---------------------------------------------------------------- admin moment moderation
console.log('admin moments')
const adminApi = (method, path, body) =>
  fetch(`${BASE}/api/admin${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${login.token}` },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }))
r = await api('h2', 'POST', '/moments', { text: 'Join my live tonight at 9!', photos: [] })
const m2 = r.moment?.id
r = await api('u2', 'POST', '/reports', { targetType: 'moment', targetId: m2, reason: 'Spam' })
ok(r.status === 201, 'user reports a moment', r)
r = await adminApi('GET', '/moments?status=flagged')
ok(r.items?.some(m => m.id === m2 && m.status === 'flagged' && m.reports === 1 && m.isHost) && r.counts?.flagged >= 1, 'admin sees it flagged', r)
r = await adminApi('POST', `/moments/${m2}/remove`, { reason: 'Spam' })
ok(r.moment?.status === 'removed', 'admin removes it')
ok(await waitFor('h2', 'notification:new', p => p.notification.title === 'Your moment was removed'), 'author told why')
r = await api('demo', 'GET', '/moments')
ok(!r.items?.some(m => m.id === m2), 'removed moment hidden from the feed')
r = await adminApi('POST', `/moments/${m2}/approve`)
ok(r.moment?.status === 'published' && r.moment.reports === 0, 'admin restores it')
r = await api('u2', 'POST', '/reports', { targetType: 'moment', targetId: '6a0000000000000000000000', reason: 'Spam' })
ok(r.status === 404, 'reporting a missing moment → 404', r.status)

// ---------------------------------------------------------------- profile, connections, blocking, verification
console.log('profile + verification')
r = await api('u2', 'PATCH', '/me', { bio: 'whatsapp me 98765 43210' })
ok(r.status === 400 && r.error?.code === 'content_blocked', 'contact details blocked in bio', r)
r = await api('u2', 'PATCH', '/me', { job: 'Designer', interests: ['music', 'travel'] })
ok(r.user?.job === 'Designer' && r.user?.interests?.length === 2, 'job + interests saved', r.user)
r = await api('h1', 'GET', '/me/connections?tab=followers')
ok(r.items?.some(u => u.id === U.demo.id), 'followers list has demo', r.items?.map(u => u.id))
r = await api('demo', 'GET', '/me/connections?tab=following')
ok(r.items?.some(u => u.id === U.h1.id), 'following list has h1')
await api('u2', 'POST', `/me/blocked/${U.h2.id}`)
r = await api('u2', 'GET', '/me/blocked')
ok(r.items?.some(u => u.id === U.h2.id), 'blocked list')
r = await api('u2', 'DELETE', `/me/blocked/${U.h2.id}`)
r = await api('u2', 'GET', '/me/blocked')
ok(!r.items?.some(u => u.id === U.h2.id), 'unblock')
r = await api('u2', 'POST', '/me/verification', { selfie: 'https://picsum.photos/id/1/600/600' })
ok(r.status === 201 && r.verification?.status === 'pending', 'verification requested', r)
r = await adminApi('GET', '/users?verification=pending')
ok(r.items?.some(u => u.id === U.u2.id && u.verification?.selfie), 'admin sees pending selfie', r.items?.length)
r = await adminApi('PATCH', `/users/${U.u2.id}`, { verified: true })
ok(r.user?.verified === true, 'admin grants the blue tick')
ok(await waitFor('u2', 'notification:new', p => p.notification.title.startsWith('You’re verified')), 'user told')
r = await api('u2', 'GET', '/me')
ok(r.user?.verified && r.user?.verification?.status === 'none', 'request closed', r.user?.verification)

// ---------------------------------------------------------------- reviewer login + config secrecy
console.log('reviewer login')
const cfg = await adminApi('GET', '/config')
const settings = cfg.config.settings
r = await adminApi('PUT', '/config/settings', { ...settings, otp: { ...settings.otp, testNumber: '9876500001', testOtp: '424242' } })
ok(r.value?.otp?.testOtp === '424242', 'admin sets a reviewer number', r.error)
r = await api(null, 'GET', '/config')
ok(r.settings?.otp && !('testOtp' in r.settings.otp) && !('testNumber' in r.settings.otp), 'reviewer code never reaches apps', r.settings?.otp)
r = await api(null, 'POST', '/auth/otp/send', { phone: '9876500001' })
ok(r.ok, 'reviewer requests a code (no SMS)', r)
r = await api(null, 'POST', '/auth/otp/verify', { phone: '9876500001', code: '424242' })
ok(!!r.token, 'reviewer signs in with the fixed code', r.error)
await adminApi('PUT', '/config/settings', settings)

for (const u of Object.values(U)) u.socket.close()
await disconnectDb()
console.log(`${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
